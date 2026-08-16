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
        date_range: z.ZodOptional<z.ZodEnum<{
            today: "today";
            tomorrow: "tomorrow";
            week: "week";
            month: "month";
            upcoming: "upcoming";
            previous: "previous";
        }>>;
    }, z.core.$strict>;
}, z.core.$strip>;
export declare const listPatientsSchema: z.ZodObject<{
    query: z.ZodObject<{
        search: z.ZodOptional<z.ZodString>;
    }, z.core.$strict>;
}, z.core.$strip>;
export declare const appointmentIdParamSchema: z.ZodObject<{
    params: z.ZodObject<{
        id: z.ZodCoercedNumber<unknown>;
    }, z.core.$strict>;
}, z.core.$strip>;
export declare const patientIdParamSchema: z.ZodObject<{
    params: z.ZodObject<{
        id: z.ZodCoercedNumber<unknown>;
    }, z.core.$strict>;
}, z.core.$strip>;
//# sourceMappingURL=admin.validator.d.ts.map