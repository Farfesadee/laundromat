'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { ApiError, api } from '../lib/api';
import { Badge, PageHeader, Stat } from '../components/ui';
import { ArrowRightIcon, BasketIcon, CoffeeIcon, WasherIcon } from '../components/icons';

export default function Home() {
  const [est, setEst] = useState<{ wait_minutes: number | null; accepting: boolean } | null>(null);
  const [status, setStatus] = useState<any>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    api.estimate(1).then(setEst).catch((e: ApiError) => setError(e.message));
    api.storeStatus().then(setStatus).catch(() => {});
  }, []);

  return (
    <div className="space-y-6">
      <section className="brand-gradient rounded-3xl p-7 md:p-10 text-white relative overflow-hidden rise">
        <div className="absolute -right-16 -top-16 w-72 h-72 rounded-full bg-cyan-400/20 blur-2xl" />
        <div className="absolute -left-10 -bottom-20 w-72 h-72 rounded-full bg-amber-400/20 blur-2xl" />
        <p className="text-cyan-300 text-xs font-bold tracking-[.25em]">SAME-DAY · NO APPOINTMENTS</p>
        <h1 className="text-3xl md:text-5xl font-extrabold tracking-tight mt-2">
          Fresh laundry, <span className="brand-text">happier days.</span>
        </h1>
        <p className="text-white/75 mt-3 max-w-xl">
          Join today&apos;s live queue, watch your washer in real time on the store TV,
          and grab a coffee while you wait.
        </p>
        <div className="flex flex-wrap gap-2 mt-5">
          <Link href="/book/self-service" className="btn btn-amber !w-auto px-6">Book a wash</Link>
          <Link href="/orders" className="btn !w-auto px-6 !bg-white/10 hover:!bg-white/20 border border-white/20">Track my wash</Link>
        </div>
        <div className="grid grid-cols-3 gap-2 mt-6 max-w-lg">
          <div className="rounded-2xl bg-white/10 border border-white/15 p-3 text-center">
            <p className="text-2xl font-extrabold">{est ? (est.wait_minutes ?? '-') : '…'}</p>
            <p className="text-[11px] text-white/70">MIN EST. WAIT</p>
          </div>
          <div className="rounded-2xl bg-white/10 border border-white/15 p-3 text-center">
            <p className="text-2xl font-extrabold">{status ? `${status.dropoff_capacity ?? '-'}` : '…'}</p>
            <p className="text-[11px] text-white/70">DROP-OFF SLOTS</p>
          </div>
          <div className="rounded-2xl bg-white/10 border border-white/15 p-3 text-center">
            <p className="text-2xl font-extrabold">10<span className="text-sm">kg</span></p>
            <p className="text-[11px] text-white/70">PER WASH</p>
          </div>
        </div>
        {error && <p className="text-xs text-amber-200 mt-3">{error} Showing store info offline.</p>}
      </section>

      <PageHeader kicker="Services" title="What would you like today?" sub="One queue for self-service, a separate lane for drop-off, and coffee while you wait." />
      <div className="grid md:grid-cols-3 gap-3">
        {[
          { h: '/book/self-service', t: 'Self-service Wash', d: 'Pick your loads, see the live wait, check in 10 minutes early.', b: 'From wash menu', Icon: WasherIcon },
          { h: '/book/drop-off', t: 'Drop-off Laundry', d: 'Leave it with us. We notify you the moment it is ready.', b: 'Get ready time', Icon: BasketIcon },
          { h: '/book/add-ons', t: 'Coffee and Drinks', d: 'Hot coffee, iced coffee and cold drinks to enjoy in-store.', b: 'See menu', Icon: CoffeeIcon },
        ].map(({ h, t, d, b, Icon }) => (
          <Link key={t} href={h} className="card card-hover group">
            <span className="w-11 h-11 rounded-xl bg-gradient-to-br from-cyan-500 to-cyan-700 text-white grid place-items-center shadow group-hover:scale-105 transition">
              <Icon className="w-6 h-6" />
            </span>
            <p className="font-extrabold text-lg text-[#0a1633] mt-3">{t}</p>
            <p className="text-sm text-slate-500 mt-1">{d}</p>
            <p className="inline-flex items-center gap-1 text-sm font-bold text-cyan-700 mt-3">{b} <ArrowRightIcon className="w-4 h-4" /></p>
          </Link>
        ))}
      </div>

      <div className="grid md:grid-cols-4 gap-3">
        <Stat label="Queue" value={status?.accepting === false ? 'Paused' : 'Open today'} hint="8:00 AM – 7:30 PM" tone="aqua" />
        <Stat label="Grace period" value="10 min" hint="Protected window before a skip" tone="amber" />
        <Stat label="Wash / Dry" value="35 / 20 min" hint="Posted on every machine" tone="navy" />
        <Stat label="Live status" value={<Badge status={error ? 'error' : 'running'}>{error ? 'offline' : 'live'}</Badge>} hint="TV + your phone" tone="rose" />
      </div>

      <div className="card">
        <p className="label">How it works</p>
        <ol className="grid md:grid-cols-4 gap-3 mt-2 text-sm">
          {['Book your washes', 'Arrive 10 min early', 'Watch the TV board', 'Collect & pay'].map((s, i) => (
            <li key={s} className="rounded-xl bg-slate-50 p-3"><b className="text-cyan-700">{i + 1}.</b> {s}</li>
          ))}
        </ol>
      </div>
    </div>
  );
}
