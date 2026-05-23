import type { DailyMetrics, LedgerEntry } from './types';

export type DashboardResponse = {
  type: 'dashboard';
  today: DailyMetrics;
  recentActions: LedgerEntry[];
  lastRefresh: number;
  currentUsername: string;
};

export type InitResponse = {
  type: 'init';
  postId: string;
  count: number;
  username: string;
};

export type IncrementResponse = {
  type: 'increment';
  postId: string;
  count: number;
};

export type DecrementResponse = {
  type: 'decrement';
  postId: string;
  count: number;
};
