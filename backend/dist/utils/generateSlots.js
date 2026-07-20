import { getClinicNow } from './clinicTime.js';
const CLINIC_OPEN_HOUR = 10;
const CLINIC_CLOSE_HOUR = 18;
const SLOT_MINUTES = 30;
const SUNDAY = 0;
const pad = (n) => n.toString().padStart(2, '0');
// Free 30-min slots ("HH:MM:SS") for `date`, 10:00-18:00 clinic time. Sunday closed; past slots excluded for today.
export const generateAvailableSlots = (date, bookedTimes) => {
    const [yearStr, monthStr, dayStr] = date.split('-');
    const targetDate = new Date(Number(yearStr), Number(monthStr) - 1, Number(dayStr));
    if (targetDate.getDay() === SUNDAY) {
        return [];
    }
    const now = getClinicNow();
    const isToday = targetDate.toDateString() === now.toDateString();
    const nowMinutes = now.getHours() * 60 + now.getMinutes();
    const slotCount = ((CLINIC_CLOSE_HOUR - CLINIC_OPEN_HOUR) * 60) / SLOT_MINUTES;
    const dayMinutes = Array.from({ length: slotCount }, (_, i) => CLINIC_OPEN_HOUR * 60 + i * SLOT_MINUTES);
    return dayMinutes
        .filter((minutes) => !isToday || minutes > nowMinutes)
        .map((minutes) => `${pad(Math.floor(minutes / 60))}:${pad(minutes % 60)}:00`)
        .filter((time) => !bookedTimes.includes(time));
};
//# sourceMappingURL=generateSlots.js.map