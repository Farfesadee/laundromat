'use client';
import React from 'react';
import { BasketIcon } from './icons';

export function Logo({ light = false }: { light?: boolean }) {
  return (
    <span className="flex items-center gap-2.5">
      <span
        className={`grid h-9 w-9 place-items-center rounded-md ${
          light ? 'bg-white text-ink' : 'bg-ink text-white'
        }`}
      >
        <svg width="19" height="19" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <rect x="4" y="2.5" width="16" height="19" rx="2.2" stroke="currentColor" strokeWidth="1.7" />
          <circle cx="12" cy="14" r="4.4" stroke="currentColor" strokeWidth="1.7" />
          <circle cx="12" cy="14" r="1" fill="currentColor" />
          <path d="M7.5 6.4h3.2" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
          <circle cx="16.4" cy="6.4" r="0.9" fill="currentColor" />
        </svg>
      </span>
      <span
        className={`text-[15px] font-semibold tracking-[0.16em] ${
          light ? 'text-white' : 'text-ink'
        }`}
      >
        LAUNDROMAT
      </span>
    </span>
  );
}

export function PageHeader({
  kicker,
  title,
  sub,
  right,
}: {
  kicker?: string;
  title: string;
  sub?: string;
  right?: React.ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4 rise">
      <div>
        {kicker && <p className="eyebrow">{kicker}</p>}
        <h1 className="display mt-2 text-3xl text-ink md:text-4xl">{title}</h1>
        {sub && <p className="mt-2 max-w-xl text-sm leading-6 text-muted">{sub}</p>}
      </div>
      {right}
    </div>
  );
}

const statTones: Record<string, string> = {
  navy: 'border-t-ink',
  aqua: 'border-t-accent',
  amber: 'border-t-brass',
  rose: 'border-t-[#a45b5b]',
};

export function Stat({
  label,
  value,
  hint,
  tone = 'navy',
}: {
  label: string;
  value: React.ReactNode;
  hint?: string;
  tone?: 'navy' | 'aqua' | 'amber' | 'rose';
}) {
  return (
    <div className={`card card-hover border-t-2 ${statTones[tone]}`}>
      <p className="label">{label}</p>
      <p className="mt-1 text-2xl font-semibold text-ink">{value}</p>
      {hint && <p className="mt-1 text-xs text-muted">{hint}</p>}
    </div>
  );
}

const badgeTones: Record<string, string> = {
  washing: 'bg-accent-soft text-accent',
  drying: 'bg-[#f4ecdf] text-[#8a6534]',
  queued: 'bg-[#eeeae2] text-[#5f6864]',
  waiting: 'bg-[#eeeae2] text-[#5f6864]',
  grace: 'bg-[#f7e7e5] text-[#9a4b43]',
  ready: 'bg-[#e5f0e5] text-[#3f6b45]',
  booked: 'bg-[#e7eef1] text-[#3f6470]',
  collected: 'bg-[#eeeae2] text-[#7a8581]',
  running: 'bg-accent-soft text-accent',
  available: 'bg-[#e5f0e5] text-[#3f6b45]',
  maintenance: 'bg-[#e9e5dc] text-[#6d7672]',
  error: 'bg-[#f7e7e5] text-[#9a4b43]',
};

export function Badge({ status, children }: { status?: string; children?: React.ReactNode }) {
  const tone = badgeTones[status || ''] || 'bg-[#eeeae2] text-[#5f6864]';
  return (
    <span className={`badge ${tone}`}>
      <span
        className={`dot ${
          status === 'grace' || status === 'error'
            ? 'bg-[#a45b5b] live-dot'
            : 'bg-current opacity-60'
        }`}
      />
      {children ?? status}
    </span>
  );
}

export function Empty({ title, sub, action }: { title: string; sub?: string; action?: React.ReactNode }) {
  return (
    <div className="card py-10 text-center">
      <div className="mx-auto grid h-12 w-12 place-items-center rounded-lg bg-accent-soft text-accent">
        <BasketIcon className="h-6 w-6" />
      </div>
      <p className="mt-3 font-semibold text-ink">{title}</p>
      {sub && <p className="mt-1 text-sm text-muted">{sub}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function Skeleton({ className = '' }: { className?: string }) {
  return <div className={`skeleton h-16 ${className}`} />;
}

export function ErrorBox({ message, retry }: { message: string; retry?: () => void }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-lg border border-[#e7c9c4] bg-[#fbefed] p-4 text-sm text-[#8d3f36]">
      <span>{message}</span>
      {retry && (
        <button className="btn !px-3 !py-2 !bg-[#8d3f36]" onClick={retry}>
          Retry
        </button>
      )}
    </div>
  );
}

export function Steps({ steps, current }: { steps: string[]; current: number }) {
  return (
    <ol className="mb-5 flex items-center gap-1.5">
      {steps.map((s, i) => (
        <li key={s} className="flex-1">
          <div className={`h-1.5 rounded-full ${i <= current ? 'bg-accent' : 'bg-[#e4e0d7]'}`} />
          <p className={`mt-1 text-[11px] font-semibold ${i <= current ? 'text-ink' : 'text-muted'}`}>{s}</p>
        </li>
      ))}
    </ol>
  );
}

export function ProgressBar({ value }: { value: number }) {
  return (
    <div className="h-1.5 overflow-hidden rounded-full bg-[#ece8df]">
      <div
        className="h-full rounded-full bg-accent transition-all"
        style={{ width: `${Math.min(100, Math.max(0, value))}%` }}
      />
    </div>
  );
}
