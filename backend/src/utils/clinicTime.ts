export const CLINIC_TIMEZONE = 'Europe/Zurich';

// Current date/time in the clinic's timezone, regardless of the server's own.
export const getClinicNow = (): Date => {
  return new Date(new Date().toLocaleString('en-US', { timeZone: CLINIC_TIMEZONE }));
};

const CLOSED_WEEKDAYS = [0, 6]; // Sunday, Saturday

export const isClinicClosedOn = (date: Date): boolean => {
  return CLOSED_WEEKDAYS.includes(date.getDay());
};

// Latest calendar date (clinic-local, time-of-day ignored) a new appointment may be booked for.
export const getMaxBookableDate = (): Date => {
  const now = getClinicNow();
  return new Date(now.getFullYear(), now.getMonth() + 1, now.getDate());
};

export type DateRangePreset = 'today' | 'tomorrow' | 'week' | 'month';

const pad = (n: number): string => n.toString().padStart(2, '0');
const toISODate = (d: Date): string => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

// Inclusive [from, to] calendar-date bounds (YYYY-MM-DD, clinic-local) for an admin dashboard date-range preset.
// "week" is the current ISO week (Monday-Sunday); "month" is the current calendar month.
export const getDateRangeForPreset = (preset: DateRangePreset): { from: string; to: string } => {
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
  }
};
