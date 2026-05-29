import { Hono } from 'hono';
import { context, redis, reddit } from '@devvit/web/server';
import type {
  DashboardResponse,
  InitResponse,
} from '../../shared/api';
import { computeWeekMetrics } from '../services/metricsService';
import { getRecentLedgerUsers, getLedgerEntriesSince } from '../services/ledgerService';
import { DASHBOARD_LAST_REFRESH_KEY } from '../utils/redisKeys';

type ErrorResponse = {
  status: 'error';
  message: string;
};

export const api = new Hono();

api.get('/dashboard', async (c) => {
  const since24h = Date.now() - 86_400_000;

  const [week, recentUserIds, lastRefreshRaw, currentUsername] = await Promise.all([
    computeWeekMetrics(redis),
    getRecentLedgerUsers(redis, since24h),
    redis.get(DASHBOARD_LAST_REFRESH_KEY),
    reddit.getCurrentUsername(),
  ]);

  const actionArrays = await Promise.all(
    recentUserIds.slice(0, 10).map((id) => getLedgerEntriesSince(redis, id, since24h))
  );
  const recentActions = actionArrays
    .flat()
    .sort((a, b) => b.timestamp - a.timestamp)
    .slice(0, 20);

  const lastRefresh = lastRefreshRaw ? parseInt(lastRefreshRaw, 10) : 0;

  return c.json<DashboardResponse>(
    { type: 'dashboard', week, recentActions, lastRefresh, currentUsername: currentUsername ?? 'mod' },
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

