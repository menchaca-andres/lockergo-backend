import { describe, expect, test } from 'bun:test';
import { createPackageStreamTicket, verifyPackageStreamTicket } from './package-stream-tickets';

describe('package stream tickets', () => {
  test('binds a ticket to one user and the role at issuance', () => {
    const { ticket } = createPackageStreamTicket(105, 'DEPOSITANTE');

    expect(verifyPackageStreamTicket(ticket)).toMatchObject({
      userId: 105,
      role: 'DEPOSITANTE'
    });
    expect(verifyPackageStreamTicket('invalid-ticket')).toBeNull();
  });
});
