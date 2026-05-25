import { Hono } from 'hono';
import type { UiResponse } from '@devvit/web/shared';
import { context, redis } from '@devvit/web/server';
import { getAllPlaybooks, savePlaybook } from '../services/playbookService';
import type { Playbook, PlaybookAction, PlaybookStep } from '../../shared/types';

const RULE_OPTIONS = [
  { label: 'Rule 1 — No spam or self-promotion', value: '1' },
  { label: 'Rule 2 — Be civil and respectful', value: '2' },
  { label: 'Rule 3 — No low-effort posts', value: '3' },
  { label: 'Rule 4 — Stay on topic', value: '4' },
  { label: 'Rule 5 — No misinformation', value: '5' },
  { label: 'Rule 6 — No ban evasion', value: '6' },
];

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

// ─── Menu handler: POST /config-playbook ─────────────────────────────────────

export const configPlaybookMenu = new Hono();

configPlaybookMenu.post('/config-playbook', async (c) => {
  let existingNote = '';
  try {
    const all = await getAllPlaybooks(redis);
    if (all.length) {
      existingNote = `\n\nExisting playbooks: ${all.map((p) => p.name).join(', ')}`;
    }
  } catch { /* non-fatal */ }

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
              options: RULE_OPTIONS,
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

// ─── Form handler: POST /config-playbook-save ─────────────────────────────────

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

  return c.json<UiResponse>(
    { showToast: { text: `Playbook "${name}" created.`, appearance: 'success' } },
    200
  );
});
