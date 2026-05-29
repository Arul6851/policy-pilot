export const LEDGER_KEY = (userId: string) => `ledger:${userId}`;

// Secondary index: score = last action timestamp, member = userId
export const LEDGER_USERS_KEY = 'ledger:users';

export const PLAYBOOK_KEY = (playbookId: string) => `playbook:${playbookId}`;
export const PLAYBOOKS_INDEX_KEY = 'playbooks:index';

export const METRICS_DAILY_KEY = (date: string) => `metrics:daily:${date}`;

export const PROFILE_KEY = (userId: string) => `profile:${userId}`;
export const PROFILE_TTL_SECONDS = 3600;

export const CONFIG_APP_KEY = 'config:app';
export const CONFIG_DASH_POST_ID_KEY = 'config:dashPostId';
export const DASHBOARD_LAST_REFRESH_KEY = 'dashboard:lastRefresh';

// alert:threshold:{userId} — value = alert level sent, TTL = time window seconds
export const ALERT_SENT_KEY = (userId: string) => `alert:threshold:${userId}`;

// pb-dedup:{targetId} — TTL 30s, set by runPlaybook before executing a Reddit action
// so onModAction can skip logging the duplicate entry
export const PB_DEDUP_KEY = (targetId: string) => `pb-dedup:${targetId}`;
