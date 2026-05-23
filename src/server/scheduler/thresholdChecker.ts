import { Hono } from 'hono';
import { context, redis, reddit, settings } from '@devvit/web/server';
import type { TaskResponse } from '@devvit/scheduler';
import { getRecentLedgerUsers, getLedgerEntriesSince, addLedgerEntry } from '../services/ledgerService';
import type { LedgerAction } from '../../shared/types';
import { ALERT_SENT_KEY } from '../utils/redisKeys';

const OFFENSE_ACTIONS: Set<LedgerAction> = new Set(['remove', 'warn', 'tempban', 'permban']);
const SOFT_ACTIONS: Set<LedgerAction> = new Set(['remove', 'warn']);

type AlertLevel = 'warn' | 'tempban';

const ALERT_SEVERITY: Record<AlertLevel, number> = { warn: 1, tempban: 2 };

type RawSettings = {
  autoEscalationEnabled?: boolean;
  warningsBeforeTempBan?: number;
  tempBansBeforePermBan?: number;
  timeWindowDays?: number;
};

function parseSettings(s: RawSettings) {
  return {
    enabled: s.autoEscalationEnabled !== false,
    warningsBeforeTempBan: typeof s.warningsBeforeTempBan === 'number' ? s.warningsBeforeTempBan : 3,
    tempBansBeforePermBan: typeof s.tempBansBeforePermBan === 'number' ? s.tempBansBeforePermBan : 2,
    timeWindowDays: typeof s.timeWindowDays === 'number' ? s.timeWindowDays : 30,
  };
}

function buildAlertBody(
  userId: string,
  alertLevel: AlertLevel,
  softCount: number,
  tempBanCount: number,
  timeWindowDays: number,
  warningsThreshold: number,
  tempBanThreshold: number,
  recentOffenseLines: string
): { subject: string; bodyMarkdown: string } {
  const isPermBanAlert = alertLevel === 'tempban';

  const subject = isPermBanAlert
    ? `[PolicyPilot] Perm-ban threshold reached — u/${userId}`
    : `[PolicyPilot] Temp-ban threshold reached — u/${userId}`;

  const countLine = isPermBanAlert
    ? `**${tempBanCount}** temp ban(s) in the last **${timeWindowDays} days** (threshold: ${tempBanThreshold})`
    : `**${softCount}** remove/warn action(s) in the last **${timeWindowDays} days** (threshold: ${warningsThreshold})`;

  const nextAction = isPermBanAlert
    ? 'Review this user for a **permanent ban**.'
    : 'Review this user for a **temp ban**.';

  const bodyMarkdown = [
    `**u/${userId}** has crossed a PolicyPilot escalation threshold.`,
    '',
    countLine,
    '',
    nextAction,
    'Use **Run Playbook** or **View User History** on any of their posts or comments to take action.',
    '',
    '**Recent offenses (newest first):**',
    recentOffenseLines,
  ].join('\n');

  return { subject, bodyMarkdown };
}

export const thresholdCheckerRoutes = new Hono();

thresholdCheckerRoutes.post('/threshold-check', async (c) => {
  const raw = await settings.getAll<RawSettings>();
  const cfg = parseSettings(raw);

  if (!cfg.enabled) {
    return c.json<TaskResponse>({}, 200);
  }

  const windowMs = cfg.timeWindowDays * 24 * 60 * 60 * 1000;
  const since = Date.now() - windowMs;
  const subredditId = context.subredditId;
  const ttlSeconds = cfg.timeWindowDays * 24 * 60 * 60;

  const userIds = await getRecentLedgerUsers(redis, since);

  for (const userId of userIds) {
    const entries = await getLedgerEntriesSince(redis, userId, since);

    const softCount = entries.filter((e) => SOFT_ACTIONS.has(e.action)).length;
    const tempBanCount = entries.filter((e) => e.action === 'tempban').length;

    let alertLevel: AlertLevel | null = null;
    if (tempBanCount >= cfg.tempBansBeforePermBan) {
      alertLevel = 'tempban';
    } else if (softCount >= cfg.warningsBeforeTempBan) {
      alertLevel = 'warn';
    }

    if (!alertLevel) continue;

    // Skip if we already sent an alert at this severity or higher for this window
    const existingAlert = await redis.get(ALERT_SENT_KEY(userId));
    if (existingAlert) {
      const existingSeverity = ALERT_SEVERITY[existingAlert as AlertLevel] ?? 0;
      if (existingSeverity >= ALERT_SEVERITY[alertLevel]) continue;
    }

    const recentOffenses = entries
      .filter((e) => OFFENSE_ACTIONS.has(e.action))
      .sort((a, b) => b.timestamp - a.timestamp)
      .slice(0, 5);

    const offenseLines =
      recentOffenses.length > 0
        ? recentOffenses
            .map(
              (e) =>
                `- **${e.action}** on ${new Date(e.timestamp).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} by u/${e.modId}`
            )
            .join('\n')
        : '- (no logged offenses found)';

    const { subject, bodyMarkdown } = buildAlertBody(
      userId,
      alertLevel,
      softCount,
      tempBanCount,
      cfg.timeWindowDays,
      cfg.warningsBeforeTempBan,
      cfg.tempBansBeforePermBan,
      offenseLines
    );

    const alertNote =
      alertLevel === 'tempban'
        ? `Perm-ban threshold alert: ${tempBanCount} temp bans in ${cfg.timeWindowDays}d`
        : `Temp-ban threshold alert: ${softCount} removes/warns in ${cfg.timeWindowDays}d`;

    const now = Date.now();

    await Promise.all([
      reddit.modMail
        .createModDiscussionConversation({ subject, bodyMarkdown, subredditId })
        .catch((err: unknown) => console.error('PolicyPilot thresholdChecker: modmail failed', err)),
      addLedgerEntry(redis, {
        id: `${userId}-alert-${now}`,
        userId,
        action: 'note',
        ruleId: '',
        modId: 'PolicyPilot',
        context: alertNote,
        usedPlaybook: false,
        timestamp: now,
      }),
    ]);

    // Mark alert sent; TTL expires with the time window so re-alerts are possible
    await redis.set(ALERT_SENT_KEY(userId), alertLevel);
    await redis.expire(ALERT_SENT_KEY(userId), ttlSeconds);
  }

  return c.json<TaskResponse>({}, 200);
});
