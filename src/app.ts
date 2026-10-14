import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import morgan from 'morgan';
import { ZodError } from 'zod';

import { env } from './config/env';
import { authRouter } from './modules/auth/auth.routes';

export const app = express();

app.use(helmet());
app.use(
  cors({
    origin: env.CORS_ORIGIN,
    credentials: true
  })
);
app.use(express.json({ limit: '1mb' }));
app.use(cookieParser());
app.use(morgan(env.NODE_ENV === 'production' ? 'combined' : 'dev'));

app.use('/api/auth', authRouter);

app.get('/api/health', (_req, res) => {
  res.json({
    ok: true,
    service: 'lockergo-backend',
    environment: env.NODE_ENV,
    timestamp: new Date().toISOString()
  });
});

app.get('/api', (_req, res) => {
  res.json({
    name: 'LockerGo API',
    version: '0.1.0',
    stack: ['Node.js', 'Express', 'TypeScript', 'Prisma', 'PostgreSQL']
  });
});

app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  if (err instanceof SyntaxError && 'status' in err && err.status === 400) {
    res.status(400).json({ message: 'Invalid JSON body' });
    return;
  }

  if (err instanceof ZodError) {
    res.status(400).json({ message: 'Invalid request', details: err.issues });
    return;
  }

  console.error(err);
  res.status(500).json({
    ok: false,
    message: 'Internal server error'
  });
});
