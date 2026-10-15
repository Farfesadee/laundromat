'use client';
import { useState } from 'react';
import { ApiError, api, tokens } from '../../../lib/api';
import { PageHeader } from '../../../components/ui';

export default function StaffCustomers() {
  const [q, setQ] = useState('');
  const [rows, setRows] = useState<any[]>([]);
  const [form, setForm] = useState({ first_name: '', preferred_name: '', phone: '', email: '' });
  const [msg, setMsg] = useState('');
  const [error, setError] = useState('');

  async function search() {
    setError(''); setMsg('');
    try { setRows(await api.get<any[]>(`/customers?q=${encodeURIComponent(q)}`, tokens.get())); }
    catch (e) { setError(e instanceof ApiError ? e.message : 'Search failed'); }
  }
  async function add() {
    setError(''); setMsg('');
    try {
      await api.post('/customers', form, tokens.get());
      setMsg('Customer added.');
      setForm({ first_name: '', preferred_name: '', phone: '', email: '' });
      search();
    } catch (e) { setError(e instanceof ApiError ? e.message : 'Could not add customer'); }
  }

  return (
    <div>
      <PageHeader kicker="CRM" title="Customers" sub="Search by name or phone, or register someone new in seconds." />
      <div className="grid md:grid-cols-2 gap-3">
        <div className="card">
          <div className="flex gap-2">
            <input className="input" placeholder="Name or phone…" value={q} onChange={e => setQ(e.target.value)} onKeyDown={e => e.key === 'Enter' && search()} />
            <button className="btn !w-28" onClick={search}>Search</button>
          </div>
          <div className="mt-3 space-y-2">
            {rows.map(r => (
              <div key={r.id} className="rounded-xl border border-slate-100 p-3 text-sm flex justify-between items-center">
                <span><b>{r.preferred_name}</b> <span className="text-slate-400">{r.phone}</span></span>
                <a className="badge bg-slate-100" href={`/staff/customers?view=${r.id}`}>View</a>
              </div>
            ))}
            {rows.length === 0 && <p className="text-sm text-slate-400">No results yet.</p>}
          </div>
        </div>
        <div className="card space-y-2.5">
          <p className="font-extrabold">New customer</p>
          <div className="grid grid-cols-2 gap-2">
            <input className="input" placeholder="First name" value={form.first_name} onChange={e => setForm({ ...form, first_name: e.target.value })} />
            <input className="input" placeholder="In-store name" value={form.preferred_name} onChange={e => setForm({ ...form, preferred_name: e.target.value })} />
          </div>
          <input className="input" placeholder="Phone (+234…)" value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} inputMode="tel" />
          <input className="input" placeholder="Email (optional)" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} inputMode="email" />
          {error && <p className="text-sm text-rose-600">{error}</p>}
          {msg && <p className="text-sm text-emerald-700">{msg}</p>}
          <button className="btn w-full" onClick={add}>Add customer</button>
        </div>
      </div>
    </div>
  );
}
