export const CLINIC_TIMEZONE = 'Europe/Zurich';

// Current date/time in the clinic's timezone, regardless of the server's own.
export const getClinicNow = (): Date => {
  return new Date(new Date().toLocaleString('en-US', { timeZone: CLINIC_TIMEZONE }));
};
