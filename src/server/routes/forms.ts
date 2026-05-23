import { Hono } from 'hono';
import type { UiResponse } from '@devvit/web/shared';
import { runPlaybookForms } from '../menuItems/runPlaybook';
import { configPlaybookForms } from '../menuItems/configPlaybook';
import { viewHistoryForms } from '../menuItems/viewHistory';

type ExampleFormValues = {
  message?: string;
};

export const forms = new Hono();

forms.route('', runPlaybookForms);
forms.route('', configPlaybookForms);
forms.route('', viewHistoryForms);

forms.post('/example-submit', async (c) => {
  const { message } = await c.req.json<ExampleFormValues>();
  const trimmedMessage = typeof message === 'string' ? message.trim() : '';

  return c.json<UiResponse>(
    {
      showToast: trimmedMessage
        ? `Form says: ${trimmedMessage}`
        : 'Form submitted with no message',
    },
    200
  );
});
