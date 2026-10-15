'use client';
import { useEffect, useMemo, useState } from 'react';
import { ApiError, api, fmtTime, tokens } from '../../../lib/api';
import { Badge, Empty, ErrorBox, PageHeader } from '../../../components/ui';

export default function StaffQueue() {
  const [rows, setRows] = useState<any[]>([]);
  const [machines, setMachines] = useState<any[]>([]);
  const [filter, setFilter] = useState('all');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState('');

  async function load() {
    const t = tokens.get();
    if (!t) { setError('Sign in as staff first.'); return; }
    try {
      const [q, m] = await Promise.all([api.get<any[]>('/queue', t), api.get<any[]>('/machines', t)]);
      setRows(q); setMachines(m); setError('');
    } catch (e) { setError(e instanceof ApiError ? e.message : 'Could not load queue'); }
  }
  useEffect(() => { load(); const id = setInterval(load, 8000); return () => clearInterval(id); }, []);

  const shown = useMemo(() => rows.filter(r => filter === 'all' || r.status === filter), [rows, filter]);
  const washers = machines.filter(m => m.kind === 'washer' && m.status === 'available');
  const dryers = machines.filter(m => m.kind === 'dryer' && m.status === 'available');

  async function act(path: string, body: any = {}) {
    setBusy(path);
    try { await api.post(path, body, tokens.get()); await load(); }
    catch (e) { setError(e instanceof ApiError ? e.message : 'Action failed'); }
    setBusy('');
  }

  return (
    <div>
      <PageHeader kicker="Queue" title="Self-service queue" sub="Start washes on free machines, skip expired grace periods. Every action is audited."
        right={<div className="flex gap-1.5">{['all', 'queued', 'grace', 'washing', 'drying', 'ready'].map(f => (
          <button key={f} onClick={() => setFilter(f)} className={`badge cursor-pointer ${filter === f ? '!bg-[#0a1633] !text-white' : 'bg-slate-200'}`}>{f}</button>))}</div>} />
      {error && <div className="mb-3"><ErrorBox message={error} retry={load} /></div>}
      <p className="text-xs text-slate-500 mb-2">Free washers: {washers.length} · Free dryers: {dryers.length}</p>
      {shown.length === 0 ? <Empty title="Nothing here" sub="Try a different filter." /> : (
        <div className="card !p-0 overflow-x-auto">
          <table className="table-clean min-w-[720px]">
            <thead><tr><th className="pl-4">#</th><th>Customer</th><th>Est. start</th><th>Status</th><th className="text-right pr-4">Actions</th></tr></thead>
            <tbody>
              {shown.map((r, i) => (
                <tr key={r.id} className={r.status === 'grace' ? '!bg-rose-50' : ''}>
                  <td className="pl-4 text-slate-400">{i + 1}</td>
                  <td><b>{r.customer}</b> <span className="text-xs text-slate-400">{r.unit_no}{r.skip_count ? ` · skipped ×${r.skip_count}` : ''}</span></td>
                  <td className="tabular-nums">{fmtTime(r.est_start)}</td>
                  <td><Badge status={r.status} /></td>
                  <td className="text-right pr-4">
                    <span className="inline-flex flex-wrap justify-end gap-1">
                      <button disabled={!!busy} className="badge bg-emerald-600 text-white cursor-pointer" onClick={() => act(`/wash-units/${r.id}/start`, { machine_id: washers[0]?.id })}>Start</button>
                      <button disabled={!!busy} className="badge bg-sky-600 text-white cursor-pointer" onClick={() => act(`/wash-units/${r.id}/start-dry`, { machine_id: dryers[0]?.id })}>Dry</button>
                      <button disabled={!!busy} className="badge bg-emerald-100 text-emerald-800 cursor-pointer" onClick={() => act(`/wash-units/${r.id}/dry-complete`)}>Ready</button>
                      <button disabled={!!busy} className="badge bg-amber-200 text-amber-900 cursor-pointer" onClick={() => { if (confirm(`Move ${r.unit_no} to the back of the queue?`)) act(`/wash-units/${r.id}/skip`, { reason: 'grace expired' }); }}>Skip</button>
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
