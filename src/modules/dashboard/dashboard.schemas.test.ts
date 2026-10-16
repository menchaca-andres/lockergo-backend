import { describe, expect, test } from 'bun:test';
import { adminDashboardQuerySchema } from './dashboard.schemas';

describe('adminDashboardQuerySchema', () => {
  test('accepts valid IANA time zones', () => {
    expect(adminDashboardQuerySchema.parse({ timezone: 'America/La_Paz' }).timezone)
      .toBe('America/La_Paz');
  });

  test('defaults to UTC and rejects invalid time zones', () => {
    expect(adminDashboardQuerySchema.parse({}).timezone).toBe('UTC');
    expect(adminDashboardQuerySchema.safeParse({ timezone: 'Not/A_Timezone' }).success).toBe(false);
  });
});
