import type { RedisClient } from '@devvit/redis';
import type { Playbook, PlaybookAction, PlaybookCondition } from '../../shared/types';
import { PLAYBOOK_KEY, PLAYBOOKS_INDEX_KEY } from '../utils/redisKeys';

export type ConditionValues = {
  accountAgeDays: number;
  karma: number;
  isSubscriber: boolean;
  offensesByRule: Record<string, number>; // '' key = total across all rules
};

function evalCondition(condition: PlaybookCondition, values: ConditionValues): boolean {
  let actual: number | boolean;

  switch (condition.type) {
    case 'accountAge':
      actual = values.accountAgeDays;
      break;
    case 'priorOffenses':
      actual = values.offensesByRule[condition.ruleScope ?? ''] ?? 0;
      break;
    case 'karma':
      actual = values.karma;
      break;
    case 'isSubscriber':
      return values.isSubscriber === condition.value;
    case 'custom':
      return false;
    default:
      return false;
  }

  const v = condition.value as number;
  switch (condition.operator) {
    case 'lt': return (actual as number) < v;
    case 'lte': return (actual as number) <= v;
    case 'gt': return (actual as number) > v;
    case 'gte': return (actual as number) >= v;
    case 'eq': return actual === condition.value;
    default: return false;
  }
}

export function evaluatePlaybook(
  playbook: Playbook,
  values: ConditionValues
): { action: PlaybookAction; reasoning: string } | null {
  if (!playbook.steps.length) return null;

  const stepMap = new Map(playbook.steps.map((s) => [s.id, s]));
  const firstStep = playbook.steps[0];
  if (!firstStep) return null;
  let stepId = firstStep.id;
  const path: string[] = [];

  for (let depth = 0; depth < 20; depth++) {
    const step = stepMap.get(stepId);
    if (!step) break;

    const met = evalCondition(step.condition, values);
    const { type, operator, value } = step.condition;
    path.push(`${type} ${operator} ${String(value)}: ${met ? 'yes' : 'no'}`);

    const outcome = met ? step.trueAction : step.falseAction;
    if ('nextStepId' in outcome) {
      stepId = outcome.nextStepId;
    } else {
      return { action: outcome, reasoning: path.join(' → ') };
    }
  }

  return null;
}

export async function savePlaybook(redis: RedisClient, playbook: Playbook): Promise<void> {
  await Promise.all([
    redis.set(PLAYBOOK_KEY(playbook.id), JSON.stringify(playbook)),
    redis.hSet(PLAYBOOKS_INDEX_KEY, { [playbook.id]: playbook.name }),
  ]);
}

export async function getPlaybook(redis: RedisClient, id: string): Promise<Playbook | null> {
  const raw = await redis.get(PLAYBOOK_KEY(id));
  return raw ? (JSON.parse(raw) as Playbook) : null;
}

export async function getAllPlaybooks(redis: RedisClient): Promise<Playbook[]> {
  const index = await redis.hGetAll(PLAYBOOKS_INDEX_KEY);
  if (!index || !Object.keys(index).length) return [];
  const results = await Promise.all(Object.keys(index).map((id) => getPlaybook(redis, id)));
  return results.filter((p): p is Playbook => p !== null);
}

export async function deletePlaybook(redis: RedisClient, id: string): Promise<void> {
  await Promise.all([redis.del(PLAYBOOK_KEY(id)), redis.hDel(PLAYBOOKS_INDEX_KEY, [id])]);
}
