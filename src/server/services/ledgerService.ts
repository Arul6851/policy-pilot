import type { RedisClient } from '@devvit/redis';
import type { RedditClient } from '@devvit/reddit';
import { ToolboxClient } from 'toolbox-devvit';
import type { LedgerEntry, LedgerAction } from '../../shared/types';
import { LEDGER_KEY, LEDGER_USERS_KEY } from '../utils/redisKeys';

const OFFENSE_ACTIONS: Set<LedgerAction> = new Set(['remove', 'warn', 'tempban', 'permban']);

// Actions worth syncing to Toolbox — exclude benign ones (approve, note)
const TOOLBOX_SYNC_ACTIONS: Set<LedgerAction> = new Set(['remove', 'warn', 'tempban', 'permban']);

export type ToolboxSyncContext = {
  reddit: RedditClient;
  subredditName: string;
};

function buildUsernoteText(entry: LedgerEntry): string {
  const parts: string[] = [entry.action.toUpperCase()];
  if (entry.ruleId) parts.push(`Rule ${entry.ruleId}`);
  if (entry.usedPlaybook) parts.push('playbook');
  return parts.join(' | ');
}

export async function addLedgerEntry(
  redis: RedisClient,
  entry: LedgerEntry,
  toolbox?: ToolboxSyncContext,
): Promise<void> {
  await Promise.all([
    redis.zAdd(LEDGER_KEY(entry.userId), {
      score: entry.timestamp,
      member: JSON.stringify(entry),
    }),
    redis.zAdd(LEDGER_USERS_KEY, {
      score: entry.timestamp,
      member: entry.userId,
    }),
  ]);

  // Sync to Toolbox usernotes if the sub uses Toolbox — fail silently if not
  if (
    toolbox &&
    entry.modId !== 'PolicyPilot' &&
    TOOLBOX_SYNC_ACTIONS.has(entry.action)
  ) {
    try {
      const client = new ToolboxClient(toolbox.reddit);
      await client.addUsernote(toolbox.subredditName, {
        username: entry.userId,
        text: buildUsernoteText(entry),
        moderatorUsername: entry.modId,
        timestamp: new Date(entry.timestamp),
      });
    } catch {
      // Toolbox wiki pages absent or write failed — no-op
    }
  }
}

export async function getLedgerEntries(
  redis: RedisClient,
  userId: string,
  limit = 50
): Promise<LedgerEntry[]> {
  const results = await redis.zRange(LEDGER_KEY(userId), '+inf', '-inf', {
    by: 'score',
    reverse: true,
    limit: { offset: 0, count: limit },
  });
  return results.map((r) => JSON.parse(r.member) as LedgerEntry);
}

export async function getLedgerEntriesSince(
  redis: RedisClient,
  userId: string,
  sinceTimestamp: number
): Promise<LedgerEntry[]> {
  const results = await redis.zRange(LEDGER_KEY(userId), sinceTimestamp, '+inf', {
    by: 'score',
  });
  return results.map((r) => JSON.parse(r.member) as LedgerEntry);
}

export async function getRecentLedgerUsers(
  redis: RedisClient,
  sinceTimestamp: number
): Promise<string[]> {
  const results = await redis.zRange(LEDGER_USERS_KEY, sinceTimestamp, '+inf', {
    by: 'score',
  });
  return results.map((r) => r.member);
}

export async function countOffensesByRule(
  redis: RedisClient,
  userId: string,
  ruleId: string,
  sinceTimestamp: number
): Promise<number> {
  const entries = await getLedgerEntriesSince(redis, userId, sinceTimestamp);
  return entries.filter(
    (e) => e.ruleId === ruleId && OFFENSE_ACTIONS.has(e.action)
  ).length;
}
