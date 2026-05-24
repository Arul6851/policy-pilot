import './index.css';

import { context, requestExpandedMode } from '@devvit/web/client';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

function Feature({ icon, text }: { icon: string; text: string }) {
  return (
    <div className="flex items-center gap-3">
      <span className="text-base">{icon}</span>
      <span className="text-sm text-gray-600 dark:text-gray-300 font-medium">{text}</span>
    </div>
  );
}

export const Splash = () => {
  return (
    <div className="relative flex flex-col justify-center items-center min-h-screen bg-slate-50 dark:bg-[#0f1117] px-6 gap-6 overflow-hidden">

      {/* Radial glow behind icon */}
      <div
        className="absolute top-0 left-1/2 -translate-x-1/2 w-96 h-96 rounded-full pointer-events-none"
        style={{
          background: 'radial-gradient(ellipse at center, rgba(217,57,0,0.12) 0%, transparent 70%)',
        }}
      />

      {/* App icon */}
      <div
        className="w-20 h-20 rounded-[22px] flex items-center justify-center relative"
        style={{
          background: 'linear-gradient(135deg, #d93900 0%, #e85d04 100%)',
          boxShadow: '0 20px 60px rgba(217,57,0,0.35)',
          animation: 'fadeInUp 0.5s ease-out 0.05s both',
        }}
      >
        <span
          className="text-white font-black text-[28px] select-none"
          style={{ letterSpacing: '-0.04em' }}
        >
          PP
        </span>
      </div>

      {/* Title + subtitle */}
      <div
        className="flex flex-col items-center gap-1.5 text-center"
        style={{ animation: 'fadeInUp 0.5s ease-out 0.15s both' }}
      >
        <h1 className="text-3xl font-black tracking-tight text-gray-900 dark:text-white">
          PolicyPilot
        </h1>
        <p className="text-sm font-medium text-gray-500 dark:text-gray-400">
          Consistent moderation, every time
        </p>
      </div>

      {/* Feature list card */}
      <div
        className="bg-white dark:bg-gray-800/60 border border-gray-100 dark:border-gray-700/40 rounded-2xl p-4 w-full max-w-xs shadow-sm space-y-2.5"
        style={{ animation: 'fadeInUp 0.5s ease-out 0.25s both' }}
      >
        <Feature icon="📋" text="Playbook-driven decisions" />
        <Feature icon="📊" text="Per-user reputation ledger" />
        <Feature icon="🛡️" text="Auto-escalation alerts" />
      </div>

      {/* CTA */}
      <div style={{ animation: 'fadeInUp 0.5s ease-out 0.35s both' }}>
        <button
          className="flex items-center gap-2 px-8 py-3 rounded-full text-white text-sm font-bold transition-all duration-200 hover:scale-105 hover:shadow-xl active:scale-95"
          style={{
            background: 'linear-gradient(135deg, #d93900, #e85d04)',
            boxShadow: '0 8px 24px rgba(217,57,0,0.35)',
          }}
          onClick={(e) => requestExpandedMode(e.nativeEvent, 'game')}
        >
          Open Dashboard
          <span className="text-orange-200 font-black">→</span>
        </button>
      </div>

      {/* Welcome line */}
      <p
        className="text-xs text-gray-400 dark:text-gray-600"
        style={{ animation: 'fadeInUp 0.5s ease-out 0.45s both' }}
      >
        Welcome, {context.username ?? 'moderator'}
      </p>

    </div>
  );
};

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Splash />
  </StrictMode>
);
