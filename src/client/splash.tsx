import './index.css';

import { navigateTo } from '@devvit/web/client';
import { context, requestExpandedMode } from '@devvit/web/client';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

export const Splash = () => {
  return (
    <div className="flex relative flex-col justify-center items-center min-h-screen gap-6 bg-white dark:bg-gray-900 px-6">
      <div className="flex flex-col items-center gap-1">
        <div className="text-5xl font-black tracking-tight text-gray-900 dark:text-white">
          PolicyPilot
        </div>
        <p className="text-sm text-center text-gray-500 dark:text-gray-400">
          Consistent moderation, every time
        </p>
      </div>
      <div className="flex flex-col items-center gap-3 text-center max-w-xs">
        <p className="text-sm text-gray-600 dark:text-gray-300">
          Welcome, {context.username ?? 'moderator'}. Open the dashboard to view
          team stats, top offenders, and playbook activity.
        </p>
      </div>
      <button
        className="flex items-center justify-center bg-[#d93900] dark:bg-orange-600 text-white w-auto h-10 rounded-full cursor-pointer transition-colors px-6 font-semibold hover:bg-[#c23300] dark:hover:bg-orange-700"
        onClick={(e) => requestExpandedMode(e.nativeEvent, 'game')}
      >
        Open Dashboard
      </button>
      <p className="text-xs text-gray-400 dark:text-gray-500 text-center max-w-xs">
        Use <strong>Run Playbook</strong> on any post or comment to apply your
        moderation policy step by step.
      </p>
    </div>
  );
};

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Splash />
  </StrictMode>
);
