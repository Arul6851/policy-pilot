import { Hono } from 'hono';
import type { OnAppInstallRequest, TriggerResponse } from '@devvit/web/shared';
import { context } from '@devvit/web/server';
import { createPost } from '../core/post';
import { onModActionTrigger } from '../triggers/onModAction';

export const triggers = new Hono();

// Triggers must always return 200 — a non-200 causes Reddit to retry or drop
// the event. This catches any unhandled throw from any trigger route.
triggers.onError((err, c) => {
  console.error('PolicyPilot trigger unhandled error:', err);
  return c.json<TriggerResponse>({}, 200);
});

triggers.route('', onModActionTrigger);

triggers.post('/on-app-install', async (c) => {
  try {
    const post = await createPost();
    const input = await c.req.json<OnAppInstallRequest>();

    return c.json<TriggerResponse>(
      {
        status: 'success',
        message: `Post created in subreddit ${context.subredditName} with id ${post.id} (trigger: ${input.type})`,
      },
      200
    );
  } catch (error) {
    console.error(`Error creating post: ${error}`);
    return c.json<TriggerResponse>(
      {
        status: 'error',
        message: 'Failed to create post',
      },
      400
    );
  }
});
