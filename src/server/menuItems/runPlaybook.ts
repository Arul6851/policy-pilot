import { Hono } from 'hono';
import { isT1, isT3, type T3 } from '@devvit/web/shared';
import type { FormField, MenuItemRequest, UiResponse } from '@devvit/web/shared';
import { context, redis, reddit } from '@devvit/web/server';
import {
  evaluatePlaybook,
  getAllPlaybooks,
  getPlaybook,
  type ConditionValues,
} from '../services/playbookService';
import { addLedgerEntry, getLedgerEntriesSince } from '../services/ledgerService';
import { getOrFetchProfile } from '../services/profileService';
import type { LedgerAction, LedgerEntry, PlaybookAction } from '../../shared/types';

// 30-day offense lookback window
const OFFENSE_WINDOW_MS = 30 * 24 * 60 * 60 * 1000;
const SESSION_TTL_SECS = 900;

const RULE_NAMES: Record<string, string> = {
  '1': 'No spam or self-promotion',
  '2': 'Be civil and respectful',
  '3': 'No low-effort or duplicate posts',
  '4': 'Stay on topic',
  '5': 'No misinformation or misleading content',
  '6': 'No ban evasion or alt account abuse',
};

function defaultRemovalComment(ruleId: string): string {
  const name = RULE_NAMES[ruleId];
  const ref = name ? `Rule ${ruleId}: ${name}` : ruleId ? `Rule ${ruleId}` : 'community rules';
  return `Your submission was removed for violating **${ref}**.\n\nPlease review the subreddit rules before posting again.`;
}

type PbSession = {
  targetUsername: string;
  accountAgeDays: number;
  karma: number;
  isSubscriber: boolean;
  playbookRuleId: string;
  postModComment: boolean;
};

function pbSessionKey(mod: string, targetId: string): string {
  return `session:pb:${mod}:${targetId}`;
}

function randomSuffix(): string {
  return Math.random().toString(36).slice(2, 7);
}

// ─── Action option tables ────────────────────────────────────────────────────

const ACTION_OPTIONS = [
  { label: 'Remove content', value: 'remove' },
  { label: 'Approve content', value: 'approve' },
  { label: 'Warn user (send message)', value: 'warn' },
  { label: 'Temp ban — 1 day', value: 'tempban-1' },
  { label: 'Temp ban — 3 days', value: 'tempban-3' },
  { label: 'Temp ban — 7 days', value: 'tempban-7' },
  { label: 'Temp ban — 30 days', value: 'tempban-30' },
  { label: 'Permanent ban', value: 'permban' },
  { label: 'Log note only', value: 'note' },
];

const ACTION_LABELS: Record<string, string> = {
  remove: 'Remove content',
  approve: 'Approve content',
  warn: 'Warn user',
  'tempban-1': 'Temp ban (1 day)',
  'tempban-3': 'Temp ban (3 days)',
  'tempban-7': 'Temp ban (7 days)',
  'tempban-30': 'Temp ban (30 days)',
  permban: 'Permanent ban',
  note: 'Log note',
};

function encodeAction(action: PlaybookAction): string {
  if (action.type === 'tempban') return `tempban-${action.duration ?? 1}`;
  if (action.type === 'escalate') return 'warn';
  if (action.type === 'approve') return 'approve';
  if (action.type === 'remove') return 'remove';
  if (action.type === 'warn') return 'warn';
  if (action.type === 'permban') return 'permban';
  return 'note';
}

function parseAction(val: string): { type: LedgerAction; duration?: number } {
  if (val.startsWith('tempban-')) {
    return { type: 'tempban', duration: parseInt(val.split('-')[1] ?? '1', 10) || 1 };
  }
  switch (val) {
    case 'remove': return { type: 'remove' };
    case 'approve': return { type: 'approve' };
    case 'warn': return { type: 'warn' };
    case 'permban': return { type: 'permban' };
    default: return { type: 'note' };
  }
}

// ─── Menu handler: POST /run-playbook ────────────────────────────────────────

export const runPlaybookMenu = new Hono();

runPlaybookMenu.post('/run-playbook', async (c) => {
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
    console.error('PolicyPilot: failed to fetch target content', err);
  }

  if (!authorName) {
    return c.json<UiResponse>({ showToast: 'Could not identify content author.' }, 200);
  }

  const playbooks = await getAllPlaybooks(redis);
  if (!playbooks.length) {
    return c.json<UiResponse>(
      { showToast: 'No playbooks found. Use "Configure Playbooks" in the subreddit menu.' },
      200
    );
  }

  const profile = await getOrFetchProfile(redis, authorName);

  const mod = context.username ?? 'mod';
  const session: PbSession = {
    targetUsername: authorName,
    accountAgeDays: profile.accountAgeDays,
    karma: profile.karma,
    isSubscriber: profile.isSubscriber,
    playbookRuleId: '',
    postModComment: false,
  };
  const key = pbSessionKey(mod, targetId);
  await redis.set(key, JSON.stringify(session));
  await redis.expire(key, SESSION_TTL_SECS);

  return c.json<UiResponse>(
    {
      showForm: {
        name: 'runPlaybookSelect',
        form: {
          title: `Run Playbook — u/${authorName}`,
          description: 'Select a playbook to evaluate for this user.',
          fields: [
            {
              type: 'select',
              name: 'playbookId',
              label: 'Playbook',
              required: true,
              options: playbooks.map((p) => ({ label: p.name, value: p.id })),
            },
            {
              type: 'string',
              name: '_targetId',
              label: 'Target ID',
              helpText: 'System field — do not edit',
              defaultValue: targetId,
              required: true,
            },
          ],
          acceptLabel: 'Evaluate →',
        },
      },
    },
    200
  );
});

// ─── Form handlers ────────────────────────────────────────────────────────────

export const runPlaybookForms = new Hono();

// Step 1 submit: evaluate playbook conditions, show confirmation form
type SelectFormValues = {
  playbookId: string[];
  _targetId: string;
};

runPlaybookForms.post('/run-playbook-evaluate', async (c) => {
  const body = await c.req.json<SelectFormValues>();
  const playbookId = body.playbookId?.[0];
  const targetId = body._targetId;

  if (!playbookId || !targetId) {
    return c.json<UiResponse>({ showToast: 'Form data missing — please try again.' }, 200);
  }

  const mod = context.username ?? 'mod';
  const sessionRaw = await redis.get(pbSessionKey(mod, targetId));
  if (!sessionRaw) {
    return c.json<UiResponse>({ showToast: 'Session expired — please re-open Run Playbook.' }, 200);
  }
  const session = JSON.parse(sessionRaw) as PbSession;

  const playbook = await getPlaybook(redis, playbookId);
  if (!playbook) {
    return c.json<UiResponse>({ showToast: 'Playbook not found.' }, 200);
  }

  // Build offense counts for the past 30 days
  const since = Date.now() - OFFENSE_WINDOW_MS;
  const entries = await getLedgerEntriesSince(redis, session.targetUsername, since);
  const OFFENSE_TYPES = new Set<LedgerAction>(['remove', 'warn', 'tempban', 'permban']);
  // '' key = offenses with no ruleId (logged by onModAction, rule unknown)
  // rule-scoped keys = offenses attributed to a specific rule (logged via playbook)
  const offensesByRule: Record<string, number> = {};
  for (const e of entries) {
    if (OFFENSE_TYPES.has(e.action)) {
      const key = e.ruleId || '';
      offensesByRule[key] = (offensesByRule[key] ?? 0) + 1;
    }
  }

  const values: ConditionValues = {
    accountAgeDays: session.accountAgeDays,
    karma: session.karma,
    isSubscriber: session.isSubscriber,
    offensesByRule,
  };

  const result = evaluatePlaybook(playbook, values);
  if (!result) {
    return c.json<UiResponse>(
      { showToast: 'Playbook has no resolvable steps — check configuration.' },
      200
    );
  }

  const { action, reasoning } = result;
  const recommendedValue = encodeAction(action);

  // Persist ruleId and postModComment so the confirm handler can act on them
  const enrichedSession: PbSession = {
    ...session,
    playbookRuleId: playbook.ruleId,
    postModComment: action.postModComment ?? false,
  };
  await redis.set(pbSessionKey(mod, targetId), JSON.stringify(enrichedSession));
  await redis.expire(pbSessionKey(mod, targetId), SESSION_TTL_SECS);

  const description = [
    `User: u/${session.targetUsername}`,
    `Playbook: ${playbook.name}`,
    `Prior offenses (30d): ${offensesByRule[''] ?? 0}`,
    `Account age: ${session.accountAgeDays} days`,
    ``,
    `Reasoning: ${reasoning}`,
    `Recommended: ${ACTION_LABELS[recommendedValue] ?? recommendedValue}`,
  ].join('\n');

  const fields: FormField[] = [
    {
      type: 'select',
      name: 'action',
      label: 'Action to take',
      required: true,
      options: ACTION_OPTIONS,
      defaultValue: [recommendedValue],
    },
  ];

  if (action.messageTemplate || action.postModComment) {
    const isRemovalComment = action.postModComment && action.type === 'remove';
    fields.push({
      type: 'paragraph',
      name: 'message',
      label: isRemovalComment ? 'Removal reason (posted as mod comment)' : 'Message to user (optional)',
      defaultValue: action.messageTemplate ?? (isRemovalComment ? defaultRemovalComment(playbook.ruleId) : ''),
    });
  }

  fields.push(
    {
      type: 'string',
      name: '_targetId',
      label: 'Target ID',
      helpText: 'System field — do not edit',
      defaultValue: targetId,
      required: true,
    },
    {
      type: 'string',
      name: '_playbookId',
      label: 'Playbook ID',
      helpText: 'System field — do not edit',
      defaultValue: playbookId,
      required: true,
    }
  );

  return c.json<UiResponse>(
    {
      showForm: {
        name: 'runPlaybookConfirm',
        form: {
          title: 'Confirm Moderation Action',
          description,
          fields,
          acceptLabel: 'Execute Action',
          cancelLabel: 'Cancel',
        },
      },
    },
    200
  );
});

// Step 2 submit: execute the action and log to ledger
type ConfirmFormValues = {
  action: string[];
  message?: string;
  _targetId: string;
  _playbookId: string;
};

runPlaybookForms.post('/run-playbook-confirm', async (c) => {
  const body = await c.req.json<ConfirmFormValues>();
  const actionValue = body.action?.[0] ?? 'note';
  const targetId = body._targetId;
  const playbookId = body._playbookId ?? '';
  const messageText = body.message?.trim() ?? '';

  if (!targetId) {
    return c.json<UiResponse>({ showToast: 'Session error — please try again.' }, 200);
  }

  const mod = context.username ?? 'mod';
  const sessionRaw = await redis.get(pbSessionKey(mod, targetId));
  if (!sessionRaw) {
    return c.json<UiResponse>({ showToast: 'Session expired — please re-open Run Playbook.' }, 200);
  }
  const session = JSON.parse(sessionRaw) as PbSession;
  await redis.del(pbSessionKey(mod, targetId));

  const { targetUsername } = session;
  const subredditName = context.subredditName;
  const { type: ledgerAction, duration } = parseAction(actionValue);

  try {
    switch (ledgerAction) {
      case 'remove':
        if (isT3(targetId)) await reddit.remove(targetId, false);
        else if (isT1(targetId)) await reddit.remove(targetId, false);
        if (isT3(targetId) && session.postModComment) {
          const commentText = messageText || defaultRemovalComment(session.playbookRuleId);
          try {
            const modComment = await reddit.submitComment({
              id: targetId as T3,
              text: commentText,
              runAs: 'USER',
            });
            await modComment.distinguish(true);
          } catch (err) {
            console.error('PolicyPilot: failed to post mod comment', err);
          }
        }
        break;
      case 'approve':
        if (isT3(targetId)) await reddit.approve(targetId);
        else if (isT1(targetId)) await reddit.approve(targetId);
        break;
      case 'warn':
        if (messageText) {
          await reddit.modMail.createConversation({
            subredditName,
            subject: `Message from the moderators of r/${subredditName}`,
            body: messageText,
            to: targetUsername,
            isAuthorHidden: true,
          });
        }
        break;
      case 'tempban':
        await reddit.banUser({
          username: targetUsername,
          subredditName,
          duration,
          message: messageText || undefined,
          reason: `PolicyPilot: ${playbookId}`,
        });
        break;
      case 'permban':
        await reddit.banUser({
          username: targetUsername,
          subredditName,
          message: messageText || undefined,
          reason: `PolicyPilot: ${playbookId}`,
        });
        break;
      case 'note':
        break;
    }
  } catch (err) {
    console.error('PolicyPilot: action execution failed', err);
    return c.json<UiResponse>(
      { showToast: { text: 'Action failed — verify bot has moderator permissions.', appearance: 'neutral' } },
      200
    );
  }

  const entry: LedgerEntry = {
    id: `${targetUsername}-${Date.now()}-${randomSuffix()}`,
    userId: targetUsername,
    action: ledgerAction,
    ruleId: '',
    modId: mod,
    postId: targetId,
    context: messageText || undefined,
    usedPlaybook: true,
    timestamp: Date.now(),
  };
  await addLedgerEntry(redis, entry, {
    reddit,
    subredditName,
  });

  const label = ACTION_LABELS[actionValue] ?? ledgerAction;
  return c.json<UiResponse>(
    { showToast: { text: `${label} applied to u/${targetUsername}. Logged to reputation ledger.`, appearance: 'success' } },
    200
  );
});
