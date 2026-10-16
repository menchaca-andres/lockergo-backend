import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { resolveDeviceAccess } from '../devices/devices.service';
import { ingestReadingsSchema } from './ingest.schemas';
import { ingestReadings } from './ingest.service';

const ingestRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 120,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: { message: 'Too many ingestion requests. Try again later.' }
});

export const ingestRouter = Router();

ingestRouter.post('/v1/readings', ingestRateLimit, async (req, res) => {
  const input = ingestReadingsSchema.parse(req.body);
  const apiKey = req.get('x-device-key');
  const deviceId = await resolveDeviceAccess(input.deviceCode, apiKey);
  if (!deviceId) {
    res.status(401).json({ message: 'Device authentication required' });
    return;
  }

  const result = await ingestReadings(deviceId, input);
  if (!result) {
    res.status(401).json({ message: 'Device authentication required' });
    return;
  }

  res.status(202).json(result);
});
