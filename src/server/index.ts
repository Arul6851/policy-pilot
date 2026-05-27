import { Hono } from 'hono';
import { serve } from '@hono/node-server';
import { createServer, getServerPort } from '@devvit/web/server';
import { api } from './routes/api';
import { forms } from './routes/forms';
import { menu } from './routes/menu';
import { triggers } from './routes/triggers';
import { schedulerRoutes } from './scheduler/dashboardRefresh';
import { thresholdCheckerRoutes } from './scheduler/thresholdChecker';

const app = new Hono();
const internal = new Hono();

app.onError((err, c) => {
  console.error('PolicyPilot unhandled error:', err);
  return c.json({ error: 'internal server error' }, 500);
});

internal.route('/menu', menu);
internal.route('/form', forms);
internal.route('/triggers', triggers);
internal.route('/scheduler', schedulerRoutes);
internal.route('/scheduler', thresholdCheckerRoutes);

app.route('/api', api);
app.route('/internal', internal);

serve({
  fetch: app.fetch,
  createServer,
  port: getServerPort(),
});
