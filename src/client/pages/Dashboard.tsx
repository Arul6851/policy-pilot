import { useEffect, useState } from 'react';
import type { DashboardResponse } from '../../shared/api';
import type { LedgerAction } from '../../shared/types';

// ─── types ────────────────────────────────────────────────────────────────────
type State =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ok'; data: DashboardResponse };

// ─── constants ────────────────────────────────────────────────────────────────
const ACTION_CFG: Record<LedgerAction, { label: string; bar: string; pill: string; pillText: string }> = {
  remove:  { label: 'Remove',   bar: 'bg-rose-500',    pill: 'bg-rose-100 dark:bg-rose-900/30',     pillText: 'text-rose-600 dark:text-rose-400' },
  warn:    { label: 'Warn',     bar: 'bg-amber-400',   pill: 'bg-amber-100 dark:bg-amber-900/30',   pillText: 'text-amber-600 dark:text-amber-400' },
  tempban: { label: 'Temp Ban', bar: 'bg-orange-500',  pill: 'bg-orange-100 dark:bg-orange-900/30', pillText: 'text-orange-600 dark:text-orange-400' },
  permban: { label: 'Perm Ban', bar: 'bg-rose-800',    pill: 'bg-rose-100 dark:bg-rose-900/20',     pillText: 'text-rose-700 dark:text-rose-300' },
  approve: { label: 'Approve',  bar: 'bg-emerald-500', pill: 'bg-emerald-100 dark:bg-emerald-900/30', pillText: 'text-emerald-600 dark:text-emerald-400' },
  note:    { label: 'Note',     bar: 'bg-slate-400',   pill: 'bg-slate-100 dark:bg-slate-700/50',   pillText: 'text-slate-500 dark:text-slate-400' },
};

// ─── hooks ────────────────────────────────────────────────────────────────────
function useCountUp(target: number, duration = 1000): number {
  const [val, setVal] = useState(0);
  useEffect(() => {
    if (target === 0) return;
    let raf: number;
    const start = performance.now();
    const tick = (now: number) => {
      const t = Math.min((now - start) / duration, 1);
      const ease = 1 - Math.pow(1 - t, 3);
      setVal(Math.round(ease * target));
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, duration]);
  return val;
}

// ─── primitives ───────────────────────────────────────────────────────────────
function Skel({ h = 'h-8', rounded = 'rounded-2xl' }: { h?: string; rounded?: string }) {
  return <div className={`ske ${h} w-full ${rounded}`} />;
}

function StatTile({
  label, value, sub, accentHex,
}: {
  label: string; value: number | string; sub?: string; accentHex: string;
}) {
  const numeric = typeof value === 'number' ? value : NaN;
  const counted = useCountUp(isNaN(numeric) ? 0 : numeric);
  const display = isNaN(numeric) ? value : counted;

  return (
    <div
      className="bg-white dark:bg-gray-800/60 border border-gray-100 dark:border-gray-700/40 rounded-2xl p-4 shadow-sm transition-all duration-200 hover:shadow-lg hover:-translate-y-0.5"
      style={{ borderTop: `3px solid ${accentHex}` }}
    >
      <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400 dark:text-gray-500">
        {label}
      </p>
      <p className="text-3xl font-black mt-1.5 text-gray-900 dark:text-white tabular-nums leading-none">
        {display}
      </p>
      {sub && (
        <p className="text-[11px] text-gray-400 dark:text-gray-500 mt-1">{sub}</p>
      )}
    </div>
  );
}

function AnimatedBar({
  label, value, max, barClass,
}: {
  label: string; value: number; max: number; barClass: string;
}) {
  const [w, setW] = useState(0);
  useEffect(() => {
    const t = setTimeout(() => setW(Math.max((value / max) * 100, 3)), 80);
    return () => clearTimeout(t);
  }, [value, max]);

  return (
    <div className="flex items-center gap-3">
      <span className="w-20 text-right text-[11px] text-gray-400 dark:text-gray-500 truncate shrink-0">
        {label}
      </span>
      <div className="flex-1 bg-gray-100 dark:bg-gray-700/50 rounded-full h-2 overflow-hidden">
        <div
          className={`h-full rounded-full ${barClass}`}
          style={{
            width: `${w}%`,
            transition: 'width 900ms cubic-bezier(0.22, 1, 0.36, 1)',
          }}
        />
      </div>
      <span className="text-xs font-bold text-gray-600 dark:text-gray-300 tabular-nums w-5 text-right shrink-0">
        {value}
      </span>
    </div>
  );
}

function Card({
  title, children, delay = 0, className = '',
}: {
  title: string; children: React.ReactNode; delay?: number; className?: string;
}) {
  return (
    <div
      className={`bg-white dark:bg-gray-800/60 border border-gray-100 dark:border-gray-700/40 rounded-2xl p-5 shadow-sm transition-shadow hover:shadow-md ${className}`}
      style={{ animation: `fadeInUp 0.45s ease-out ${delay}ms both` }}
    >
      <h2 className="text-[10px] font-bold uppercase tracking-[0.14em] text-gray-400 dark:text-gray-500 mb-4">
        {title}
      </h2>
      {children}
    </div>
  );
}

// ─── loading skeleton ─────────────────────────────────────────────────────────
function LoadingSkeleton() {
  return (
    <div className="min-h-screen bg-slate-50 dark:bg-[#0f1117]">
      <div className="h-[68px]" style={{ background: 'linear-gradient(135deg, #d93900, #e85d04)' }} />
      <div className="p-4 space-y-3 max-w-2xl mx-auto">
        <div className="grid grid-cols-3 gap-3">
          <Skel h="h-[88px]" />
          <Skel h="h-[88px]" />
          <Skel h="h-[88px]" />
        </div>
        <Skel h="h-36" />
        <div className="grid grid-cols-2 gap-3">
          <Skel h="h-32" />
          <Skel h="h-32" />
        </div>
        <Skel h="h-52" />
      </div>
    </div>
  );
}

// ─── main ─────────────────────────────────────────────────────────────────────
export function Dashboard() {
  const [state, setState] = useState<State>({ status: 'loading' });

  useEffect(() => {
    fetch('/api/dashboard')
      .then((r) => r.json())
      .then((data) => setState({ status: 'ok', data: data as DashboardResponse }))
      .catch((err: unknown) => setState({ status: 'error', message: String(err) }));
  }, []);

  if (state.status === 'loading') return <LoadingSkeleton />;

  if (state.status === 'error') {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen gap-3 bg-slate-50 dark:bg-[#0f1117]">
        <span className="text-4xl">⚠️</span>
        <p className="text-sm font-semibold text-gray-700 dark:text-gray-300">Failed to load dashboard</p>
        <p className="text-xs text-gray-400 max-w-xs text-center">{state.message}</p>
        <button
          onClick={() => window.location.reload()}
          className="mt-2 px-5 py-2 rounded-full bg-[#d93900] text-white text-xs font-bold hover:bg-[#c23300] transition-colors"
        >
          Retry
        </button>
      </div>
    );
  }

  const { week, recentActions, lastRefresh, currentUsername } = state.data;
  const consistencyPct =
    week.totalActions > 0
      ? Math.round((week.playbookUsage / week.totalActions) * 100)
      : 0;

  const actionEntries = (
    Object.entries(week.actionBreakdown) as [LedgerAction, number][]
  )
    .filter(([, v]) => v > 0)
    .map(([action, count]) => ({
      key: action,
      label: ACTION_CFG[action]?.label ?? action,
      value: count,
      barClass: ACTION_CFG[action]?.bar ?? 'bg-gray-400',
    }));

  const modEntries = Object.entries(week.modBreakdown ?? {})
    .filter(([, v]) => v > 0)
    .map(([mod, count]) => ({
      key: mod,
      label: `u/${mod}`,
      value: count,
      barClass: 'bg-blue-500',
    }));

  const ruleEntries = Object.entries(week.ruleBreakdown ?? {})
    .filter(([, v]) => v > 0)
    .map(([ruleId, count]) => ({
      key: ruleId,
      label: `Rule ${ruleId}`,
      value: count,
      barClass: 'bg-violet-500',
    }));

  const actionMax = Math.max(...actionEntries.map((e) => e.value), 1);
  const modMax = Math.max(...modEntries.map((e) => e.value), 1);
  const ruleMax = Math.max(...ruleEntries.map((e) => e.value), 1);

  const refreshLabel = lastRefresh
    ? new Date(lastRefresh).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })
    : null;

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-[#0f1117] text-gray-900 dark:text-white">

      {/* ── Header ── */}
      <div
        className="px-5 py-4 flex items-center justify-between"
        style={{
          background: 'linear-gradient(135deg, #d93900 0%, #e85d04 100%)',
          animation: 'fadeInUp 0.3s ease-out both',
        }}
      >
        <div>
          <h1 className="text-lg font-black text-white tracking-tight">PolicyPilot</h1>
          <p className="text-xs text-orange-200 mt-0.5">
            {week.date} &middot; u/{currentUsername}
          </p>
        </div>
        {refreshLabel && (
          <span className="text-xs text-orange-100 bg-white/15 backdrop-blur-sm rounded-full px-3 py-1 font-medium">
            ↻ {refreshLabel}
          </span>
        )}
      </div>

      <div className="p-4 space-y-3 max-w-2xl mx-auto">

        {/* ── Stat tiles ── */}
        <div className="grid grid-cols-3 gap-3">
          {(
            [
              { label: 'Actions (7d)', value: week.totalActions, hex: '#d93900', delay: 60 },
              { label: 'Users (7d)',   value: week.uniqueUsers,  hex: '#3b82f6', delay: 130 },
              {
                label: 'Playbook Rate',
                value: `${consistencyPct}%`,
                sub: `${week.playbookUsage} / ${week.totalActions}`,
                hex: '#8b5cf6',
                delay: 200,
              },
            ] as { label: string; value: number | string; sub?: string; hex: string; delay: number }[]
          ).map(({ label, value, sub, hex, delay }) => (
            <div key={label} style={{ animation: `fadeInUp 0.4s ease-out ${delay}ms both` }}>
              <StatTile label={label} value={value} {...(sub !== undefined ? { sub } : {})} accentHex={hex} />
            </div>
          ))}
        </div>

        {/* ── Actions by type ── */}
        <Card title="Actions by Type" delay={270}>
          {actionEntries.length === 0 ? (
            <p className="text-sm text-gray-400 dark:text-gray-500">No actions in the last 7 days</p>
          ) : (
            <div className="space-y-3">
              {actionEntries.map((e) => (
                <AnimatedBar key={e.key} label={e.label} value={e.value} max={actionMax} barClass={e.barClass} />
              ))}
            </div>
          )}
        </Card>

        {/* ── Mod workload + Top offenders ── */}
        <div
          className="grid grid-cols-2 gap-3"
          style={{ animation: 'fadeInUp 0.45s ease-out 340ms both' }}
        >
          <div className="bg-white dark:bg-gray-800/60 border border-gray-100 dark:border-gray-700/40 rounded-2xl p-5 shadow-sm">
            <h2 className="text-[10px] font-bold uppercase tracking-[0.14em] text-gray-400 dark:text-gray-500 mb-4">
              Mod Workload
            </h2>
            {modEntries.length === 0 ? (
              <p className="text-sm text-gray-400 dark:text-gray-500">No data yet</p>
            ) : (
              <div className="space-y-3">
                {modEntries.map((e) => (
                  <AnimatedBar key={e.key} label={e.label} value={e.value} max={modMax} barClass={e.barClass} />
                ))}
              </div>
            )}
          </div>

          <div className="bg-white dark:bg-gray-800/60 border border-gray-100 dark:border-gray-700/40 rounded-2xl p-5 shadow-sm">
            <h2 className="text-[10px] font-bold uppercase tracking-[0.14em] text-gray-400 dark:text-gray-500 mb-4">
              Top Offenders
            </h2>
            {week.topOffenders.length === 0 ? (
              <p className="text-sm text-gray-400 dark:text-gray-500">All clear</p>
            ) : (
              <div className="space-y-2.5">
                {week.topOffenders.map((o, i) => (
                  <div key={o.userId} className="flex items-center gap-2">
                    <span className="text-[11px] font-bold text-gray-300 dark:text-gray-600 w-4 shrink-0">
                      {i + 1}
                    </span>
                    <span className="text-xs font-semibold text-gray-800 dark:text-gray-200 flex-1 truncate">
                      u/{o.username}
                    </span>
                    <span className="shrink-0 text-xs font-bold bg-rose-100 dark:bg-rose-900/30 text-rose-600 dark:text-rose-400 rounded-full px-2 py-0.5 tabular-nums">
                      {o.count}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* ── Rule breakdown (conditional) ── */}
        {ruleEntries.length > 0 && (
          <Card title="Actions by Rule" delay={410}>
            <div className="space-y-3">
              {ruleEntries.map((e) => (
                <AnimatedBar key={e.key} label={e.label} value={e.value} max={ruleMax} barClass={e.barClass} />
              ))}
            </div>
          </Card>
        )}

        {/* ── Recent activity ── */}
        <Card title="Recent Activity (24h)" delay={480}>
          {recentActions.length === 0 ? (
            <p className="text-sm text-gray-400 dark:text-gray-500">No activity in the last 24 hours</p>
          ) : (
            <div className="space-y-px">
              {recentActions.slice(0, 15).map((e) => {
                const cfg = ACTION_CFG[e.action];
                return (
                  <div
                    key={e.id}
                    className="flex items-center gap-2.5 py-2.5 border-b border-gray-50 dark:border-gray-700/30 last:border-0 rounded-lg px-1.5 -mx-1.5 transition-colors hover:bg-slate-50 dark:hover:bg-gray-700/20"
                  >
                    <span
                      className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${cfg?.pill ?? 'bg-gray-100'} ${cfg?.pillText ?? 'text-gray-500'}`}
                    >
                      {cfg?.label ?? e.action}
                    </span>
                    <span className="flex-1 text-xs font-semibold text-gray-800 dark:text-gray-200 truncate">
                      u/{e.userId}
                    </span>
                    <span className="text-[11px] text-gray-400 dark:text-gray-500 truncate max-w-[72px] hidden sm:block">
                      {e.modId === 'PolicyPilot' ? 'auto' : `u/${e.modId}`}
                    </span>
                    <span className="text-[11px] text-gray-400 dark:text-gray-500 tabular-nums shrink-0">
                      {new Date(e.timestamp).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}
                    </span>
                    {e.usedPlaybook && (
                      <span className="shrink-0 text-[10px] font-black text-violet-500 dark:text-violet-400 uppercase">
                        pb
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </Card>

      </div>
    </div>
  );
}
