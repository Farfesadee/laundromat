'use client';
import { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { api } from '../../lib/api';

export const dynamic = 'force-dynamic';

function Board({ rows, title, tone }: { rows: any[]; title: string; tone: string }) {
  return (
    <div>
      <h2 className={`font-extrabold tracking-[.2em] text-sm ${tone}`}>{title}</h2>
      <table className="w-full text-left mt-1">
        <thead><tr className="text-slate-400 text-[11px] tracking-widest"><th className="py-1">TIME</th><th>NAME</th><th>MACHINE</th><th className="text-right">STATUS</th></tr></thead>
        <tbody>
          {rows.length === 0 && <tr><td colSpan={4} className="py-4 text-slate-500">-</td></tr>}
          {rows.map((r: any, i: number) => (
            <tr key={i} className="border-t border-white/10 text-lg">
              <td className="py-2.5 text-white/80 tabular-nums">{r.displayTime || '-'}</td>
              <td className="font-extrabold tv-glow">{r.name}</td>
              <td className="text-white/80">{r.machine}</td>
              <td className="text-right"><span className="badge bg-white/15 text-cyan-200">{r.status}</span></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Inner() {
  const sp = useSearchParams();
  const token = sp.get('token') || '';
  const [q, setQ] = useState<any>({ now_serving: [], coming_up: [] });
  const [clock, setClock] = useState('');

  useEffect(() => {
    const tick = () => setClock(new Date().toLocaleString('en-US', { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }));
    tick();
    const ci = setInterval(tick, 10000);
    let alive = true;
    async function poll() {
      try {
        const d = await api.publicQueue();
        if (!alive) return;
        const fix = (rows: any[]) => rows.map(r => ({ ...r, displayTime: r.time ? formatTime(r.time) : '-' }));
        setQ({ now_serving: fix(d.now_serving), coming_up: fix(d.coming_up) });
      } catch {}
    }
    poll();
    const pi = setInterval(poll, 5000);
    let ws: WebSocket | null = null;
    try {
      const base = (process.env.NEXT_PUBLIC_WS_URL || '').replace(/\/$/, '');
      if (base && token) {
        ws = new WebSocket(`${base}?token=${encodeURIComponent(token)}`);
        ws.onmessage = e => {
          try {
            const m = JSON.parse(e.data);
            if (m.now_serving) {
              const fix = (rows: any[]) => rows.map(r => ({ ...r, displayTime: r.time ? formatTime(r.time) : '-' }));
              setQ({ now_serving: fix(m.now_serving), coming_up: fix(m.coming_up || []) });
            } else poll();
          } catch { poll(); }
        };
      }
    } catch {}
    return () => { alive = false; clearInterval(ci); clearInterval(pi); try { ws?.close(); } catch {} };
  }, [token]);

  return (
    <div className="rounded-3xl overflow-hidden bg-[#070d22] text-white p-6 md:p-8 grid md:grid-cols-[1.4fr_1fr] gap-8 min-h-[70vh]">
      <div>
        <div className="flex items-center justify-between">
          <p className="font-extrabold text-xl tracking-tight">LAUNDROMAT <span className="text-[11px] font-medium text-cyan-300 tracking-[.2em]">WASH · DRY · RELAX</span></p>
          <p className="text-cyan-200 text-sm tabular-nums">{clock}</p>
        </div>
        <div className="mt-5"><Board rows={q.now_serving} title="NOW SERVING" tone="text-amber-300" /></div>
        <div className="mt-6"><Board rows={q.coming_up} title="COMING UP" tone="text-cyan-300" /></div>
      </div>
      <div className="rounded-2xl bg-gradient-to-b from-cyan-500/20 to-amber-400/10 border border-white/10 p-6 flex flex-col justify-center text-center">
        <p className="text-4xl font-extrabold leading-tight">Fresh laundry,<br />happier days.</p>
        <p className="text-white/60 mt-4 text-sm">Please be near your machine 10 minutes before your time.</p>
      </div>
    </div>
  );
}

function formatTime(v: string) {
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return v;
  return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
}

export default function TV() {
  return (<Suspense><Inner /></Suspense>);
}
