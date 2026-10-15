'use client';
import React from 'react';
import { BasketIcon } from './icons';

export function Logo({ light = false }: { light?: boolean }) {
  return (
    <span className="flex items-center gap-2.5">
      <span className="grid place-items-center w-9 h-9 rounded-xl bg-gradient-to-br from-cyan-400 to-amber-400 shadow-lg">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden>
          <rect x="3" y="2.5" width="18" height="19" rx="2.5" fill="#0a1633" />
          <circle cx="12" cy="13.5" r="5.2" fill="none" stroke="#67e8f9" strokeWidth="1.8" />
          <circle cx="12" cy="13.5" r="1.4" fill="#fbbf24" />
          <path d="M7.5 13.5a4.5 4.5 0 0 1 9 0" stroke="#67e8f9" strokeWidth="1.4" strokeLinecap="round" />
          <rect x="6" y="5.2" width="4.5" height="1.6" rx=".8" fill="#fbbf24" />
          <circle cx="16.8" cy="6" r="1" fill="#67e8f9" />
        </svg>
      </span>
      <span className={`font-extrabold tracking-tight text-lg ${light ? 'text-white' : 'text-[#0a1633]'}`}>
        LAUNDROMAT <span className="hidden sm:inline font-medium text-cyan-500 text-xs tracking-[.2em]">WASH · DRY · RELAX</span>
      </span>
    </span>
  );
}

export function PageHeader({ kicker, title, sub, right }: { kicker?: string; title: string; sub?: string; right?: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3 mb-5 rise">
      <div>
        {kicker && <p className="label !text-cyan-600">{kicker}</p>}
        <h1 className="text-2xl md:text-3xl font-extrabold tracking-tight text-[#0a1633]">{title}</h1>
        {sub && <p className="text-slate-500 mt-1 max-w-xl">{sub}</p>}
      </div>
      {right}
    </div>
  );
}

export function Stat({ label, value, hint, tone = 'navy' }: { label: string; value: React.ReactNode; hint?: string; tone?: 'navy' | 'aqua' | 'amber' | 'rose' }) {
  const ring: Record<string, string> = {
    navy: 'from-[#0a1633] to-[#1d3a7a]', aqua: 'from-[#0e7490] to-[#22d3ee]',
    amber: 'from-amber-500 to-amber-300', rose: 'from-rose-500 to-rose-300',
  };
  return (
    <div className="card card-hover relative overflow-hidden">
      <div className={`absolute inset-x-0 top-0 h-1 bg-gradient-to-r ${ring[tone]}`} />
      <p className="label">{label}</p>
      <p className="text-2xl font-extrabold text-[#0a1633] mt-1">{value}</p>
      {hint && <p className="text-xs text-slate-500 mt-1">{hint}</p>}
    </div>
  );
}

const badgeTones: Record<string, string> = {
  washing: 'bg-cyan-100 text-cyan-800', drying: 'bg-amber-100 text-amber-800',
  queued: 'bg-slate-200 text-slate-700', waiting: 'bg-slate-200 text-slate-700',
  grace: 'bg-rose-100 text-rose-800', ready: 'bg-emerald-100 text-emerald-800',
  booked: 'bg-sky-100 text-sky-800', collected: 'bg-slate-200 text-slate-500',
  running: 'bg-cyan-100 text-cyan-800', available: 'bg-emerald-100 text-emerald-800',
  maintenance: 'bg-slate-300 text-slate-600', error: 'bg-rose-100 text-rose-800',
};
export function Badge({ status, children }: { status?: string; children?: React.ReactNode }) {
  const tone = badgeTones[status || ''] || 'bg-slate-100 text-slate-700';
  return (
    <span className={`badge ${tone}`}>
      <span className={`dot ${status === 'grace' || status === 'error' ? 'bg-rose-500 live-dot' : 'bg-current opacity-60'}`} />
      {children ?? status}
    </span>
  );
}

export function Empty({ title, sub, action }: { title: string; sub?: string; action?: React.ReactNode }) {
  return (
    <div className="card text-center py-10">
      <div className="mx-auto w-12 h-12 rounded-2xl bg-gradient-to-br from-cyan-100 to-amber-100 grid place-items-center text-cyan-700">
        <BasketIcon className="w-6 h-6" />
      </div>
      <p className="font-bold mt-3">{title}</p>
      {sub && <p className="text-sm text-slate-500 mt-1">{sub}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function Skeleton({ className = '' }: { className?: string }) {
  return <div className={`skeleton h-16 ${className}`} />;
}

export function ErrorBox({ message, retry }: { message: string; retry?: () => void }) {
  return (
    <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800 flex items-center justify-between gap-3">
      <span>{message}</span>
      {retry && <button className="btn !py-2 !px-3 !bg-rose-600" onClick={retry}>Retry</button>}
    </div>
  );
}

export function Steps({ steps, current }: { steps: string[]; current: number }) {
  return (
    <ol className="flex items-center gap-1.5 mb-5">
      {steps.map((s, i) => (
        <li key={s} className="flex-1">
          <div className={`h-1.5 rounded-full ${i <= current ? 'bg-gradient-to-r from-cyan-500 to-amber-400' : 'bg-slate-200'}`} />
          <p className={`text-[11px] mt-1 font-semibold ${i <= current ? 'text-[#0a1633]' : 'text-slate-400'}`}>{s}</p>
        </li>
      ))}
    </ol>
  );
}

export function ProgressBar({ value }: { value: number }) {
  return (
    <div className="h-2 rounded-full bg-slate-100 overflow-hidden">
      <div className="h-full rounded-full bg-gradient-to-r from-cyan-500 to-amber-400 transition-all" style={{ width: `${Math.min(100, Math.max(0, value))}%` }} />
    </div>
  );
}
