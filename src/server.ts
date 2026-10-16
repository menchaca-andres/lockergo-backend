import { app } from './app';
import { env } from './config/env';
import { startMaintenanceJobs } from './services/maintenance-jobs';

const port = env.PORT;

if (env.ALLOW_UNAUTHENTICATED_DEVICE_ACCESS) {
  console.warn('WARNING: device configuration and ingestion accept requests without API keys in development.');
}

app.listen(port, () => {
  console.log(`LockerGo API listening on http://localhost:${port}`);
  startMaintenanceJobs();
});
