import type { RedisClient } from '@devvit/redis';
import type { CachedProfile } from '../../shared/types';
import { PROFILE_KEY, PROFILE_TTL_SECONDS } from '../utils/redisKeys';
import { reddit } from '@devvit/web/server';

/**
 * Returns a cached profile for the given username, fetching from the Reddit
 * API on cache miss. The cache TTL is 1 hour (PROFILE_TTL_SECONDS).
 *
 * isSubscriber defaults to true — subscriber status cannot be determined
 * cheaply via the public Devvit API without listing all subreddit members.
 */
export async function getOrFetchProfile(
  redis: RedisClient,
  username: string
): Promise<CachedProfile> {
  const cached = await redis.get(PROFILE_KEY(username));
  if (cached) return JSON.parse(cached) as CachedProfile;

  const now = Date.now();

  // Build a safe default in case the API call fails
  let profile: CachedProfile = {
    userId: username,
    username,
    accountAgeDays: 0,
    karma: 0,
    isSubscriber: true,
    cachedAt: now,
  };

  try {
    const user = await reddit.getUserByUsername(username);
    if (user) {
      profile = {
        userId: user.id,
        username: user.username,
        accountAgeDays: Math.floor((now - user.createdAt.getTime()) / 86_400_000),
        karma: user.linkKarma + user.commentKarma,
        isSubscriber: true,
        cachedAt: now,
      };
    }
  } catch { /* fall through to default profile */ }

  await redis.set(PROFILE_KEY(username), JSON.stringify(profile));
  await redis.expire(PROFILE_KEY(username), PROFILE_TTL_SECONDS);
  return profile;
}

export async function invalidateProfile(
  redis: RedisClient,
  username: string
): Promise<void> {
  await redis.del(PROFILE_KEY(username));
}
