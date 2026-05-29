import type { RedisClient } from '@devvit/redis';
import type { DailyMetrics, LedgerAction } from '../../shared/types';
import { getRecentLedgerUsers, getLedgerEntriesSince } from './ledgerService';
import { METRICS_DAILY_KEY, DASHBOARD_LAST_REFRESH_KEY } from '../utils/redisKeys';

const ZERO_BREAKDOWN: Record<LedgerAction, number> = {
  remove: 0,
  warn: 0,
  tempban: 0,
  permban: 0,
  approve: 0,
  note: 0,
};

export async function computeDailyMetrics(
  redis: RedisClient,
  date: string
): Promise<DailyMetrics> {
  const parts = date.split('-');
  const y = parseInt(parts[0] ?? '2024', 10);
  const m = parseInt(parts[1] ?? '1', 10);
  const d = parseInt(parts[2] ?? '1', 10);
  const start = Date.UTC(y, m - 1, d);
  const end = start + 86_400_000;

  const userIds = await getRecentLedgerUsers(redis, start);

  const actionBreakdown: Record<LedgerAction, number> = { ...ZERO_BREAKDOWN };
  const ruleBreakdown: Record<string, number> = {};
  const modBreakdown: Record<string, number> = {};
  const offenderCounts: Record<string, number> = {};
  let totalActions = 0;
  let playbookUsage = 0;

  for (const userId of userIds) {
    const entries = await getLedgerEntriesSince(redis, userId, start);
    const dayEntries = entries.filter((e) => e.timestamp < end);
    if (dayEntries.length === 0) continue;

    offenderCounts[userId] = (offenderCounts[userId] ?? 0) + dayEntries.length;
    totalActions += dayEntries.length;

    for (const e of dayEntries) {
      actionBreakdown[e.action] = (actionBreakdown[e.action] ?? 0) + 1;
      if (e.ruleId) {
        ruleBreakdown[e.ruleId] = (ruleBreakdown[e.ruleId] ?? 0) + 1;
      }
      modBreakdown[e.modId] = (modBreakdown[e.modId] ?? 0) + 1;
      if (e.usedPlaybook) playbookUsage++;
    }
  }

  const uniqueUsers = Object.keys(offenderCounts).length;

  const topOffenders = Object.entries(offenderCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([userId, count]) => ({ userId, username: userId, count }));

  return {
    date,
    totalActions,
    actionBreakdown,
    uniqueUsers,
    playbookUsage,
    topOffenders,
    ruleBreakdown,
    modBreakdown,
  };
}

export async function getCachedMetrics(
  redis: RedisClient,
  date: string
): Promise<DailyMetrics | null> {
  const raw = await redis.get(METRICS_DAILY_KEY(date));
  if (!raw) return null;
  return JSON.parse(raw) as DailyMetrics;
}

export async function saveDailyMetrics(
  redis: RedisClient,
  metrics: DailyMetrics
): Promise<void> {
  await redis.set(METRICS_DAILY_KEY(metrics.date), JSON.stringify(metrics));
}

export async function computeWeekMetrics(redis: RedisClient): Promise<DailyMetrics> {
  const since = Date.now() - 7 * 24 * 60 * 60 * 1000;

  const userIds = await getRecentLedgerUsers(redis, since);

  const actionBreakdown: Record<LedgerAction, number> = { ...ZERO_BREAKDOWN };
  const ruleBreakdown: Record<string, number> = {};
  const modBreakdown: Record<string, number> = {};
  const offenderCounts: Record<string, number> = {};
  let totalActions = 0;
  let playbookUsage = 0;

  for (const userId of userIds) {
    const entries = await getLedgerEntriesSince(redis, userId, since);
    if (!entries.length) continue;

    offenderCounts[userId] = entries.length;
    totalActions += entries.length;

    for (const e of entries) {
      actionBreakdown[e.action] = (actionBreakdown[e.action] ?? 0) + 1;
      if (e.ruleId) ruleBreakdown[e.ruleId] = (ruleBreakdown[e.ruleId] ?? 0) + 1;
      modBreakdown[e.modId] = (modBreakdown[e.modId] ?? 0) + 1;
      if (e.usedPlaybook) playbookUsage++;
    }
  }

  const uniqueUsers = Object.keys(offenderCounts).length;
  const topOffenders = Object.entries(offenderCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([userId, count]) => ({ userId, username: userId, count }));

  const startLabel = new Date(since).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  const endLabel = new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

  return {
    date: `${startLabel} – ${endLabel}`,
    totalActions,
    actionBreakdown,
    uniqueUsers,
    playbookUsage,
    topOffenders,
    ruleBreakdown,
    modBreakdown,
  };
}

export async function refreshMetrics(redis: RedisClient): Promise<void> {
  const today = new Date().toISOString().slice(0, 10);
  const metrics = await computeDailyMetrics(redis, today);
  await saveDailyMetrics(redis, metrics);
  await redis.set(DASHBOARD_LAST_REFRESH_KEY, String(Date.now()));
}
