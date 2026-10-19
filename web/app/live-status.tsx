'use client';
import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import { BasketIcon, CardIcon, CheckCircleIcon, ClockIcon } from '../components/icons';

type Estimate = { wait_minutes: number | null; accepting: boolean };
type StoreStatus = {
  accepting: boolean;
  dropoff_open: boolean;
  dropoff_capacity: number;
  wait_minutes: number | null;
  payments_online: boolean;
};

export function LiveStatus() {
  const [estimate, setEstimate] = useState<Estimate | null>(null);
  const [status, setStatus] = useState<StoreStatus | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let alive = true;

    async function load() {
      try {
        const [nextEstimate, nextStatus] = await Promise.all([api.estimate(1), api.storeStatus()]);
        if (!alive) return;
        setEstimate(nextEstimate);
        setStatus(nextStatus);
        setFailed(false);
      } catch {
        if (alive) setFailed(true);
      }
    }

    load();
    const id = setInterval(load, 60000);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, []);

  const open = status?.accepting ?? estimate?.accepting;
  const wait = status?.wait_minutes ?? estimate?.wait_minutes;

  const stateLabel = failed ? 'Unavailable' : open === undefined ? 'Checking' : open ? 'Live' : 'Closed';
  const stateTone = failed
    ? 'bg-[#f3f0e9] text-[#7a8581]'
    : open
      ? 'bg-accent-soft text-accent'
      : 'bg-[#f3f0e9] text-[#7a8581]';

  const items = [
    {
      icon: ClockIcon,
      label: 'Estimated wait',
      value: wait == null ? '-' : `${wait} min`,
    },
    {
      icon: BasketIcon,
      label: 'Drop-off',
      value: status ? (status.dropoff_open ? `${status.dropoff_capacity} slots` : 'Closed') : '-',
    },
    {
      icon: CardIcon,
      label: 'Card payment',
      value: status ? (status.payments_online ? 'Available' : 'In store') : '-',
    },
    {
      icon: CheckCircleIcon,
      label: 'Queue',
      value: status ? (status.accepting ? 'Accepting' : 'Paused') : '-',
    },
  ];

  return (
    <div className="rounded-xl border border-line bg-white p-6 sm:p-8" aria-live="polite">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="eyebrow">Live queue</p>
          <p className="mt-2 text-lg font-semibold text-ink">
            {failed ? 'Status unavailable' : open === undefined ? 'Checking status' : open ? 'Open now' : 'Closed for today'}
          </p>
        </div>
        <span className={`inline-flex shrink-0 items-center gap-2 rounded-full px-3 py-1 text-xs font-semibold ${stateTone}`}>
          <span
            className={`h-1.5 w-1.5 rounded-full ${
              failed ? 'bg-[#9aa39f]' : open ? 'bg-accent live-dot' : 'bg-[#9aa39f]'
            }`}
          />
          {stateLabel}
        </span>
      </div>

      <div className="mt-6 grid grid-cols-2 gap-3">
        {items.map(({ icon: Icon, label, value }) => (
          <div key={label} className="rounded-lg bg-paper p-4">
            <Icon className="h-5 w-5 text-accent" />
            <p className="mt-3 text-xl font-semibold tabular-nums text-ink">{value}</p>
            <p className="mt-0.5 text-xs text-muted">{label}</p>
          </div>
        ))}
      </div>

      <p className="mt-5 text-xs leading-5 text-[#7a8581]">
        {failed
          ? 'Live status is temporarily unavailable. You can still create an account and book.'
          : 'Updated automatically every minute. Times are estimates, not reservations.'}
      </p>
    </div>
  );
}
