export type LedgerAction = 'remove' | 'warn' | 'tempban' | 'permban' | 'approve' | 'note';

export type LedgerEntry = {
  id: string;
  userId: string;
  action: LedgerAction;
  ruleId: string;
  modId: string;
  postId?: string;
  context?: string;
  usedPlaybook: boolean;
  timestamp: number;
};

export type ConditionType = 'accountAge' | 'priorOffenses' | 'karma' | 'isSubscriber' | 'custom';
export type ConditionOperator = 'lt' | 'gt' | 'eq' | 'gte' | 'lte';

export type PlaybookCondition = {
  type: ConditionType;
  operator: ConditionOperator;
  value: number | string | boolean;
  ruleScope?: string;
};

export type PlaybookActionType = 'remove' | 'warn' | 'tempban' | 'permban' | 'approve' | 'escalate' | 'note';

export type PlaybookAction = {
  type: PlaybookActionType;
  duration?: number;
  messageTemplate?: string;
  logToLedger: boolean;
};

export type NextStep = { nextStepId: string };

export type PlaybookStep = {
  id: string;
  condition: PlaybookCondition;
  trueAction: PlaybookAction;
  falseAction: PlaybookAction | NextStep;
};

export type Playbook = {
  id: string;
  name: string;
  ruleId: string;
  createdBy: string;
  updatedAt: number;
  steps: PlaybookStep[];
};

export type EscalationThresholds = {
  warningsBeforeTempBan: number;
  tempBansBeforePermBan: number;
  timeWindowDays: number;
};

export type AppConfig = {
  autoEscalationEnabled: boolean;
  dashboardRefreshMinutes: number;
  thresholdCheckMinutes: number;
  defaultEscalationThresholds: EscalationThresholds;
};

export type CachedProfile = {
  userId: string;
  username: string;
  accountAgeDays: number;
  karma: number;
  isSubscriber: boolean;
  cachedAt: number;
};

export type DailyMetrics = {
  date: string;
  totalActions: number;
  actionBreakdown: Record<LedgerAction, number>;
  uniqueUsers: number;
  playbookUsage: number;
  topOffenders: Array<{ userId: string; username: string; count: number }>;
  ruleBreakdown: Record<string, number>;
  modBreakdown: Record<string, number>;
};
