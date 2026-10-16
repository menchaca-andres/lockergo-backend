import type { Request, Response } from 'express';
import { getActiveUser } from '../auth/auth.service';
import { getLocker } from './lockers.service';
import { lockerIdSchema } from './lockers.schemas';
import { subscribeToLockerUpdates } from './locker-update-bus';
import { createLockerStreamTicket, verifyLockerStreamTicket } from './stream-tickets';

function sendEvent(response: Response, id: number, type: string, data: unknown): void {
  response.write(`id: ${id}\nevent: ${type}\ndata: ${JSON.stringify(data)}\n\n`);
}

export async function createStreamTicket(req: Request, res: Response): Promise<void> {
  const { id: lockerId } = lockerIdSchema.parse(req.params);
  if (!req.authUser) {
    res.status(401).json({ message: 'Authentication required' });
    return;
  }
  if (!(await getLocker(req.authUser, lockerId))) {
    res.status(404).json({ message: 'Locker not found' });
    return;
  }
  res.json(createLockerStreamTicket(req.authUser.id_user, lockerId));
}

export async function streamLockerUpdates(req: Request, res: Response): Promise<void> {
  const lockerId = Number(req.params['id']);
  const ticket = req.query['ticket'];
  if (!Number.isSafeInteger(lockerId) || lockerId <= 0 || typeof ticket !== 'string' || ticket.length > 100) {
    res.status(401).json({ message: 'Stream ticket is invalid or expired' });
    return;
  }

  const ticketData = verifyLockerStreamTicket(ticket, lockerId);
  if (!ticketData) {
    res.status(401).json({ message: 'Stream ticket is invalid or expired' });
    return;
  }
  const user = await getActiveUser(ticketData.userId);
  if (!user) {
    res.status(401).json({ message: 'Stream ticket is invalid or expired' });
    return;
  }
  if (!(await getLocker(user, lockerId))) {
    res.status(404).json({ message: 'Locker not found' });
    return;
  }

  const lastEventIdHeader = req.get('last-event-id');
  const queryCursor = req.query['lastEventId'];
  if (queryCursor !== undefined && typeof queryCursor !== 'string') {
    res.status(400).json({ message: 'Last event cursor is invalid' });
    return;
  }
  const cursorValue = lastEventIdHeader ?? queryCursor;
  if (cursorValue !== undefined && !/^\d+$/.test(cursorValue)) {
    res.status(400).json({ message: 'Last-Event-ID must be a non-negative integer' });
    return;
  }
  const lastEventId = cursorValue === undefined ? undefined : Number(cursorValue);
  if (
    lastEventId !== undefined &&
    (!Number.isSafeInteger(lastEventId) || lastEventId < 0)
  ) {
    res.status(400).json({ message: 'Last-Event-ID must be a non-negative integer' });
    return;
  }

  res.status(200);
  res.set({
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no'
  });
  res.flushHeaders();
  res.write('retry: 3000\n\n');

  const subscription = subscribeToLockerUpdates(lockerId, lastEventId, (event) => {
    sendEvent(res, event.id, 'locker.update', event.update);
  });
  if (subscription.historyGap) {
    res.write('event: reset\ndata: {}\n\n');
  } else {
    for (const event of subscription.replay) {
      sendEvent(res, event.id, 'locker.update', event.update);
    }
  }
  res.write('event: ready\ndata: {}\n\n');

  let checkingAuthorization = false;
  const heartbeat = setInterval(() => {
    if (checkingAuthorization) return;
    checkingAuthorization = true;
    void (async () => {
      try {
        const currentUser = await getActiveUser(user.id_user);
        if (!currentUser || !(await getLocker(currentUser, lockerId))) {
          res.end();
          return;
        }
        res.write(': heartbeat\n\n');
      } catch (error) {
        console.error('Could not revalidate locker stream access:', error);
        res.end();
      } finally {
        checkingAuthorization = false;
      }
    })();
  }, 20_000);
  const ticketTimeout = setTimeout(() => res.end(), ticketData.expiresAt - Date.now());
  res.on('close', () => {
    clearInterval(heartbeat);
    clearTimeout(ticketTimeout);
    subscription.unsubscribe();
  });
}
