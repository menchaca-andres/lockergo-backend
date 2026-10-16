import { describe, expect, test } from 'bun:test';
import { createLockerStreamTicket, verifyLockerStreamTicket } from './stream-tickets';

describe('locker stream tickets', () => {
  test('scopes tickets to a user and one locker', () => {
    const { ticket } = createLockerStreamTicket(10, 21);

    expect(verifyLockerStreamTicket(ticket, 21)?.userId).toBe(10);
    expect(verifyLockerStreamTicket(ticket, 22)).toBeNull();
    expect(verifyLockerStreamTicket('invalid-ticket', 21)).toBeNull();
  });
});
