import { createHmac, randomBytes } from 'node:crypto';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import type { User } from '../../generated/prisma/client';
import { env } from '../../config/env';
import { prisma } from '../../lib/prisma';
import type { LoginInput } from './auth.schemas';

const ACCESS_TOKEN_LIFETIME = '15m';
const REFRESH_TOKEN_LIFETIME_MS = 7 * 24 * 60 * 60 * 1000;
const JWT_ISSUER = 'lockergo-api';
const JWT_AUDIENCE = 'lockergo-web';

export type PublicUser = Pick<User, 'id_user' | 'name' | 'email' | 'role'>;
type UserIdentity = PublicUser & Pick<User, 'isActive'>;

export interface AuthSession {
  user: PublicUser;
  accessToken: string;
  refreshToken: string;
}

function publicUser(user: UserIdentity): PublicUser {
  const { id_user, name, email, role } = user;
  return { id_user, name, email, role };
}

function createAccessToken(user: PublicUser): string {
  return jwt.sign({ role: user.role }, env.JWT_SECRET, {
    algorithm: 'HS256',
    audience: JWT_AUDIENCE,
    expiresIn: ACCESS_TOKEN_LIFETIME,
    issuer: JWT_ISSUER,
    subject: String(user.id_user)
  });
}

function hashRefreshToken(token: string): string {
  return createHmac('sha256', env.JWT_REFRESH_SECRET).update(token).digest('hex');
}

function createRefreshToken(): string {
  return randomBytes(32).toString('base64url');
}

async function createSession(
  user: UserIdentity,
  previousTokenId?: number
): Promise<AuthSession | null> {
  const refreshToken = createRefreshToken();
  const now = new Date();

  if (previousTokenId === undefined) {
    await prisma.refreshToken.create({
      data: {
        userId: user.id_user,
        tokenHash: hashRefreshToken(refreshToken),
        expiresAt: new Date(now.getTime() + REFRESH_TOKEN_LIFETIME_MS)
      }
    });
  } else {
    const updated = await prisma.$transaction(async (transaction) => {
      const revoked = await transaction.refreshToken.updateMany({
        where: {
          id_rt: previousTokenId,
          revokedAt: null,
          expiresAt: { gt: now }
        },
        data: { revokedAt: now }
      });

      if (revoked.count !== 1) return false;

      await transaction.refreshToken.create({
        data: {
          userId: user.id_user,
          tokenHash: hashRefreshToken(refreshToken),
          expiresAt: new Date(now.getTime() + REFRESH_TOKEN_LIFETIME_MS)
        }
      });
      return true;
    });

    if (!updated) return null;
  }

  const safeUser = publicUser(user);
  return {
    user: safeUser,
    accessToken: createAccessToken(safeUser),
    refreshToken
  };
}

export async function login(input: LoginInput): Promise<AuthSession | null> {
  const user = await prisma.user.findUnique({ where: { email: input.email } });
  if (!user || !user.isActive || !(await bcrypt.compare(input.password, user.passwordHash))) {
    return null;
  }

  return createSession(user);
}

export async function refreshSession(token: string): Promise<AuthSession | null> {
  const tokenHash = hashRefreshToken(token);
  const storedToken = await prisma.refreshToken.findFirst({
    where: { tokenHash },
    include: {
      user: {
        select: {
          id_user: true,
          name: true,
          email: true,
          role: true,
          isActive: true
        }
      }
    }
  });
  const now = new Date();

  if (
    !storedToken ||
    storedToken.revokedAt !== null ||
    storedToken.expiresAt <= now
  ) {
    return null;
  }

  if (!storedToken.user.isActive) {
    await revokeRefreshToken(token);
    return null;
  }

  return createSession(storedToken.user, storedToken.id_rt);
}

export async function revokeRefreshToken(token: string | undefined): Promise<void> {
  if (!token) return;

  await prisma.refreshToken.updateMany({
    where: {
      tokenHash: hashRefreshToken(token),
      revokedAt: null
    },
    data: { revokedAt: new Date() }
  });
}

export function verifyAccessToken(token: string): number | null {
  try {
    const payload = jwt.verify(token, env.JWT_SECRET, {
      algorithms: ['HS256'],
      audience: JWT_AUDIENCE,
      issuer: JWT_ISSUER
    });
    if (typeof payload === 'string' || !payload.sub || !/^[1-9]\d*$/.test(payload.sub)) {
      return null;
    }
    const userId = Number(payload.sub);
    return Number.isSafeInteger(userId) ? userId : null;
  } catch {
    return null;
  }
}

export async function getActiveUser(userId: number): Promise<PublicUser | null> {
  const user = await prisma.user.findUnique({
    where: { id_user: userId },
    select: {
      id_user: true,
      name: true,
      email: true,
      role: true,
      isActive: true
    }
  });
  return user?.isActive ? publicUser(user) : null;
}

export { REFRESH_TOKEN_LIFETIME_MS };
