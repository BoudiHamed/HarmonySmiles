import { z } from "zod";

const currentYear = new Date().getFullYear();

export const createAppointmentSchema = z
  .object({
    body: z
      .object({
        // ============================
        // Patient Information
        // ============================

        full_name: z
          .string({
            error: "Full name is required",
          })
          .trim()
          .min(3, "Full name must be at least 3 characters")
          .max(100, "Full name must be less than 100 characters"),

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

    const formatter = new Intl.DateTimeFormat("en-US", {
      timeZone: "Africa/Cairo",
      year: "numeric",
      month: "numeric",
      day: "numeric",
      hour: "numeric",
      minute: "numeric",
      second: "numeric",
      hour12: false,
    });

    const parts = formatter.formatToParts(new Date());
    const getPart = (type: string) => parseInt(parts.find((p) => p.type === type)!.value, 10);

    const year = getPart("year");
    const month = getPart("month") - 1;
    const day = getPart("day");
    const hour = getPart("hour") === 24 ? 0 : getPart("hour");
    const minute = getPart("minute");
    const second = getPart("second");

    const nowInCairo = new Date(year, month, day, hour, minute, second);

    if (appointment <= nowInCairo) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["body", "appointment_date"],
        message: "Appointment must be in the future",
      });
    }
  });