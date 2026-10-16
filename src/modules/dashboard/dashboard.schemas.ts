import { z } from 'zod';

const timeZone = z.string().trim().min(1).max(100).refine((value) => {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: value });
    return true;
  } catch {
    return false;
  }
}, 'Invalid time zone');

export const adminDashboardQuerySchema = z.object({
  timezone: timeZone.default('UTC')
});
