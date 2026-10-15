'use client';
import { useEffect, useState } from 'react';
import { ApiError, api, fmtTime, tokens } from '../../lib/api';
import { Badge, Empty, ErrorBox, PageHeader, ProgressBar, Skeleton } from '../../components/ui';

const STAGE_PCT: Record<string, number> = { queued: 10, grace: 15, washing: 45, wash_done: 60, drying: 80, ready: 100, collected: 100 };

export default function Orders() {
  const [tab, setTab] = useState<'washes' | 'orders'>('washes');
  const [orders, setOrders] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [live, setLive] = useState(false);

  async function load() {
    const t = tokens.get();
    if (!t) { setLoading(false); setError('Sign in to see your live washes.'); return; }
    try { setOrders(await api.get<any[]>('/me/orders', t)); setError(''); }
    catch (e) { setError(e instanceof ApiError ? e.message : 'Could not load orders'); }
    setLoading(false);
  }

  useEffect(() => {
    load();
    const id = setInterval(load, 15000);
    // live socket (polling remains the fallback)
    let ws: WebSocket | null = null;
    try {
      const base = (process.env.NEXT_PUBLIC_WS_URL || '').replace(/\/$/, '');
      const t = tokens.get();
      if (base && t) {
        ws = new WebSocket(`${base}?token=${encodeURIComponent(t)}`);
        ws.onmessage = () => load();
        ws.onopen = () => setLive(true);
        ws.onclose = () => setLive(false);
      }
    } catch {}
    return () => { clearInterval(id); try { ws?.close(); } catch {} };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const units = orders.flatMap(o => (o.units || []).map((u: any) => ({ ...u, order_no: o.order_no, order_status: o.status })));

  return (
    <div className="max-w-2xl mx-auto">
      <PageHeader kicker="Live tracking" title="My washes" sub="Queue position, washer, dryer and ready time, updated live."
        right={<span className="badge bg-slate-900 text-white"><span className={`dot ${live ? 'bg-emerald-400 live-dot' : 'bg-slate-400'}`} />{live ? 'LIVE' : 'POLLING'}</span>} />
      <div className="flex gap-2 mb-4">
        {(['washes', 'orders'] as const).map(t => (
          <button key={t} onClick={() => setTab(t)} className={`btn flex-1 ${tab === t ? '' : '!bg-slate-200 !text-slate-600'}`}>
            {t === 'washes' ? 'My Washes' : 'My Orders'}
          </button>
        ))}
      </div>
      {loading ? <><Skeleton /><Skeleton className="mt-2" /></> :
        error ? <ErrorBox message={error} retry={load} /> :
        units.length === 0 ? <Empty title="Nothing in the queue" sub="Book your first wash. It takes a minute." action={<a className="btn" href="/book">Book a wash</a>} /> :
        tab === 'washes' ? (
          <div className="space-y-2.5">
            {units.map((u: any) => (
              <div key={`${u.order_no}-${u.unit_no}`} className="card rise">
                <div className="flex items-center justify-between gap-2">
                  <p className="font-extrabold">Wash {u.unit_no} <span className="text-slate-400 font-medium">· #{u.order_no}</span></p>
                  <Badge status={u.status} />
                </div>
                <div className="mt-2"><ProgressBar value={STAGE_PCT[u.status] ?? 5} /></div>
                <div className="grid grid-cols-3 gap-2 mt-2 text-center text-xs">
                  <div className="rounded-lg bg-slate-50 p-2"><p className="label">Start</p><b>{fmtTime(u.est_start)}</b></div>
                  <div className="rounded-lg bg-slate-50 p-2"><p className="label">Ready</p><b>{fmtTime(u.est_ready)}</b></div>
                  <div className="rounded-lg bg-slate-50 p-2"><p className="label">Order</p><b>{u.order_status}</b></div>
                </div>
              </div>
            ))}
            <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-xl p-2.5">Arrive at least 10 minutes before your estimated turn.</p>
          </div>
        ) : (
          <div className="space-y-2.5">
            {orders.map(o => (
              <div key={o.id} className="card flex items-center justify-between">
                <div><p className="font-extrabold">Order #{o.order_no}</p><p className="text-xs text-slate-500">{(o.units || []).length} wash(es) · {kobo(o.total)}</p></div>
                <Badge status={o.status}>{o.status}</Badge>
              </div>
            ))}
          </div>
        )}
    </div>
  );
}

function kobo(n: number) { return '₦' + (n / 100).toLocaleString('en-NG'); }
