import { z } from 'zod';
import { getClinicNow } from '../../utils/clinicTime.js';

export const availableSlotsSchema = z
  .object({
    query: z
      .object({
        date: z
          .string({ error: 'Date is required' })
          .regex(/^\d{4}-\d{2}-\d{2}$/, { message: 'Date must be in YYYY-MM-DD format' }),
      })
      .strict(),
  })
  .superRefine((data, ctx) => {
    const [yearStr, monthStr, dayStr] = data.query.date.split('-');
    const requestedDate = new Date(Number(yearStr), Number(monthStr) - 1, Number(dayStr));

    if (isNaN(requestedDate.getTime())) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['query', 'date'],
        message: 'Invalid date',
      });

      return;
    }

    const now = getClinicNow();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    if (requestedDate < today) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['query', 'date'],
        message: 'Date must not be in the past',
      });
    }
  });
