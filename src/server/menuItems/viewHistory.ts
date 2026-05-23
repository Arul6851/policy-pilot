import { Hono } from 'hono';
import { isT1, isT3 } from '@devvit/web/shared';
import type { MenuItemRequest, UiResponse } from '@devvit/web/shared';
import { context, redis, reddit } from '@devvit/web/server';
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

function buildDescription(
  profile: CachedProfile,
  recentEntries: LedgerEntry[],
  offenseEntries: LedgerEntry[]
): string {
  // ── Profile summary ──────────────────────────────────────────────────────
  const profileBlock = [
    `Account age : ${profile.accountAgeDays} days`,
    `Karma       : ${profile.karma.toLocaleString()}`,
  ].join('\n');

  // ── Offense breakdown (30 days) ───────────────────────────────────────────
  const byRule: Record<string, number> = {};
  for (const e of offenseEntries) {
    const key = e.ruleId || 'unknown';
    byRule[key] = (byRule[key] ?? 0) + 1;
  }
  const offenseBreakdown =
    offenseEntries.length === 0
      ? 'None'
      : `${offenseEntries.length} total — ` +
        Object.entries(byRule)
          .map(([r, n]) => `rule ${r}: ${n}`)
          .join(', ');

  const playbookCount = recentEntries.filter((e) => e.usedPlaybook).length;

  // ── Recent entry list ─────────────────────────────────────────────────────
  const entryLines =
    recentEntries.length === 0
      ? '  (no history)'
      : recentEntries.map((e) => `  ${formatEntry(e)}`).join('\n');

  return [
    '── Profile ─────────────────────────────',
    profileBlock,
    '',
    '── Offenses (last 30 days) ─────────────',
    offenseBreakdown,
    '',
    '── Recent actions (latest first) ────────',
    entryLines,
    '',
    `Playbook-assisted actions: ${playbookCount} of ${recentEntries.length}`,
  ].join('\n');
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

  // Fetch profile and ledger data in parallel
  const since = Date.now() - OFFENSE_WINDOW_MS;
  const [profile, allEntries, sinceEntries] = await Promise.all([
    getOrFetchProfile(redis, authorName),
    getLedgerEntries(redis, authorName, HISTORY_DISPLAY_LIMIT),
    getLedgerEntriesSince(redis, authorName, since),
  ]);

  const offenseEntries = sinceEntries.filter((e) => OFFENSE_ACTIONS.has(e.action));
  const description = buildDescription(profile, allEntries, offenseEntries);

  const mod = context.username ?? 'mod';

  return c.json<UiResponse>(
    {
      showForm: {
        name: 'viewHistoryDisplay',
        form: {
          title: `History — u/${authorName}`,
          description,
          fields: [
            {
              type: 'boolean',
              name: 'reviewed',
              label: `Reviewed by u/${mod}`,
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

// ─── Form handler: POST /view-history-dismiss ─────────────────────────────────
// The "Close" button submits here — nothing to persist, just acknowledge.

export const viewHistoryForms = new Hono();

viewHistoryForms.post('/view-history-dismiss', async (c) => {
  return c.json<UiResponse>({}, 200);
});
