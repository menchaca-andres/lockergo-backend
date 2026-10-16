export const MAX_DEVICE_CLOCK_SKEW_MS = 5 * 60 * 1000;

export function resolveRecordedAt(timestampSeconds: number | undefined, now: Date): Date {
  if (timestampSeconds === undefined) return now;

  const deviceTime = new Date(timestampSeconds * 1000);
  if (
    !Number.isFinite(deviceTime.getTime()) ||
    Math.abs(deviceTime.getTime() - now.getTime()) > MAX_DEVICE_CLOCK_SKEW_MS
  ) {
    return now;
  }
  return deviceTime;
}
