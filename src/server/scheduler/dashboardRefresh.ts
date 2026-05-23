import { Hono } from 'hono';
import { redis } from '@devvit/web/server';
import type { TaskResponse } from '@devvit/scheduler';
import { refreshMetrics } from '../services/metricsService';

export const schedulerRoutes = new Hono();

schedulerRoutes.post('/dashboard-refresh', async (c) => {
  await refreshMetrics(redis);
  return c.json<TaskResponse>({}, 200);
});
