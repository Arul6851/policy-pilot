import { Hono } from 'hono';
import { context, redis, reddit } from '@devvit/web/server';
import type {
  DashboardResponse,
  InitResponse,
} from '../../shared/api';
import { getCachedMetrics, computeDailyMetrics, saveDailyMetrics } from '../services/metricsService';
import { getRecentLedgerUsers, getLedgerEntriesSince } from '../services/ledgerService';
import { DASHBOARD_LAST_REFRESH_KEY } from '../utils/redisKeys';

type ErrorResponse = {
  status: 'error';
  message: string;
};

export const api = new Hono();

api.get('/dashboard', async (c) => {
  const today = new Date().toISOString().slice(0, 10);

  let metrics = await getCachedMetrics(redis, today);
  if (!metrics) {
    metrics = await computeDailyMetrics(redis, today);
    await saveDailyMetrics(redis, metrics);
    await redis.set(DASHBOARD_LAST_REFRESH_KEY, String(Date.now()));
  }

  const since = Date.now() - 86_400_000;
  const recentUserIds = await getRecentLedgerUsers(redis, since);
  const actionArrays = await Promise.all(
    recentUserIds.slice(0, 10).map((id) => getLedgerEntriesSince(redis, id, since))
  );
  const recentActions = actionArrays
    .flat()
    .sort((a, b) => b.timestamp - a.timestamp)
    .slice(0, 20);

  const lastRefreshRaw = await redis.get(DASHBOARD_LAST_REFRESH_KEY);
  const lastRefresh = lastRefreshRaw ? parseInt(lastRefreshRaw, 10) : 0;

  const currentUsername = (await reddit.getCurrentUsername()) ?? 'mod';

  return c.json<DashboardResponse>(
    { type: 'dashboard', today: metrics, recentActions, lastRefresh, currentUsername },
    200
  );
});

api.get('/init', async (c) => {
  const { postId } = context;

  if (!postId) {
    console.error('API Init Error: postId not found in devvit context');
    return c.json<ErrorResponse>(
      {
        status: 'error',
        message: 'postId is required but missing from context',
      },
      400
    );
  }

  try {
    const [count, username] = await Promise.all([
      redis.get('count'),
      reddit.getCurrentUsername(),
    ]);

    return c.json<InitResponse>({
      type: 'init',
      postId: postId,
      count: count ? parseInt(count) : 0,
      username: username ?? 'anonymous',
    });
  } catch (error) {
    console.error(`API Init Error for post ${postId}:`, error);
    let errorMessage = 'Unknown error during initialization';
    if (error instanceof Error) {
      errorMessage = `Initialization failed: ${error.message}`;
    }
    return c.json<ErrorResponse>(
      { status: 'error', message: errorMessage },
      400
    );
  }
});

