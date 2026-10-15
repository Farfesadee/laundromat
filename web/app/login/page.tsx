'use client';
import { useState } from 'react';
import Link from 'next/link';
import { ApiError, api, tokens } from '../../lib/api';
import { useAuth } from '../../lib/auth';

export default function Login() {
  const { refresh } = useAuth();
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [step, setStep] = useState<'phone' | 'code'>('phone');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');

  async function request() {
    setBusy(true); setError(''); setInfo('');
    try {
      await api.post('/auth/otp/request', { phone });
      setStep('code');
      setInfo('Code sent. Enter the 6-digit code from SMS.');
    } catch (e) { setError(e instanceof ApiError ? e.message : 'Something went wrong'); }
    setBusy(false);
  }
  async function verify() {
    setBusy(true); setError('');
    try {
      const r = await api.post<any>('/auth/otp/verify', { phone, code });
      tokens.save(r.access_token, r.refresh_token);
      await refresh();
      window.location.href = '/book';
    } catch (e) { setError(e instanceof ApiError ? e.message : 'Something went wrong'); }
    setBusy(false);
  }

  return (
    <div className="max-w-md mx-auto">
      <div className="brand-gradient rounded-3xl p-6 text-white mb-4 rise">
        <p className="text-cyan-300 text-xs font-bold tracking-[.25em]">WELCOME BACK</p>
        <h1 className="text-2xl font-extrabold">Sign in with your phone</h1>
        <p className="text-white/70 text-sm mt-1">No passwords to remember. We text you a code.</p>
      </div>
      <div className="card space-y-3">
        <div>
          <p className="label mb-1">Phone (E.164)</p>
          <input className="input" placeholder="+234…" value={phone} onChange={e => setPhone(e.target.value)} inputMode="tel" />
        </div>
        {step === 'code' && (
          <div>
            <p className="label mb-1">6-digit code</p>
            <input className="input tracking-[.3em] text-center text-xl font-bold" placeholder="••••••" value={code} onChange={e => setCode(e.target.value)} inputMode="numeric" maxLength={6} />
          </div>
        )}
        {error && <p className="text-sm text-rose-600">{error}</p>}
        {info && <p className="text-sm text-emerald-700">{info}</p>}
        {step === 'phone'
          ? <button className="btn w-full" disabled={busy || !phone} onClick={request}>{busy ? 'Sending…' : 'Send code'}</button>
          : <button className="btn w-full" disabled={busy || code.length !== 6} onClick={verify}>{busy ? 'Verifying…' : 'Verify & sign in'}</button>}
        <p className="text-sm text-slate-500 text-center">New here? <Link href="/register" className="font-bold text-cyan-700">Create an account</Link></p>
      </div>
    </div>
  );
}
