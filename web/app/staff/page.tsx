'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ApiError, api, tokens } from '../../lib/api';
import { Badge, Empty, ErrorBox, PageHeader, Skeleton, Stat } from '../../components/ui';

export default function Staff() {
  const [machines, setMachines] = useState<any[]>([]);
  const [queue, setQueue] = useState<any[]>([]);
  const [est, setEst] = useState<any>(null);
  const [error, setError] = useState('');

  async function load() {
    const t = tokens.get();
    if (!t) { setError('Sign in as staff to see live operations.'); return; }
    try {
      const [m, q, e] = await Promise.all([api.get<any[]>('/machines', t), api.get<any[]>('/queue', t), api.estimate(1)]);
      setMachines(m); setQueue(q); setEst(e); setError('');
    } catch (e) { setError(e instanceof ApiError ? e.message : 'We could not load the store overview. Please try again.'); }
  }

  useEffect(() => { load(); const id = setInterval(load, 10000); return () => clearInterval(id); }, []);

  const washers = machines.filter(m => m.kind === 'washer');
  const dryers = machines.filter(m => m.kind === 'dryer');
  const waiting = queue.filter(u => ['queued', 'grace'].includes(u.status)).length;

  return (
    <div>
      <PageHeader kicker="Staff CRM" title="Live store overview" sub="Machines, queue and wait. Refreshed every 10 seconds."
        right={<div className="flex gap-2"><Link className="btn !w-auto" href="/staff/queue">Queue</Link><Link className="btn btn-aqua !w-auto" href="/staff/pos">POS</Link></div>} />
      {error ? <ErrorBox message={error} retry={load} /> : (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Stat label="Washers busy" value={`${washers.filter(w => w.status === 'running').length}/${washers.length || '-'}`} tone="aqua" />
            <Stat label="Dryers busy" value={`${dryers.filter(w => w.status === 'running').length}/${dryers.length || '-'}`} tone="navy" />
            <Stat label="Waiting washes" value={waiting} hint={`~${est?.wait_minutes ?? '…'} min wait`} tone="amber" />
            <Stat label="Grace alerts" value={queue.filter(u => u.status === 'grace').length} hint="Needs check-in or skip" tone="rose" />
          </div>
          <h2 className="mt-7 mb-2 font-semibold text-ink">Machines</h2>
          {machines.length === 0 ? <div className="grid grid-cols-3 gap-2"><Skeleton /><Skeleton /><Skeleton /></div> : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-2">
              {machines.map(m => (
                <div key={m.id} className="card !p-3 text-center">
                  <p className="font-extrabold">{m.label}</p>
                  <div className="mt-1"><Badge status={m.status} /></div>
                </div>
              ))}
            </div>
          )}
          <h2 className="mt-7 mb-2 font-semibold text-ink">Next up</h2>
          {queue.length === 0 ? <Empty title="Queue is clear" sub="New bookings will appear here." /> : (
            <div className="card !p-0 overflow-hidden">
              <table className="table-clean px-4"><tbody>
                {queue.slice(0, 6).map((u: any, i: number) => (
                  <tr key={u.id}><td className="pl-4 text-muted">{i + 1}</td><td><b>{u.customer}</b> <span className="text-xs text-muted">{u.unit_no}</span></td>
                    <td className="text-right pr-4"><Badge status={u.status} /></td></tr>
                ))}
              </tbody></table>
            </div>
          )}
          <div className="grid sm:grid-cols-3 gap-2 mt-4">
            <Link className="btn btn-ghost" href="/staff/customers">Customers</Link>
            <Link className="btn btn-ghost" href="/staff/drop-off">Drop-off</Link>
            <Link className="btn btn-ghost" href="/tv">Store TV</Link>
          </div>
        </>
      )}
    </div>
  );
}
