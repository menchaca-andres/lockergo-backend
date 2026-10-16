import type { NextFunction, Request, Response } from 'express';
import type { Role } from '../../generated/prisma/client';

export function requireRole(...roles: Role[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.authUser) {
      res.status(401).json({ message: 'Authentication required' });
      return;
    }

    if (!roles.includes(req.authUser.role)) {
      res.status(403).json({ message: 'Insufficient permissions' });
      return;
    }

    next();
  };
}
