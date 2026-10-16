import { createHash, randomBytes } from 'node:crypto';

const TICKET_LIFETIME_MS = 10 * 60 * 1000;
type PackageStreamRole = 'CLIENTE' | 'DEPOSITANTE';
const tickets = new Map<
  string,
  { userId: number; role: PackageStreamRole; expiresAt: number }
>();

function digest(ticket: string): string {
  return createHash('sha256').update(ticket).digest('hex');
}

function removeExpiredTickets(now: number): void {
  for (const [hash, ticket] of tickets) {
    if (ticket.expiresAt <= now) tickets.delete(hash);
  }
}

export function createPackageStreamTicket(
  userId: number,
  role: PackageStreamRole
): { ticket: string; expiresInSeconds: number } {
  const now = Date.now();
  removeExpiredTickets(now);
  const ticket = randomBytes(32).toString('base64url');
  tickets.set(digest(ticket), { userId, role, expiresAt: now + TICKET_LIFETIME_MS });
  return { ticket, expiresInSeconds: TICKET_LIFETIME_MS / 1000 };
}

export function verifyPackageStreamTicket(ticket: string): {
  userId: number;
  role: PackageStreamRole;
  expiresAt: number;
} | null {
  const hash = digest(ticket);
  const stored = tickets.get(hash);
  if (!stored) return null;
  if (stored.expiresAt <= Date.now()) {
    tickets.delete(hash);
    return null;
  }
  return {
    userId: stored.userId,
    role: stored.role,
    expiresAt: stored.expiresAt
  };
}
