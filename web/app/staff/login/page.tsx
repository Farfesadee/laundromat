'use client';
import { useState } from 'react';
import { ApiError, api, tokens } from '../../../lib/api';
import { useAuth } from '../../../lib/auth';

export default function StaffLogin() {
  const { refresh } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function submit() {
    setBusy(true); setError('');
    try {
      const r = await api.post<any>('/auth/staff/login', { email, password });
      tokens.save(r.access_token, r.refresh_token);
      await refresh();
      window.location.href = '/staff';
    } catch (e) { setError(e instanceof ApiError ? e.message : 'Sign-in failed'); }
    setBusy(false);
  }

  return (
    <div className="max-w-md mx-auto">
      <div className="brand-gradient rounded-3xl p-6 text-white mb-4 rise">
        <p className="text-cyan-300 text-xs font-bold tracking-[.25em]">STAFF CRM</p>
        <h1 className="text-2xl font-extrabold">Team sign-in</h1>
        <p className="text-white/70 text-sm mt-1">Locked after 5 failed attempts. Every action is audited.</p>
      </div>
      <div className="card space-y-3">
        <div><p className="label mb-1">Work email</p><input className="input" value={email} onChange={e => setEmail(e.target.value)} inputMode="email" autoComplete="username" /></div>
        <div><p className="label mb-1">Password</p><input className="input" type="password" value={password} onChange={e => setPassword(e.target.value)} autoComplete="current-password" onKeyDown={e => e.key === 'Enter' && submit()} /></div>
        {error && <p className="text-sm text-rose-600">{error}</p>}
        <button className="btn w-full" disabled={busy || !email || !password} onClick={submit}>{busy ? 'Signing in…' : 'Sign in'}</button>
      </div>
    </div>
  );
}
