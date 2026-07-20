import { z } from 'zod';
export declare const listAppointmentsSchema: z.ZodObject<{
    query: z.ZodObject<{
        status: z.ZodOptional<z.ZodEnum<{
            Pending: "Pending";
            Confirmed: "Confirmed";
            Cancelled: "Cancelled";
            Completed: "Completed";
            NoShow: "NoShow";
        }>>;
        search: z.ZodOptional<z.ZodString>;
    }, z.core.$strict>;
}, z.core.$strip>;
export declare const appointmentIdParamSchema: z.ZodObject<{
    params: z.ZodObject<{
        id: z.ZodCoercedNumber<unknown>;
    }, z.core.$strict>;
}, z.core.$strip>;
//# sourceMappingURL=admin.validator.d.ts.map