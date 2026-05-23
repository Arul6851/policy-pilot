import { useEffect, useState } from 'react';
import type { DashboardResponse } from '../../shared/api';
import type { LedgerAction } from '../../shared/types';

type State =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ok'; data: DashboardResponse };

const ACTION_COLORS: Record<LedgerAction, string> = {
  remove: 'bg-red-500',
  warn: 'bg-yellow-400',
  tempban: 'bg-orange-500',
  permban: 'bg-red-700',
  approve: 'bg-green-500',
  note: 'bg-gray-400',
};

const ACTION_LABELS: Record<LedgerAction, string> = {
  remove: 'Remove',
  warn: 'Warn',
  tempban: 'Temp Ban',
  permban: 'Perm Ban',
  approve: 'Approve',
  note: 'Note',
};

function formatTime(ts: number): string {
  return new Date(ts).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
}

function BarChart({ data, colorClass = 'bg-orange-500' }: { data: Record<string, number>; colorClass?: string }) {
  const entries = Object.entries(data).filter(([, v]) => v > 0);
  if (entries.length === 0) return <p className="text-gray-400 text-xs">No data</p>;
  const max = Math.max(...entries.map(([, v]) => v), 1);
  return (
    <div className="space-y-1.5">
      {entries.map(([key, val]) => (
        <div key={key} className="flex items-center gap-2 text-xs">
          <span className="w-20 text-right text-gray-500 dark:text-gray-400 truncate">{key}</span>
          <div className="flex-1 bg-gray-100 dark:bg-gray-700 rounded-full h-4 overflow-hidden">
            <div
              className={`h-full rounded-full ${colorClass}`}
              style={{ width: `${Math.max((val / max) * 100, 4)}%` }}
            />
          </div>
          <span className="w-6 text-right text-gray-600 dark:text-gray-300 font-mono">{val}</span>
        </div>
      ))}
    </div>
  );
}

function StatTile({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg p-4 shadow-sm border border-gray-100 dark:border-gray-700">
      <p className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">{label}</p>
      <p className="text-3xl font-bold text-gray-900 dark:text-white mt-1">{value}</p>
      {sub && <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">{sub}</p>}
    </div>
  );
}

export function Dashboard() {
  const [state, setState] = useState<State>({ status: 'loading' });

  useEffect(() => {
    fetch('/api/dashboard')
      .then((r) => r.json())
      .then((data) => setState({ status: 'ok', data: data as DashboardResponse }))
      .catch((err: unknown) => setState({ status: 'error', message: String(err) }));
  }, []);

  if (state.status === 'loading') {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-50 dark:bg-gray-900">
        <p className="text-gray-500">Loading dashboard...</p>
      </div>
    );
  }

  if (state.status === 'error') {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-50 dark:bg-gray-900">
        <p className="text-red-500">Failed to load: {state.message}</p>
      </div>
    );
  }

  const { today, recentActions, lastRefresh, currentUsername } = state.data;
  const consistencyPct =
    today.totalActions > 0
      ? Math.round((today.playbookUsage / today.totalActions) * 100)
      : 0;

  const actionLabels: Record<string, number> = {};
  for (const [action, count] of Object.entries(today.actionBreakdown)) {
    if (count > 0) {
      actionLabels[ACTION_LABELS[action as LedgerAction] ?? action] = count;
    }
  }

  const ruleLabels: Record<string, number> = {};
  for (const [ruleId, count] of Object.entries(today.ruleBreakdown)) {
    ruleLabels[`Rule ${ruleId}`] = count;
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 text-gray-900 dark:text-white">
      <div className="bg-[#d93900] text-white px-6 py-4 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold">PolicyPilot</h1>
          <p className="text-orange-100 text-xs mt-0.5">
            {today.date} · u/{currentUsername}
          </p>
        </div>
        <p className="text-xs text-orange-200">
          {lastRefresh ? `Refreshed ${formatTime(lastRefresh)}` : 'Not yet refreshed'}
        </p>
      </div>

      <div className="p-4 space-y-4 max-w-2xl mx-auto">
        <div className="grid grid-cols-3 gap-3">
          <StatTile label="Actions Today" value={today.totalActions} />
          <StatTile label="Unique Users" value={today.uniqueUsers} />
          <StatTile
            label="Playbook Usage"
            value={`${consistencyPct}%`}
            sub={`${today.playbookUsage} of ${today.totalActions}`}
          />
        </div>

        <div className="bg-white dark:bg-gray-800 rounded-lg p-4 shadow-sm border border-gray-100 dark:border-gray-700">
          <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-200 mb-3">
            Actions by Type
          </h2>
          <BarChart data={actionLabels} colorClass="bg-[#d93900]" />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="bg-white dark:bg-gray-800 rounded-lg p-4 shadow-sm border border-gray-100 dark:border-gray-700">
            <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-200 mb-3">
              Mod Workload
            </h2>
            <BarChart data={today.modBreakdown ?? {}} colorClass="bg-blue-500" />
          </div>

          <div className="bg-white dark:bg-gray-800 rounded-lg p-4 shadow-sm border border-gray-100 dark:border-gray-700">
            <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-200 mb-3">
              Top Offenders
            </h2>
            {today.topOffenders.length === 0 ? (
              <p className="text-gray-400 text-xs">No offenders today</p>
            ) : (
              <div className="space-y-1.5">
                {today.topOffenders.map((o, i) => (
                  <div key={o.userId} className="flex items-center justify-between text-xs">
                    <span className="text-gray-600 dark:text-gray-300">
                      <span className="text-gray-400 mr-1">#{i + 1}</span>u/{o.username}
                    </span>
                    <span className="font-semibold bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400 px-1.5 py-0.5 rounded">
                      {o.count}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {Object.keys(ruleLabels).length > 0 && (
          <div className="bg-white dark:bg-gray-800 rounded-lg p-4 shadow-sm border border-gray-100 dark:border-gray-700">
            <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-200 mb-3">
              Actions by Rule
            </h2>
            <BarChart data={ruleLabels} colorClass="bg-purple-500" />
          </div>
        )}

        <div className="bg-white dark:bg-gray-800 rounded-lg p-4 shadow-sm border border-gray-100 dark:border-gray-700">
          <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-200 mb-3">
            Recent Actions (24h)
          </h2>
          {recentActions.length === 0 ? (
            <p className="text-gray-400 text-xs">No actions in the last 24 hours</p>
          ) : (
            <div className="space-y-0.5">
              {recentActions.slice(0, 15).map((e) => (
                <div
                  key={e.id}
                  className="flex items-center gap-2 text-xs py-1.5 border-b border-gray-50 dark:border-gray-700/50 last:border-0"
                >
                  <span
                    className={`w-14 shrink-0 text-center text-white rounded px-1 py-0.5 text-[10px] font-medium ${ACTION_COLORS[e.action] ?? 'bg-gray-400'}`}
                  >
                    {e.action}
                  </span>
                  <span className="text-gray-700 dark:text-gray-200 flex-1 truncate font-medium">
                    u/{e.userId}
                  </span>
                  <span className="text-gray-400 dark:text-gray-500 truncate hidden sm:block">
                    by u/{e.modId}
                  </span>
                  <span className="text-gray-400 dark:text-gray-500 w-14 shrink-0 text-right">
                    {formatTime(e.timestamp)}
                  </span>
                  {e.usedPlaybook && (
                    <span className="text-[10px] text-orange-500 font-bold shrink-0">PB</span>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
