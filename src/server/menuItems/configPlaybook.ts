import { Hono } from 'hono';
import type { UiResponse } from '@devvit/web/shared';
import { context, redis, reddit } from '@devvit/web/server';
import { getAllPlaybooks, savePlaybook, getPlaybook, deletePlaybook, evaluatePlaybook } from '../services/playbookService';
import type { ConditionValues } from '../services/playbookService';
import { getRecentLedgerUsers, getLedgerEntriesSince } from '../services/ledgerService';
import { getOrFetchProfile } from '../services/profileService';
import type { Playbook, PlaybookAction, PlaybookStep, LedgerAction } from '../../shared/types';

const FALLBACK_RULE_OPTIONS = [
  { label: 'Rule 1', value: '1' },
  { label: 'Rule 2', value: '2' },
  { label: 'Rule 3', value: '3' },
  { label: 'Rule 4', value: '4' },
  { label: 'Rule 5', value: '5' },
  { label: 'Rule 6', value: '6' },
];

async function fetchRuleOptions(): Promise<{ label: string; value: string }[]> {
  try {
    const rules = await reddit.getRules(context.subredditName);
    if (!rules.length) return FALLBACK_RULE_OPTIONS;
    return rules
      .sort((a, b) => a.priority - b.priority)
      .map((r, i) => ({
        label: `Rule ${i + 1} — ${r.shortName}`,
        value: String(i + 1),
      }));
  } catch {
    return FALLBACK_RULE_OPTIONS;
  }
}

const FIRST_ACTION_OPTIONS = [
  { label: 'Remove content', value: 'remove' },
  { label: 'Log note only', value: 'note' },
  { label: 'Warn (send message)', value: 'warn' },
  { label: 'Temp ban — 1 day', value: 'tempban-1' },
];

const SECOND_ACTION_OPTIONS = [
  { label: 'Warn (send message)', value: 'warn' },
  { label: 'Temp ban — 1 day', value: 'tempban-1' },
  { label: 'Temp ban — 3 days', value: 'tempban-3' },
  { label: 'Temp ban — 7 days', value: 'tempban-7' },
];

const THIRD_ACTION_OPTIONS = [
  { label: 'Temp ban — 7 days', value: 'tempban-7' },
  { label: 'Temp ban — 30 days', value: 'tempban-30' },
  { label: 'Permanent ban', value: 'permban' },
];

const NEW_ACCOUNT_ACTION_OPTIONS = [
  { label: 'Remove content', value: 'remove' },
  { label: 'Temp ban — 1 day', value: 'tempban-1' },
  { label: 'Temp ban — 3 days', value: 'tempban-3' },
  { label: 'Permanent ban', value: 'permban' },
];

function buildAction(val: string, messageTemplate?: string, postModComment?: boolean): PlaybookAction {
  if (val.startsWith('tempban-')) {
    return {
      type: 'tempban',
      duration: parseInt(val.split('-')[1] ?? '1', 10) || 1,
      messageTemplate,
      logToLedger: true,
    };
  }
  switch (val) {
    case 'remove': return { type: 'remove', messageTemplate, postModComment: postModComment ?? false, logToLedger: true };
    case 'warn': return { type: 'warn', messageTemplate, logToLedger: true };
    case 'permban': return { type: 'permban', messageTemplate, logToLedger: true };
    default: return { type: 'note', logToLedger: true };
  }
}

// ─── Preview helpers ──────────────────────────────────────────────────────────

const PREVIEW_LIMIT = 15;
const PREVIEW_WINDOW_MS = 30 * 24 * 60 * 60 * 1000;
const PREVIEW_OFFENSE_ACTIONS: Set<LedgerAction> = new Set(['remove', 'warn', 'tempban', 'permban']);

function previewActionLabel(action: PlaybookAction): string {
  if (action.type === 'tempban') {
    return action.duration ? `tempban ${action.duration}d` : 'tempban';
  }
  return action.type;
}

function previewTier(offenses: number): string {
  if (offenses === 0) return '🟢 Tier 1';
  if (offenses === 1) return '🟡 Tier 2';
  return '🔴 Tier 3';
}

// ─── Manage helpers ───────────────────────────────────────────────────────────

function buildManageFormSpec(playbooks: Playbook[]) {
  const playbookSummary = playbooks
    .map((p) => {
      const tierCount = p.steps.filter((s) => s.condition.type === 'priorOffenses').length + 1;
      return `📋 ${p.name} · Rule ${p.ruleId} · ${tierCount} tier${tierCount === 1 ? '' : 's'}`;
    })
    .join('\n\n');

  return {
    title: 'Manage Playbooks',
    description: `${playbooks.length} playbook${playbooks.length === 1 ? '' : 's'} configured.\n\n${playbookSummary}`,
    fields: [
      {
        type: 'select' as const,
        name: 'playbookId',
        label: 'Select playbook to delete',
        required: true,
        options: playbooks.map((p) => ({ label: p.name, value: p.id })),
      },
    ],
    acceptLabel: 'Delete Selected →',
    cancelLabel: 'Close',
  };
}

// ─── Menu handlers ────────────────────────────────────────────────────────────

export const configPlaybookMenu = new Hono();

configPlaybookMenu.post('/config-playbook', async (c) => {
  let existingNote = '';
  try {
    const all = await getAllPlaybooks(redis);
    if (all.length) {
      existingNote = `\n\nExisting playbooks: ${all.map((p) => p.name).join(', ')}`;
    }
  } catch { /* non-fatal */ }

  const ruleOptions = await fetchRuleOptions();

  return c.json<UiResponse>(
    {
      showForm: {
        name: 'configPlaybookSave',
        form: {
          title: 'Create Playbook',
          description:
            'Define an escalation policy for a subreddit rule. PolicyPilot evaluates the user\'s prior offenses and account profile to recommend the right action.' +
            existingNote,
          fields: [
            {
              type: 'string',
              name: 'name',
              label: 'Playbook Name',
              required: true,
              helpText: 'e.g. "Spam Escalation" or "Civility Policy"',
            },
            {
              type: 'select',
              name: 'ruleId',
              label: 'Target Rule',
              required: true,
              options: ruleOptions,
            },
            {
              type: 'select',
              name: 'firstAction',
              label: '1st Offense Action',
              required: true,
              options: FIRST_ACTION_OPTIONS,
              defaultValue: ['remove'],
            },
            {
              type: 'select',
              name: 'secondAction',
              label: '2nd Offense Action',
              required: true,
              options: SECOND_ACTION_OPTIONS,
              defaultValue: ['warn'],
            },
            {
              type: 'select',
              name: 'thirdAction',
              label: '3+ Offenses Action',
              required: true,
              options: THIRD_ACTION_OPTIONS,
              defaultValue: ['tempban-7'],
            },
            {
              type: 'paragraph',
              name: 'messageTemplate',
              label: 'Message Template (optional)',
              helpText: 'Sent to user for warn/ban actions, and used as the removal reason comment if enabled below.',
            },
            {
              type: 'boolean',
              name: 'postModComment',
              label: 'Post distinguished removal reason comment',
              helpText: 'When a "remove" action runs, automatically post a distinguished mod comment on the post with the message template above as the removal reason.',
              defaultValue: false,
            },
            // ── Account age gate ─────────────────────────────────────────────
            {
              type: 'boolean',
              name: 'newAccountGate',
              label: 'Stricter policy for new accounts',
              helpText: 'Prepend an account-age check: new accounts bypass the offense escalation and receive a direct action.',
              defaultValue: false,
            },
            {
              type: 'number',
              name: 'newAccountDays',
              label: 'New account threshold (days)',
              helpText: 'Accounts younger than this are considered "new".',
              defaultValue: 30,
            },
            {
              type: 'select',
              name: 'newAccountAction',
              label: 'Action for new accounts',
              options: NEW_ACCOUNT_ACTION_OPTIONS,
              defaultValue: ['tempban-1'],
            },
          ],
          acceptLabel: 'Create Playbook',
        },
      },
    },
    200
  );
});

configPlaybookMenu.post('/preview-playbook', async (c) => {
  const playbooks = await getAllPlaybooks(redis);
  if (!playbooks.length) {
    return c.json<UiResponse>(
      { showToast: 'No playbooks found. Create one first via "Configure Playbooks".' },
      200
    );
  }

  return c.json<UiResponse>(
    {
      showForm: {
        name: 'previewPlaybookSelect',
        form: {
          title: 'Preview Playbook',
          description: `Simulate a playbook against the ${PREVIEW_LIMIT} most-recently-actioned users. No actions will be taken — results show what the playbook would recommend today.`,
          fields: [
            {
              type: 'select',
              name: 'playbookId',
              label: 'Playbook to preview',
              required: true,
              options: playbooks.map((p) => ({ label: p.name, value: p.id })),
            },
          ],
          acceptLabel: 'Run Preview →',
        },
      },
    },
    200
  );
});

configPlaybookMenu.post('/manage-playbooks', async (c) => {
  const playbooks = await getAllPlaybooks(redis);
  if (!playbooks.length) {
    return c.json<UiResponse>(
      { showToast: 'No playbooks yet. Create one first via "Configure Playbooks".' },
      200
    );
  }
  return c.json<UiResponse>(
    { showForm: { name: 'managePlaybookSelect', form: buildManageFormSpec(playbooks) } },
    200
  );
});

// ─── Form handlers ────────────────────────────────────────────────────────────

export const configPlaybookForms = new Hono();

type ConfigFormValues = {
  name: string;
  ruleId: string[];
  firstAction: string[];
  secondAction: string[];
  thirdAction: string[];
  messageTemplate?: string;
  postModComment?: boolean;
  newAccountGate?: boolean;
  newAccountDays?: number;
  newAccountAction?: string[];
};

configPlaybookForms.post('/config-playbook-save', async (c) => {
  const body = await c.req.json<ConfigFormValues>();

  const name = body.name?.trim();
  const ruleId = body.ruleId?.[0];
  const firstVal = body.firstAction?.[0] ?? 'remove';
  const secondVal = body.secondAction?.[0] ?? 'warn';
  const thirdVal = body.thirdAction?.[0] ?? 'tempban-7';
  const messageTemplate = body.messageTemplate?.trim() || undefined;
  const postModComment = body.postModComment === true;
  const newAccountGate = body.newAccountGate === true;
  const newAccountDays = body.newAccountDays ?? 30;
  const newAccountActionVal = body.newAccountAction?.[0] ?? 'tempban-1';

  if (!name || !ruleId) {
    return c.json<UiResponse>({ showToast: 'Playbook name and rule are required.' }, 200);
  }

  // Core 2-step escalation tree (covers 3 tiers via priorOffenses):
  //   step-offense-1: priorOffenses < 1  → firstAction
  //   step-offense-2: priorOffenses < 2  → secondAction; else → thirdAction
  const offenseSteps: PlaybookStep[] = [
    {
      id: 'step-offense-1',
      condition: { type: 'priorOffenses', operator: 'lt', value: 1, ruleScope: ruleId },
      trueAction: buildAction(firstVal, messageTemplate, postModComment),
      falseAction: { nextStepId: 'step-offense-2' },
    },
    {
      id: 'step-offense-2',
      condition: { type: 'priorOffenses', operator: 'lt', value: 2, ruleScope: ruleId },
      trueAction: buildAction(secondVal, messageTemplate, postModComment),
      falseAction: buildAction(thirdVal, messageTemplate, postModComment),
    },
  ];

  // Optionally prepend an account-age gate:
  //   step-age: accountAge < newAccountDays → newAccountAction; else → offense escalation
  const steps: PlaybookStep[] = newAccountGate
    ? [
        {
          id: 'step-age',
          condition: { type: 'accountAge', operator: 'lt', value: newAccountDays },
          trueAction: buildAction(newAccountActionVal, messageTemplate, postModComment),
          falseAction: { nextStepId: 'step-offense-1' },
        },
        ...offenseSteps,
      ]
    : offenseSteps;

  const playbook: Playbook = {
    id: `pb-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    name,
    ruleId,
    createdBy: context.username ?? 'mod',
    updatedAt: Date.now(),
    steps,
  };

  await savePlaybook(redis, playbook);

  const allAfterSave = await getAllPlaybooks(redis);
  return c.json<UiResponse>(
    {
      showToast: { text: `Playbook "${name}" created.`, appearance: 'success' },
      showForm: { name: 'managePlaybookSelect', form: buildManageFormSpec(allAfterSave) },
    },
    200
  );
});

// ─── Preview form handlers ────────────────────────────────────────────────────

type PreviewSelectValues = {
  playbookId: string[];
};

configPlaybookForms.post('/preview-playbook-select', async (c) => {
  const body = await c.req.json<PreviewSelectValues>();
  const playbookId = body.playbookId?.[0];
  if (!playbookId) {
    return c.json<UiResponse>({ showToast: 'Please select a playbook.' }, 200);
  }

  const playbook = await getPlaybook(redis, playbookId);
  if (!playbook) {
    return c.json<UiResponse>({ showToast: 'Playbook not found.' }, 200);
  }

  const since = Date.now() - PREVIEW_WINDOW_MS;
  const allUserIds = await getRecentLedgerUsers(redis, since);
  const previewIds = allUserIds
    .filter((id) => !id.endsWith('-ModTeam') && id !== 'PolicyPilot')
    .slice(0, PREVIEW_LIMIT);

  if (!previewIds.length) {
    return c.json<UiResponse>(
      {
        showForm: {
          name: 'previewPlaybookResult',
          form: {
            title: `Preview — ${playbook.name}`,
            description: 'No users with ledger activity in the last 30 days. Take some mod actions first, then re-run the preview.',
            fields: [{ type: 'boolean', name: 'ack', label: 'Acknowledged', defaultValue: true }],
            acceptLabel: 'Close',
          },
        },
      },
      200
    );
  }

  // Evaluate playbook for each user — read-only, no side effects
  const rows = await Promise.all(
    previewIds.map(async (userId) => {
      const [profile, entries] = await Promise.all([
        getOrFetchProfile(redis, userId),
        getLedgerEntriesSince(redis, userId, since),
      ]);

      const offensesByRule: Record<string, number> = {};
      for (const e of entries) {
        if (PREVIEW_OFFENSE_ACTIONS.has(e.action)) {
          const key = e.ruleId || '';
          offensesByRule[key] = (offensesByRule[key] ?? 0) + 1;
        }
      }

      const values: ConditionValues = {
        accountAgeDays: profile.accountAgeDays,
        karma: profile.karma,
        isSubscriber: profile.isSubscriber,
        offensesByRule,
      };

      const result = evaluatePlaybook(playbook, values);
      // include unattributed entries — same logic as playbookService evalCondition
      const offensesOnRule = (offensesByRule[playbook.ruleId] ?? 0) + (offensesByRule[''] ?? 0);

      return { userId, result, offensesOnRule };
    })
  );

  const resultLines = rows.map(({ userId, result, offensesOnRule }) => {
    if (!result) return `👤 u/${userId} → No action`;
    const tier = previewTier(offensesOnRule);
    const action = previewActionLabel(result.action);
    return `👤 u/${userId} → ${tier} (${action}) · ${offensesOnRule} offense${offensesOnRule === 1 ? '' : 's'}`;
  });

  const description = [
    `📋 ${playbook.name} · Rule ${playbook.ruleId}`,
    `Simulated ${rows.length} user${rows.length === 1 ? '' : 's'} · last 30 days · dry-run only`,
    '',
    resultLines.join('\n\n'),
  ].join('\n\n');

  return c.json<UiResponse>(
    {
      showForm: {
        name: 'previewPlaybookResult',
        form: {
          title: `Preview — ${playbook.name}`,
          description,
          fields: [{ type: 'boolean', name: 'ack', label: 'Results reviewed', defaultValue: true }],
          acceptLabel: 'Close',
        },
      },
    },
    200
  );
});

// Dismiss the result form — nothing to persist
configPlaybookForms.post('/preview-playbook-result', async (c) => {
  return c.json<UiResponse>({}, 200);
});

// ─── Manage Playbooks form handlers ──────────────────────────────────────────

type ManageSelectValues = {
  playbookId: string[];
};

// Step 1: mod picks a playbook → show delete confirmation
configPlaybookForms.post('/manage-playbook-select', async (c) => {
  const body = await c.req.json<ManageSelectValues>();
  const playbookId = body.playbookId?.[0];
  if (!playbookId) {
    return c.json<UiResponse>({ showToast: 'Please select a playbook.' }, 200);
  }

  const playbook = await getPlaybook(redis, playbookId);
  if (!playbook) {
    return c.json<UiResponse>({ showToast: 'Playbook not found — it may have already been deleted.' }, 200);
  }

  return c.json<UiResponse>(
    {
      showForm: {
        name: 'managePlaybookConfirm',
        form: {
          title: 'Confirm Delete',
          description: `Delete "${playbook.name}"?\n\nThis cannot be undone. Any mod currently mid-flow with this playbook will receive an error.`,
          fields: [
            {
              type: 'string',
              name: '_playbookId',
              label: 'Playbook ID',
              helpText: 'System field — do not edit',
              defaultValue: playbookId,
              required: true,
            },
          ],
          acceptLabel: 'Delete Playbook',
          cancelLabel: 'Cancel',
        },
      },
    },
    200
  );
});

// Step 2: mod confirms → delete
type ManageConfirmValues = {
  _playbookId: string;
};

configPlaybookForms.post('/manage-playbook-confirm', async (c) => {
  const body = await c.req.json<ManageConfirmValues>();
  const playbookId = body._playbookId?.trim();
  if (!playbookId) {
    return c.json<UiResponse>({ showToast: 'Session error — please try again.' }, 200);
  }

  const playbook = await getPlaybook(redis, playbookId);
  const name = playbook?.name ?? playbookId;

  await deletePlaybook(redis, playbookId);

  return c.json<UiResponse>(
    { showToast: { text: `Playbook "${name}" deleted.`, appearance: 'success' } },
    200
  );
});
