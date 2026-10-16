import { env } from '../config/env';
import { flushDueDoorTransitionsAndPublish } from '../modules/ingest/door-debounce.service';
import { aggregateAndDeleteExpiredReadings } from './reading-retention';

const DAY_MS = 24 * 60 * 60 * 1000;

export function startMaintenanceJobs(): void {
  let doorJobRunning = false;
  setInterval(() => {
    if (doorJobRunning) return;
    doorJobRunning = true;
    void flushDueDoorTransitionsAndPublish()
      .catch((error: unknown) => console.error('Door debounce job failed:', error))
      .finally(() => { doorJobRunning = false; });
  }, 100);

  const runRetention = () => {
    void aggregateAndDeleteExpiredReadings()
      .then((deleted) => console.info(`Reading retention completed; deleted ${deleted} expired rows.`))
      .catch((error: unknown) => console.error('Reading retention job failed:', error));
  };
  runRetention();
  setInterval(runRetention, DAY_MS);

  console.info(
    `Sensor jobs started (error threshold ${env.SENSOR_ERROR_THRESHOLD}, ` +
    `dedupe ${env.READING_DEDUPE_WINDOW_SECONDS}s, retention ${env.READING_RETENTION_DAYS}d).`
  );
}
