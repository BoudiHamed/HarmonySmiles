export const CLINIC_TIMEZONE = 'Europe/Zurich';
// Current date/time in the clinic's timezone, regardless of the server's own.
export const getClinicNow = () => {
    return new Date(new Date().toLocaleString('en-US', { timeZone: CLINIC_TIMEZONE }));
};
const CLOSED_WEEKDAYS = [0, 6]; // Sunday, Saturday
export const isClinicClosedOn = (date) => {
    return CLOSED_WEEKDAYS.includes(date.getDay());
};
// Latest calendar date (clinic-local, time-of-day ignored) a new appointment may be booked for.
// "Same day next month", clamped to that month's last day — a naive `getMonth() + 1` on e.g. Jan 31
// would otherwise overflow into March (Feb only has 28/29 days), silently widening the 1-month window.
export const getMaxBookableDate = () => {
    const now = getClinicNow();
    const targetMonth = now.getMonth() + 1;
    const lastDayOfTargetMonth = new Date(now.getFullYear(), targetMonth + 1, 0).getDate();
    return new Date(now.getFullYear(), targetMonth, Math.min(now.getDate(), lastDayOfTargetMonth));
};
const pad = (n) => n.toString().padStart(2, '0');
const toISODate = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
// Today's calendar date (clinic-local, time-of-day ignored) as 'YYYY-MM-DD'.
export const getClinicTodayISODate = () => toISODate(getClinicNow());
// Clinic-local "now" split into a 'YYYY-MM-DD' date and 'HH:MM:SS' time, for comparing
// against stored appointment_date/appointment_time columns without a Date round-trip.
export const getClinicNowDateTime = () => {
    const now = getClinicNow();
    return {
        date: toISODate(now),
        time: `${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`,
    };
};
// Whether clinic-local "now" is at or past a given appointment's date+time.
export const hasAppointmentDateTimePassed = (date, time) => {
    const [yearStr, monthStr, dayStr] = date.split('-');
    const [hourStr, minuteStr, secondStr = '0'] = time.split(':');
    const appointmentDateTime = new Date(Number(yearStr), Number(monthStr) - 1, Number(dayStr), Number(hourStr), Number(minuteStr), Number(secondStr));
    return getClinicNow() >= appointmentDateTime;
};
// Inclusive [from, to] calendar-date bounds (YYYY-MM-DD, clinic-local) for an admin dashboard date-range preset.
// "week" is the current ISO week (Monday-Sunday); "month" is the current calendar month.
// "upcoming"/"previous" are open-ended (only one bound set) — today and forward, or strictly before today.
export const getDateRangeForPreset = (preset) => {
    const now = getClinicNow();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    switch (preset) {
        case 'today':
            return { from: toISODate(today), to: toISODate(today) };
        case 'tomorrow': {
            const tomorrow = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1);
            return { from: toISODate(tomorrow), to: toISODate(tomorrow) };
        }
        case 'week': {
            const daysSinceMonday = (today.getDay() + 6) % 7;
            const monday = new Date(today.getFullYear(), today.getMonth(), today.getDate() - daysSinceMonday);
            const sunday = new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + 6);
            return { from: toISODate(monday), to: toISODate(sunday) };
        }
        case 'month': {
            const firstOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
            const lastOfMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0);
            return { from: toISODate(firstOfMonth), to: toISODate(lastOfMonth) };
        }
        case 'upcoming':
            return { from: toISODate(today) };
        case 'previous': {
            const yesterday = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 1);
            return { to: toISODate(yesterday) };
        }
    }
};
//# sourceMappingURL=clinicTime.js.map