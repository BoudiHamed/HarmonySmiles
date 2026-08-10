import { z } from "zod";
import { getClinicNow, getMaxBookableDate, isClinicClosedOn } from "../../utils/clinicTime.js";

const currentYear = new Date().getFullYear();

export const createAppointmentSchema = z
  .object({
    body: z
      .object({
        // ============================
        // Patient Information
        // ============================

        first_name: z
          .string({
            error: "First name is required",
          })
          .trim()
          .min(3, "First name must be at least 3 characters")
          .max(50, "First name must be less than 50 characters"),

        last_name: z
          .string({
            error: "Last name is required",
          })
          .trim()
          .min(3, "Last name must be at least 3 characters")
          .max(50, "Last name must be less than 50 characters"),

        phone: z
          .string({
            error: "Phone number is required",
          })
          .trim()
          .regex(/^\+?[0-9]{10,15}$/, {
            message: "Invalid phone number",
          }),

        birth_year: z
          .coerce
          .number({
            error: "Birth year is required",
          })
          .int("Birth year must be an integer")
          .min(1900, "Birth year must be after 1900")
          .max(currentYear, `Birth year cannot exceed ${currentYear}`),

        gender: z.enum(["Male", "Female"], {
          error: "Gender must be Male or Female",
        }),

        email: z
          .union([
            z.string().trim().email("Invalid email address"),
            z.literal(""),
          ])
          .optional(),

        // ============================
        // Appointment Information
        // ============================

        appointment_date: z
          .string({
            error: "Appointment date is required",
          })
          .regex(/^\d{4}-\d{2}-\d{2}$/, {
            message: "Date must be in YYYY-MM-DD format",
          }),

        appointment_time: z
          .string({
            error: "Appointment time is required",
          })
          .regex(
            /^([01]\d|2[0-3]):([0-5]\d):([0-5]\d)$/,
            {
              message: "Time must be in HH:MM:SS format",
            }
          ),

        visit_reason: z
          .string()
          .trim()
          .max(500, "Visit reason must not exceed 500 characters")
          .optional(),

        notes: z
          .string()
          .trim()
          .max(1000, "Notes must not exceed 1000 characters")
          .optional(),
      })
      .strict(),
  })
  .superRefine((data, ctx) => {
    const appointment = new Date(
      `${data.body.appointment_date}T${data.body.appointment_time}`
    );

    if (isNaN(appointment.getTime())) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["body", "appointment_date"],
        message: "Invalid appointment date or time",
      });

      return;
    }

    const nowInClinicTimezone = getClinicNow();

    if (appointment <= nowInClinicTimezone) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["body", "appointment_date"],
        message: "Appointment must be in the future",
      });
    }

    const [yearStr, monthStr, dayStr] = data.body.appointment_date.split("-");
    const appointmentDateOnly = new Date(
      Number(yearStr),
      Number(monthStr) - 1,
      Number(dayStr)
    );

    if (isClinicClosedOn(appointmentDateOnly)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["body", "appointment_date"],
        message: "Clinic is closed on Saturdays and Sundays",
      });
    }

    if (appointmentDateOnly > getMaxBookableDate()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["body", "appointment_date"],
        message: "Appointments can only be booked up to 1 month in advance",
      });
    }
  });