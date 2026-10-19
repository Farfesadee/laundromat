'use client';
import { useState } from 'react';
import type { FormEvent } from 'react';
import Link from 'next/link';
import { ApiError, api, tokens } from '../../../lib/api';
import { useAuth } from '../../../lib/auth';
import { Logo } from '../../../components/ui';

export default function StaffLogin() {
  const { refresh } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      const result = await api.post<any>('/auth/staff/login', { email, password });
      tokens.save(result.access_token, result.refresh_token);
      await refresh();
      window.location.href = result.role === 'owner' ? '/owner' : '/staff';
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Sign-in failed');
    }
    setBusy(false);
  }

  return (
    <div className="mx-auto max-w-md py-4 sm:py-10">
      <div className="mb-6 flex items-center justify-between">
        <Link href="/" aria-label="LAUNDROMAT home">
          <Logo />
        </Link>
        <Link href="/" className="text-sm font-medium text-muted transition hover:text-ink">
          Back to site
        </Link>
      </div>

      <div className="rounded-xl border border-line bg-white p-6 sm:p-8">
        <p className="eyebrow">Staff access</p>
        <h1 className="display mt-3 text-3xl text-ink">Team sign in.</h1>
        <p className="mt-3 text-sm leading-6 text-muted">
          Manage the queue, orders, and customer records. Authorized staff only. Every action is
          audited.
        </p>

        <form className="mt-7 space-y-4" onSubmit={submit}>
          <div>
            <label htmlFor="email" className="label mb-1.5 block">
              Work email
            </label>
            <input
              id="email"
              className="input"
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              autoComplete="username"
              autoFocus
            />
          </div>
          <div>
            <label htmlFor="password" className="label mb-1.5 block">
              Password
            </label>
            <input
              id="password"
              className="input"
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoComplete="current-password"
            />
          </div>

          {error && (
            <p role="alert" className="rounded-lg border border-[#e7c9c4] bg-[#fbefed] px-3 py-2 text-sm text-[#8d3f36]">
              {error}
            </p>
          )}

          <button type="submit" className="btn w-full" disabled={busy || !email || !password}>
            {busy ? 'Signing in...' : 'Sign in'}
          </button>
        </form>

        <p className="mt-6 text-sm text-muted">
          Customer account?{' '}
          <Link href="/login" className="font-semibold text-accent hover:underline">
            Sign in here
          </Link>
          .
        </p>
      </div>

      <p className="mt-6 text-center text-xs leading-5 text-muted">
        Access is monitored. If you need an account, contact the store owner.
      </p>
    </div>
  );
}
