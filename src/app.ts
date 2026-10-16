import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import morgan from 'morgan';
import { ZodError } from 'zod';
import { Prisma } from './generated/prisma/client';

import { env } from './config/env';
import { authRouter } from './modules/auth/auth.routes';
import { lockersRouter } from './modules/lockers/lockers.routes';
import { usersRouter } from './modules/users/users.routes';
import { catalogRouter } from './modules/catalog/catalog.routes';
import { componentsRouter, deviceConfigRouter, devicesRouter } from './modules/devices/devices.routes';
import { ingestRouter } from './modules/ingest/ingest.routes';
import { packagesRouter } from './modules/packages/packages.routes';
import { dashboardRouter } from './modules/dashboard/dashboard.routes';

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
app.use(morgan(env.NODE_ENV === 'production' ? 'combined' : 'dev', {
  skip: (req) => req.path.endsWith('/stream')
}));

app.use('/api/auth', authRouter);
app.use('/api/users', usersRouter);
app.use('/api/lockers', lockersRouter);
app.use('/api/packages', packagesRouter);
app.use('/api/dashboard', dashboardRouter);
app.use('/api/devices', deviceConfigRouter);
app.use('/api/devices', devicesRouter);
app.use('/api/components', componentsRouter);
app.use('/api/catalog', catalogRouter);
app.use('/api/ingest', ingestRouter);

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

  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    if (err.code === 'P2002') {
      res.status(409).json({ message: 'A resource with these unique fields already exists' });
      return;
    }
    if (err.code === 'P2025') {
      res.status(404).json({ message: 'Resource not found' });
      return;
    }
    if (err.code === 'P2003') {
      res.status(400).json({ message: 'A referenced resource does not exist' });
      return;
    }
  }

  console.error(err);
  res.status(500).json({
    ok: false,
    message: 'Internal server error'
  });
});
