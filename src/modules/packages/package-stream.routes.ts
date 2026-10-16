import type { Request, Response } from 'express';
import { getActiveUser } from '../auth/auth.service';
import { subscribeToPackageUpdates } from './package-update-bus';
import { createPackageStreamTicket, verifyPackageStreamTicket } from './package-stream-tickets';

function sendEvent(response: Response, id: number, type: string, data: unknown): void {
  response.write(`id: ${id}\nevent: ${type}\ndata: ${JSON.stringify(data)}\n\n`);
}

export function createPackageStreamTicketRoute(req: Request, res: Response): void {
  const user = req.authUser;
  if (!user) {
    res.status(401).json({ message: 'Authentication required' });
    return;
  }
  if (user.role !== 'CLIENTE' && user.role !== 'DEPOSITANTE') {
    res.status(403).json({ message: 'Package stream is available to CLIENTE and DEPOSITANTE accounts' });
    return;
  }
  res.json(createPackageStreamTicket(user.id_user, user.role));
}

export async function streamPackageUpdates(req: Request, res: Response): Promise<void> {
  const ticket = req.query['ticket'];
  if (typeof ticket !== 'string' || ticket.length > 100) {
    res.status(401).json({ message: 'Stream ticket is invalid or expired' });
    return;
  }

  const ticketData = verifyPackageStreamTicket(ticket);
  if (!ticketData) {
    res.status(401).json({ message: 'Stream ticket is invalid or expired' });
    return;
  }
  const user = await getActiveUser(ticketData.userId);
  if (!user || user.role !== ticketData.role) {
    res.status(401).json({ message: 'Stream ticket is invalid or expired' });
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
  if (lastEventId !== undefined && (!Number.isSafeInteger(lastEventId) || lastEventId < 0)) {
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

  const subscription = subscribeToPackageUpdates(user.id_user, lastEventId, (event) => {
    sendEvent(res, event.id, 'package.update', event.update);
  });
  if (subscription.historyGap) {
    res.write('event: reset\ndata: {}\n\n');
  } else {
    for (const event of subscription.replay) {
      sendEvent(res, event.id, 'package.update', event.update);
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
        if (!currentUser || currentUser.role !== ticketData.role) {
          res.end();
          return;
        }
        res.write(': heartbeat\n\n');
      } catch (error) {
        console.error('Could not revalidate package stream access:', error);
        res.end();
      } finally {
        checkingAuthorization = false;
      }
    })();
  }, 20_000);
  const ticketTimeout = setTimeout(() => res.end(), ticketData.expiresAt - Date.now());
  heartbeat.unref();
  ticketTimeout.unref();
  res.on('close', () => {
    clearInterval(heartbeat);
    clearTimeout(ticketTimeout);
    subscription.unsubscribe();
  });
}
