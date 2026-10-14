import type { NextFunction, Request, Response } from 'express';
import { getActiveUser, verifyAccessToken } from './auth.service';

export async function requireAuth(req: Request, res: Response, next: NextFunction): Promise<void> {
  const authorization = req.get('authorization');
  const match = authorization?.match(/^Bearer ([^\s]+)$/i);
  const userId = match ? verifyAccessToken(match[1]) : null;

  if (!userId) {
    res.status(401).json({ message: 'Authentication required' });
    return;
  }

  const user = await getActiveUser(userId);
  if (!user) {
    res.status(401).json({ message: 'Authentication required' });
    return;
  }

  req.authUser = user;
  next();
}
