import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { env } from '../../config/env';
import { requireAuth } from './auth.middleware';
import { loginSchema } from './auth.schemas';
import {
  login,
  REFRESH_TOKEN_LIFETIME_MS,
  refreshSession,
  revokeRefreshToken
} from './auth.service';

const REFRESH_COOKIE = 'lockergo_refresh';
const refreshCookieOptions = {
  httpOnly: true,
  secure: env.NODE_ENV === 'production',
  sameSite: 'lax' as const,
  path: '/api/auth'
};

const authRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: { message: 'Too many authentication attempts. Try again later.' }
});

export const authRouter = Router();

authRouter.post('/login', authRateLimit, async (req, res) => {
  const input = loginSchema.parse(req.body);
  const session = await login(input);

  if (!session) {
    res.status(401).json({ message: 'Invalid email or password' });
    return;
  }

  res.cookie(REFRESH_COOKIE, session.refreshToken, {
    ...refreshCookieOptions,
    maxAge: REFRESH_TOKEN_LIFETIME_MS
  });
  res.json({ user: session.user, accessToken: session.accessToken });
});

authRouter.post('/refresh', authRateLimit, async (req, res) => {
  const session = await refreshSession(req.cookies[REFRESH_COOKIE]);

  if (!session) {
    res.clearCookie(REFRESH_COOKIE, refreshCookieOptions);
    res.status(401).json({ message: 'Refresh session is invalid or expired' });
    return;
  }

  res.cookie(REFRESH_COOKIE, session.refreshToken, {
    ...refreshCookieOptions,
    maxAge: REFRESH_TOKEN_LIFETIME_MS
  });
  res.json({ user: session.user, accessToken: session.accessToken });
});

authRouter.post('/logout', async (req, res) => {
  await revokeRefreshToken(req.cookies[REFRESH_COOKIE]);
  res.clearCookie(REFRESH_COOKIE, refreshCookieOptions);
  res.sendStatus(204);
});

authRouter.get('/me', requireAuth, (req, res) => {
  res.json({ user: req.authUser });
});
