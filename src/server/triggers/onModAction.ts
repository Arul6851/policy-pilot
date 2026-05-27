import { Hono } from 'hono';
import type { OnModActionRequest, TriggerResponse } from '@devvit/web/shared';
import { context, redis, reddit } from '@devvit/web/server';
import { addLedgerEntry } from '../services/ledgerService';
import type { LedgerEntry, LedgerAction } from '../../shared/types';

export const onModActionTrigger = new Hono();

function mapAction(action: string): LedgerAction {
  switch (action) {
    case 'removelink':
    case 'removecomment':
    case 'spamlink':
    case 'spamcomment':
      return 'remove';
    case 'approvelink':
    case 'approvecomment':
      return 'approve';
    case 'banuser':
      return 'permban';
    case 'tempban':
      return 'tempban';
    case 'muteuser':
      return 'warn';
    default:
      return 'note';
  }
}

onModActionTrigger.post('/on-mod-action', async (c) => {
  const event = await c.req.json<OnModActionRequest>();

  const userId = event.targetUser?.name;
  const rawAction = event.action;

  // Skip if no target user, no action, or the target is a mod-team bot account
  if (!userId || !rawAction || userId.endsWith('-ModTeam')) {
    console.error('PolicyPilot onModAction: skipping event', { userId, rawAction });
    return c.json<TriggerResponse>({}, 200);
  }

  const timestamp = event.actionedAt ? new Date(event.actionedAt).getTime() : Date.now();

  const entry: LedgerEntry = {
    id: `${userId}-${timestamp}-${Math.random().toString(36).slice(2, 7)}`,
    userId,
    action: mapAction(rawAction),
    ruleId: '',
    modId: event.moderator?.name ?? 'unknown',
    postId: event.targetPost?.id ?? event.targetComment?.id,
    usedPlaybook: false,
    timestamp,
  };

  console.error(`PolicyPilot onModAction: ${rawAction} → ${entry.action} | user=u/${userId} | mod=u/${entry.modId}`);

  try {
    await addLedgerEntry(redis, entry, {
      reddit,
      subredditName: context.subredditName,
    });
    console.error(`PolicyPilot onModAction: ledger write OK | id=${entry.id}`);
  } catch (err) {
    // Transient Redis failure (e.g. ECONNRESET) — log and swallow so the
    // trigger always returns 200. A 500 here causes Reddit to retry or drop
    // the event entirely, which is worse than a missed ledger entry.
    console.error('PolicyPilot onModAction: ledger write FAILED', err);
  }

  return c.json<TriggerResponse>({}, 200);
});
