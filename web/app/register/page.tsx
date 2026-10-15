'use client';
import { useState } from 'react';
import Link from 'next/link';
import { ApiError, api, tokens } from '../../lib/api';
import { useAuth } from '../../lib/auth';

export default function Register() {
  const { refresh } = useAuth();
  const [form, setForm] = useState({ first_name: '', preferred_name: '', phone: '', email: '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const set = (k: string) => (e: any) => setForm(f => ({ ...f, [k]: e.target.value }));

  async function submit() {
    setBusy(true); setError('');
    try {
      const r = await api.post<any>('/auth/register', form);
      tokens.save(r.access_token, r.refresh_token);
      await refresh();
      window.location.href = '/book';
    } catch (e) { setError(e instanceof ApiError ? e.message : 'Something went wrong'); }
    setBusy(false);
  }

  return (
    <div className="max-w-md mx-auto">
      <div className="brand-gradient rounded-3xl p-6 text-white mb-4 rise">
        <p className="text-cyan-300 text-xs font-bold tracking-[.25em]">JOIN LAUNDROMAT</p>
        <h1 className="text-2xl font-extrabold">Create your account</h1>
        <p className="text-white/70 text-sm mt-1">One profile works online and in-store.</p>
      </div>
      <div className="card space-y-3">
        <div className="grid grid-cols-2 gap-2">
          <div><p className="label mb-1">First name</p><input className="input" value={form.first_name} onChange={set('first_name')} /></div>
          <div><p className="label mb-1">In-store name</p><input className="input" placeholder="e.g. T." value={form.preferred_name} onChange={set('preferred_name')} /></div>
        </div>
        <div><p className="label mb-1">Phone (E.164)</p><input className="input" placeholder="+234…" value={form.phone} onChange={set('phone')} inputMode="tel" /></div>
        <div><p className="label mb-1">Email (optional)</p><input className="input" placeholder="you@mail.com" value={form.email} onChange={set('email')} inputMode="email" /></div>
        {error && <p className="text-sm text-rose-600">{error}</p>}
        <button className="btn w-full" disabled={busy || !form.phone} onClick={submit}>{busy ? 'Creating…' : 'Create account'}</button>
        <p className="text-sm text-slate-500 text-center">Have an account? <Link href="/login" className="font-bold text-cyan-700">Sign in</Link></p>
      </div>
    </div>
  );
}
