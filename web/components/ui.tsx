'use client';
import React from 'react';
import { BasketIcon } from './icons';

export function Logo({ light = false }: { light?: boolean }) {
  return (
    <span className="flex items-center gap-2.5">
      <span
        className={`grid h-9 w-9 place-items-center rounded-xl ${
          light ? 'bg-white text-accent' : 'bg-accent text-white'
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
  drying: 'bg-[#fdf1dc] text-[#93641f]',
  queued: 'bg-[#eef2f3] text-[#5e7278]',
  waiting: 'bg-[#eef2f3] text-[#5e7278]',
  grace: 'bg-[#fbe9e6] text-[#93453b]',
  ready: 'bg-[#e6f6ed] text-[#2f7048]',
  booked: 'bg-[#e7f2f6] text-[#346579]',
  checked_in: 'bg-[#e7f2f6] text-[#346579]',
  in_progress: 'bg-accent-soft text-accent',
  pending_payment: 'bg-[#fdf1dc] text-[#93641f]',
  paid: 'bg-[#e6f6ed] text-[#2f7048]',
  unpaid: 'bg-[#fbe9e6] text-[#93453b]',
  partial: 'bg-[#fdf1dc] text-[#93641f]',
  collected: 'bg-[#eef2f3] text-[#5e7278]',
  cancelled: 'bg-[#f3eeee] text-[#7c5c58]',
  expired: 'bg-[#f3eeee] text-[#7c5c58]',
  running: 'bg-accent-soft text-accent',
  available: 'bg-[#e6f6ed] text-[#2f7048]',
  maintenance: 'bg-[#eef2f3] text-[#5e7278]',
  error: 'bg-[#fbe9e6] text-[#93453b]',
};

export function Badge({ status, children }: { status?: string; children?: React.ReactNode }) {
  const tone = badgeTones[status || ''] || 'bg-[#eef2f3] text-[#5e7278]';
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
      <div className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-accent-soft text-accent">
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
    <div
      role="alert"
      className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[#e7c9c4] bg-[#fbefed] p-4 text-sm leading-6 text-[#8d3f36]"
    >
      <span>{message}</span>
      {retry && (
        <button
          type="button"
          className="shrink-0 rounded-full border border-[#d8b4ae] bg-white px-4 py-2 text-xs font-semibold text-[#8d3f36] transition hover:bg-[#f7e6e3]"
          onClick={retry}
        >
          Try again
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
    <div className="h-1.5 overflow-hidden rounded-full bg-[#e2eef0]">
      <div
        className="h-full rounded-full bg-accent transition-all"
        style={{ width: `${Math.min(100, Math.max(0, value))}%` }}
      />
    </div>
  );
}
