import { Hono } from 'hono';
import { isT1, isT3 } from '@devvit/web/shared';
import type { MenuItemRequest, UiResponse } from '@devvit/web/shared';
import { redis, reddit } from '@devvit/web/server';
import { getLedgerEntries, getLedgerEntriesSince } from '../services/ledgerService';
import { getOrFetchProfile } from '../services/profileService';
import type { LedgerEntry, LedgerAction, CachedProfile } from '../../shared/types';

const OFFENSE_WINDOW_MS = 30 * 24 * 60 * 60 * 1000;
const HISTORY_DISPLAY_LIMIT = 12;
const OFFENSE_ACTIONS: Set<LedgerAction> = new Set(['remove', 'warn', 'tempban', 'permban']);

const ACTION_ICON: Record<LedgerAction, string> = {
  remove: '✂',
  warn: '⚠',
  tempban: '⏱',
  permban: '🚫',
  approve: '✓',
  note: '📝',
};

// ─── Risk level ───────────────────────────────────────────────────────────────

type RiskLevel = 'clean' | 'watched' | 'escalation';

function computeRisk(offenseCount: number): RiskLevel {
  if (offenseCount === 0) return 'clean';
  if (offenseCount <= 2) return 'watched';
  return 'escalation';
}

function formatKarma(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

function buildToastText(username: string, risk: RiskLevel, offenseCount: number, accountAgeDays: number, karma: number): string {
  const icon = risk === 'clean' ? '🟢' : risk === 'watched' ? '🟡' : '🔴';
  const label =
    risk === 'clean'
      ? 'Clean'
      : risk === 'watched'
        ? `Watched (${offenseCount} offense${offenseCount === 1 ? '' : 's'})`
        : `Escalation Zone (${offenseCount} offenses)`;
  return `${icon} u/${username} — ${label} | Account: ${accountAgeDays}d | Karma: ${formatKarma(karma)}`;
}

function buildQuickSummary(username: string, risk: RiskLevel, offenseCount: number, profile: CachedProfile): string {
  const riskLine =
    risk === 'clean'
      ? '🟢 No offenses in the last 30 days.'
      : risk === 'watched'
        ? `🟡 ${offenseCount} offense${offenseCount === 1 ? '' : 's'} in the last 30 days — monitor closely.`
        : `🔴 ${offenseCount} offenses in the last 30 days — escalation candidate.`;

  return [
    riskLine,
    `Age: ${profile.accountAgeDays} days  ·  Karma: ${profile.karma.toLocaleString()}`,
    'Tap "View Full History" for the complete action log.',
  ].join('\n\n');
}

// ─── Helpers shared with detail view ─────────────────────────────────────────

function formatDate(ts: number): string {
  return new Date(ts).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function formatEntry(e: LedgerEntry): string {
  const icon = ACTION_ICON[e.action] ?? '?';
  const rule = e.ruleId ? `rule ${e.ruleId}` : 'no rule';
  const pb = e.usedPlaybook ? ' [PB]' : '';
  return `${icon} ${e.action.padEnd(7)} ${formatDate(e.timestamp)}  ${rule}  by u/${e.modId}${pb}`;
}

type FullDescription = { summary: string; actionLog: string };

function buildFullDescription(
  profile: CachedProfile,
  recentEntries: LedgerEntry[],
  offenseEntries: LedgerEntry[]
): FullDescription {
  // summary goes in the form description (plain text — newlines collapse)
  const byRule: Record<string, number> = {};
  for (const e of offenseEntries) {
    const key = e.ruleId || 'none';
    byRule[key] = (byRule[key] ?? 0) + 1;
  }
  const offenseSummary =
    offenseEntries.length === 0
      ? 'No offenses in the last 30 days.'
      : Object.entries(byRule)
          .map(([r, n]) => `Rule ${r}: ${n}`)
          .join('  ·  ');

  const summary = [
    `👤  Age: ${profile.accountAgeDays}d  ·  Karma: ${profile.karma.toLocaleString()}`,
    `⚠️  Offenses (30d): ${offenseEntries.length}  —  ${offenseSummary}`,
  ].join('\n');

  // actionLog goes in a paragraph field (textarea) — newlines ARE preserved there
  const playbookCount = recentEntries.filter((e) => e.usedPlaybook).length;
  const entryLines =
    recentEntries.length === 0
      ? '(no actions logged yet)'
      : recentEntries
          .map((e) => {
            const icon = ACTION_ICON[e.action] ?? '?';
            const rule = e.ruleId ? `rule ${e.ruleId}` : 'no rule';
            const pb = e.usedPlaybook ? '  [PB]' : '';
            const date = new Date(e.timestamp).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
            return `${icon}  ${e.action.padEnd(7)}  ${date}  ·  ${rule}  ·  u/${e.modId}${pb}`;
          })
          .join('\n');

  const actionLog = [
    `${recentEntries.length} action${recentEntries.length === 1 ? '' : 's'} · ${playbookCount} playbook-assisted`,
    '─────────────────────────────',
    entryLines,
  ].join('\n');

  return { summary, actionLog };
}

// ─── Menu handler: POST /view-history ────────────────────────────────────────

export const viewHistoryMenu = new Hono();

viewHistoryMenu.post('/view-history', async (c) => {
  const { targetId } = await c.req.json<MenuItemRequest>();

  let authorName: string | undefined;
  try {
    if (isT3(targetId)) {
      const post = await reddit.getPostById(targetId);
      authorName = post.authorName;
    } else if (isT1(targetId)) {
      const comment = await reddit.getCommentById(targetId);
      authorName = comment.authorName;
    }
  } catch (err) {
    console.error('PolicyPilot viewHistory: failed to fetch target', err);
  }

  if (!authorName) {
    return c.json<UiResponse>({ showToast: 'Could not identify content author.' }, 200);
  }

  const since = Date.now() - OFFENSE_WINDOW_MS;
  const [profile, sinceEntries] = await Promise.all([
    getOrFetchProfile(redis, authorName),
    getLedgerEntriesSince(redis, authorName, since),
  ]);

  const offenseEntries = sinceEntries.filter((e) => OFFENSE_ACTIONS.has(e.action));
  const risk = computeRisk(offenseEntries.length);
  const toastText = buildToastText(authorName, risk, offenseEntries.length, profile.accountAgeDays, profile.karma);
  const quickSummary = buildQuickSummary(authorName, risk, offenseEntries.length, profile);

  return c.json<UiResponse>(
    {
      showToast: toastText,
      showForm: {
        name: 'viewHistoryDisplay',
        form: {
          title: `u/${authorName} — Risk Check`,
          description: quickSummary,
          fields: [
            {
              type: 'string',
              name: '_username',
              label: 'Username',
              helpText: 'System field — do not edit',
              defaultValue: authorName,
              required: true,
            },
          ],
          acceptLabel: 'View Full History',
          cancelLabel: 'Dismiss',
        },
      },
    },
    200
  );
});

// ─── Form handlers ────────────────────────────────────────────────────────────

export const viewHistoryForms = new Hono();

type QuickSummaryValues = {
  _username: string;
};

// "View Full History" button — fetch full ledger and show detail form
viewHistoryForms.post('/view-history-dismiss', async (c) => {
  const body = await c.req.json<QuickSummaryValues>();
  const username = body._username?.trim();

  if (!username) {
    return c.json<UiResponse>({ showToast: 'Session error — please try again.' }, 200);
  }

  const since = Date.now() - OFFENSE_WINDOW_MS;
  const [profile, allEntries, sinceEntries] = await Promise.all([
    getOrFetchProfile(redis, username),
    getLedgerEntries(redis, username, HISTORY_DISPLAY_LIMIT),
    getLedgerEntriesSince(redis, username, since),
  ]);

  const offenseEntries = sinceEntries.filter((e) => OFFENSE_ACTIONS.has(e.action));
  const { summary, actionLog } = buildFullDescription(profile, allEntries, offenseEntries);

  return c.json<UiResponse>(
    {
      showForm: {
        name: 'viewHistoryDetail',
        form: {
          title: `History — u/${username}`,
          description: summary,
          fields: [
            {
              type: 'paragraph',
              name: '_actionLog',
              label: '📋 Action Log (newest first)',
              defaultValue: actionLog,
            },
            {
              type: 'boolean',
              name: 'reviewed',
              label: 'Mark as reviewed',
              defaultValue: true,
            },
          ],
          acceptLabel: 'Close',
          cancelLabel: 'Cancel',
        },
      },
    },
    200
  );
});

// "Close" on the detail form — nothing to persist
viewHistoryForms.post('/view-history-detail', async (c) => {
  return c.json<UiResponse>({}, 200);
});
