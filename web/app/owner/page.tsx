'use client';
import { useState } from 'react';
import { ApiError, api, kobo, tokens } from '../../lib/api';
import { ErrorBox, PageHeader } from '../../components/ui';

const TABS = ['sales', 'reconciliation', 'operations', 'audit', 'settings'] as const;

export default function Owner() {
  const [tab, setTab] = useState<(typeof TABS)[number]>('sales');
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function load(t: (typeof TABS)[number]) {
    setTab(t); setLoading(true); setError('');
    const map: Record<string, string> = {
      sales: '/reports/sales', reconciliation: '/reports/reconciliation',
      operations: '/reports/operations', audit: '/audit', settings: '/settings',
    };
    try { setData(await api.get(map[t], tokens.get())); }
    catch (e) { setError(e instanceof ApiError ? e.message : 'Could not load'); setData(null); }
    setLoading(false);
  }

  return (
    <div>
      <PageHeader kicker="Owner" title="Business overview" sub="Expected vs actual money, operations and the staff audit trail." />
      <div className="flex gap-1.5 flex-wrap mb-4">
        {TABS.map(t => (
          <button key={t} onClick={() => load(t)} className={`badge !px-4 !py-2 cursor-pointer !text-[13px] ${tab === t ? '!bg-[#0a1633] !text-white' : 'bg-white border border-slate-200'}`}>{t}</button>
        ))}
      </div>
      {error && <ErrorBox message={error} retry={() => load(tab)} />}
      {loading ? <p className="text-sm text-slate-400">Loading…</p> : data == null && !error ? (
        <div className="card text-center text-sm text-slate-500">Pick a tab. Sign in as a manager or owner first.</div>
      ) : tab === 'reconciliation' && data ? (
        <Recon data={data} />
      ) : (
        <pre className="card text-xs overflow-auto">{JSON.stringify(data, null, 2)}</pre>
      )}
    </div>
  );
}

function Recon({ data }: { data: any }) {
  const rows: [string, number][] = Object.entries(data.variance || {});
  const max = Math.max(1, ...rows.map(([, v]) => Math.abs(v as number)));
  return (
    <div className="grid md:grid-cols-3 gap-3">
      <div className="card"><p className="label">Expected</p><p className="text-2xl font-extrabold">{kobo(data.expected?.total)}</p></div>
      <div className="card"><p className="label">Actual</p><p className="text-2xl font-extrabold">{kobo(data.actual?.total)}</p></div>
      <div className={`card ${data.flagged ? '!border-rose-300' : '!border-emerald-300'}`}>
        <p className="label">Variance</p>
        <p className={`text-2xl font-extrabold ${data.flagged ? 'text-rose-600' : 'text-emerald-600'}`}>{kobo(data.variance_total)}</p>
        <p className="text-xs text-slate-500">{data.flagged ? 'Needs a manager note before close.' : 'Balanced.'}</p>
      </div>
      <div className="card md:col-span-3">
        <p className="label mb-2">Variance by method</p>
        {rows.map(([m, v]) => (
          <div key={m} className="flex items-center gap-2 text-sm py-1">
            <span className="w-28 font-semibold">{m}</span>
            <div className="flex-1 h-2.5 bg-slate-100 rounded-full overflow-hidden">
              <div className={`h-full rounded-full ${(v as number) < 0 ? 'bg-rose-400' : 'bg-emerald-400'}`} style={{ width: `${Math.abs(v as number) / max * 100}%` }} />
            </div>
            <b className="w-28 text-right tabular-nums">{kobo(v as number)}</b>
          </div>
        ))}
      </div>
    </div>
  );
}
