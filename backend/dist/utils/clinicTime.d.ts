export declare const CLINIC_TIMEZONE = "Europe/Zurich";
export declare const getClinicNow: () => Date;
export declare const isClinicClosedOn: (date: Date) => boolean;
export declare const getMaxBookableDate: () => Date;
export type DateRangePreset = 'today' | 'tomorrow' | 'week' | 'month' | 'upcoming' | 'previous';
export declare const getClinicTodayISODate: () => string;
export declare const getClinicNowDateTime: () => {
    date: string;
    time: string;
};
export declare const hasAppointmentDateTimePassed: (date: string, time: string) => boolean;
export declare const getDateRangeForPreset: (preset: DateRangePreset) => {
    from?: string;
    to?: string;
};
//# sourceMappingURL=clinicTime.d.ts.map