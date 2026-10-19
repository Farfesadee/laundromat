'use client';
import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import Link from 'next/link';
import { API_BASE, ApiError, api, tokens } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { AuthShell } from '../../components/auth-shell';
import { PhoneField, isValidPhoneNumber } from '../../components/phone-field';

type Providers = { password: boolean; google: boolean; sms: boolean };

const GOOGLE_ERRORS: Record<string, string> = {
  google_cancelled: 'Google sign in was cancelled. Try again or use your email and password.',
  google_state: 'That sign in attempt expired. Please try again.',
  google_unavailable: 'Google sign in is not available right now.',
  google_exchange: 'Google could not complete the sign in. Please try again.',
  google_email: 'Google did not return a verified email address. Use your email and password instead.',
  google_conflict: 'This Google account is linked to a different customer record. Please contact the store.',
};

function GoogleIcon({ className = '' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
      <path
        fill="#4285F4"
        d="M23.49 12.27c0-.79-.07-1.54-.19-2.27H12v4.51h6.47a5.53 5.53 0 0 1-2.4 3.62v3.01h3.88c2.27-2.09 3.54-5.17 3.54-8.87z"
      />
      <path
        fill="#34A853"
        d="M12 24c3.24 0 5.96-1.07 7.95-2.91l-3.88-3.01c-1.08.72-2.45 1.15-4.07 1.15-3.13 0-5.78-2.11-6.73-4.96H1.27v3.09A12 12 0 0 0 12 24z"
      />
      <path
        fill="#FBBC05"
        d="M5.27 14.27A7.2 7.2 0 0 1 4.89 12c0-.79.14-1.56.38-2.27V6.64H1.27A12 12 0 0 0 0 12c0 1.93.46 3.76 1.27 5.36l4-3.09z"
      />
      <path
        fill="#EA4335"
        d="M12 4.77c1.76 0 3.34.61 4.58 1.79l3.44-3.44C17.95 1.19 15.24 0 12 0A12 12 0 0 0 1.27 6.64l4 3.09C6.22 6.88 8.87 4.77 12 4.77z"
      />
    </svg>
  );
}

export default function Login() {
  const { refresh } = useAuth();
  const [providers, setProviders] = useState<Providers | null>(null);
  const [mode, setMode] = useState<'password' | 'code'>('password');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [step, setStep] = useState<'phone' | 'code'>('phone');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [cooldown, setCooldown] = useState(0);

  useEffect(() => {
    api
      .get<Providers>('/auth/providers')
      .then(setProviders)
      .catch(() => setProviders({ password: true, google: false, sms: false }));

    const params = new URLSearchParams(window.location.search);
    const googleError = params.get('error');
    if (googleError) {
      setError(GOOGLE_ERRORS[googleError] || 'Google sign in could not be completed. Please try again.');
    }
  }, []);

  useEffect(() => {
    if (cooldown <= 0) return;
    const id = setTimeout(() => setCooldown((value) => value - 1), 1000);
    return () => clearTimeout(id);
  }, [cooldown]);

  async function passwordLogin(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      const result = await api.post<any>('/auth/login', {
        email: email.trim().toLowerCase(),
        password,
      });
      tokens.save(result.access_token, result.refresh_token);
      await refresh();
      window.location.href = '/book';
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Sign in failed');
    }
    setBusy(false);
  }

  async function requestCode() {
    setBusy(true);
    setError('');
    setInfo('');
    try {
      await api.post('/auth/otp/request', { phone });
      setStep('code');
      setCode('');
      setCooldown(60);
      setInfo('Code sent. Enter the 6-digit code from your text message.');
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Something went wrong');
    }
    setBusy(false);
  }

  async function verifyCode(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      const result = await api.post<any>('/auth/otp/verify', { phone, code });
      tokens.save(result.access_token, result.refresh_token);
      await refresh();
      window.location.href = '/book';
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Something went wrong');
    }
    setBusy(false);
  }

  function switchMode(next: 'password' | 'code') {
    setMode(next);
    setError('');
    setInfo('');
    setStep('phone');
    setCode('');
  }

  function googleLogin() {
    if (!API_BASE) {
      setError('Google sign in is not available in this environment.');
      return;
    }
    window.location.href = `${API_BASE}/auth/google/start`;
  }

  return (
    <AuthShell
      image="/images/laundry-water.jpg"
      imageAlt="Fresh towels and water splashing beside a washing machine"
      panelEyebrow="Welcome back"
      panelTitle="Your laundry, ready when you are."
      panelText={
        providers?.google
          ? 'Sign in to book a washer, follow your cycle, and keep your day moving. Use your email and password, or continue with Google.'
          : 'Sign in to book a washer, follow your cycle, and keep your day moving with your email and password.'
      }
    >
      <p className="eyebrow">Customer sign in</p>
      <h1 className="display mt-3 text-3xl text-ink">Welcome back.</h1>
      <p className="mt-3 text-sm leading-6 text-muted">
        Sign in with your email and password
        {providers?.google ? ', or continue with Google' : ''}.
      </p>

      {mode === 'password' ? (
        <form className="mt-7 space-y-4" onSubmit={passwordLogin} noValidate>
          <div>
            <label htmlFor="email" className="label mb-1.5 block">
              Email address
            </label>
            <input
              id="email"
              className="input"
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="you@example.com"
              autoComplete="email"
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
          <button
            type="submit"
            className="btn w-full"
            disabled={busy || !email.trim() || !password}
          >
            {busy ? 'Signing in...' : 'Sign in'}
          </button>
        </form>
      ) : (
        <form className="mt-7 space-y-4" onSubmit={step === 'phone' ? (event) => { event.preventDefault(); requestCode(); } : verifyCode}>
          <PhoneField
            id="phone"
            label="Phone number"
            value={phone}
            onChange={(value) => setPhone(value)}
            hint="Pick your country, then enter your number."
            autoFocus
          />
          {step === 'code' && (
            <div>
              <label htmlFor="code" className="label mb-1.5 block">
                One time code
              </label>
              <input
                id="code"
                className="input text-center text-lg font-semibold tracking-[0.35em]"
                placeholder="000000"
                value={code}
                onChange={(event) => setCode(event.target.value.replace(/\D/g, ''))}
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={6}
              />
              <div className="mt-2 flex items-center justify-between gap-3 text-xs">
                <span className="text-muted">Code expires in 10 minutes.</span>
                <button
                  type="button"
                  onClick={requestCode}
                  disabled={busy || cooldown > 0}
                  className="font-semibold text-accent disabled:text-muted"
                >
                  {cooldown > 0 ? `Resend in ${cooldown}s` : 'Resend code'}
                </button>
              </div>
            </div>
          )}
          <button
            type="submit"
            className="btn w-full"
            disabled={
              busy ||
              (step === 'phone' ? !phone || !isValidPhoneNumber(phone) : code.length !== 6)
            }
          >
            {busy
              ? step === 'phone'
                ? 'Sending code...'
                : 'Verifying...'
              : step === 'phone'
                ? 'Send code'
                : 'Verify and sign in'}
          </button>
        </form>
      )}

      {error && (
        <p role="alert" className="mt-4 rounded-lg border border-[#e7c9c4] bg-[#fbefed] px-3 py-2 text-sm text-[#8d3f36]">
          {error}
        </p>
      )}
      {info && (
        <p role="status" className="mt-4 rounded-lg border border-[#cfe0d3] bg-[#eef6ef] px-3 py-2 text-sm text-[#3f6b45]">
          {info}
        </p>
      )}

      {providers?.google && (
        <>
          <div className="my-5 flex items-center gap-3 text-[10px] font-semibold uppercase tracking-[0.2em] text-muted">
            <span className="h-px flex-1 bg-line" />
            or
            <span className="h-px flex-1 bg-line" />
          </div>
          <button type="button" onClick={googleLogin} className="btn btn-ghost w-full">
            <GoogleIcon className="h-5 w-5" />
            Continue with Google
          </button>
        </>
      )}

      {providers?.sms && (
        <button
          type="button"
          onClick={() => switchMode(mode === 'password' ? 'code' : 'password')}
          className="mt-4 w-full text-center text-sm font-semibold text-accent hover:underline"
        >
          {mode === 'password' ? 'Sign in with a phone code instead' : 'Use email and password instead'}
        </button>
      )}

      <div className="mt-6 space-y-2 text-sm text-muted">
        <p>
          New here?{' '}
          <Link href="/register" className="font-semibold text-accent hover:underline">
            Create an account
          </Link>
        </p>
        <p>
          Staff and managers{' '}
          <Link href="/staff/login" className="font-semibold text-accent hover:underline">
            sign in here
          </Link>
          .
        </p>
      </div>
    </AuthShell>
  );
}
