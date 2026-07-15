import { z } from "zod";
export declare const createAppointmentSchema: z.ZodObject<{
    body: z.ZodObject<{
        full_name: z.ZodString;
        phone: z.ZodString;
        birth_year: z.ZodCoercedNumber<unknown>;
        gender: z.ZodEnum<{
            Male: "Male";
            Female: "Female";
        }>;
        email: z.ZodOptional<z.ZodUnion<readonly [z.ZodString, z.ZodLiteral<"">]>>;
        appointment_date: z.ZodString;
        appointment_time: z.ZodString;
        visit_reason: z.ZodOptional<z.ZodString>;
        notes: z.ZodOptional<z.ZodString>;
    }, z.core.$strict>;
}, z.core.$strip>;
//# sourceMappingURL=appointment.validator.d.ts.map