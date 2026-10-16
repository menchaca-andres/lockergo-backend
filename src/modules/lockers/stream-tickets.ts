import { createHash, randomBytes } from 'node:crypto';

const TICKET_LIFETIME_MS = 10 * 60 * 1000;
const tickets = new Map<string, { userId: number; lockerId: number; expiresAt: number }>();

function digest(ticket: string): string {
  return createHash('sha256').update(ticket).digest('hex');
}

function removeExpiredTickets(now: number): void {
  for (const [hash, ticket] of tickets) {
    if (ticket.expiresAt <= now) tickets.delete(hash);
  }
}

export function createLockerStreamTicket(userId: number, lockerId: number): {
  ticket: string;
  expiresInSeconds: number;
} {
  const now = Date.now();
  removeExpiredTickets(now);
  const ticket = randomBytes(32).toString('base64url');
  tickets.set(digest(ticket), { userId, lockerId, expiresAt: now + TICKET_LIFETIME_MS });
  return { ticket, expiresInSeconds: TICKET_LIFETIME_MS / 1000 };
}

export function verifyLockerStreamTicket(
  ticket: string,
  lockerId: number
): { userId: number; expiresAt: number } | null {
  const hash = digest(ticket);
  const stored = tickets.get(hash);
  if (!stored) return null;
  if (stored.expiresAt <= Date.now()) {
    tickets.delete(hash);
    return null;
  }
  return stored.lockerId === lockerId
    ? { userId: stored.userId, expiresAt: stored.expiresAt }
    : null;
}
