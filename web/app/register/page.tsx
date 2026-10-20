'use client';
import { useEffect, useState } from 'react';
import type { ChangeEvent, FormEvent } from 'react';
import Link from 'next/link';
import { API_BASE, ApiError, api, tokens } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { AuthShell } from '../../components/auth-shell';
import { CheckCircleIcon, GoogleIcon } from '../../components/icons';
import { PhoneField, isValidPhoneNumber } from '../../components/phone-field';

const emptyForm = {
  first_name: '',
  last_name: '',
  preferred_name: '',
  email: '',
  phone: '',
  password: '',
  confirm: '',
};

export default function Register() {
  const { refresh } = useAuth();
  const [form, setForm] = useState(emptyForm);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [googleEnabled, setGoogleEnabled] = useState(false);

  useEffect(() => {
    let active = true;
    api
      .get<{ google: boolean }>('/auth/providers')
      .then((providers) => {
        if (active) setGoogleEnabled(Boolean(providers.google));
      })
      .catch(() => {
        if (active) setGoogleEnabled(false);
      });
    return () => {
      active = false;
    };
  }, []);

  const set = (key: keyof typeof form) => (event: ChangeEvent<HTMLInputElement>) => {
    setForm((current) => ({ ...current, [key]: event.target.value }));
    setErrors((current) => ({ ...current, [key]: '' }));
  };

  const setPhone = (value: string) => {
    setForm((current) => ({ ...current, phone: value }));
    setErrors((current) => ({ ...current, phone: '' }));
  };

  const passwordRules = [
    { label: 'At least 8 characters', met: form.password.length >= 8 },
    { label: 'Includes a letter', met: /[A-Za-z]/.test(form.password) },
    { label: 'Includes a number', met: /[0-9]/.test(form.password) },
  ];
  const passwordReady = passwordRules.every((rule) => rule.met);
  const passwordsMatch = form.confirm.length > 0 && form.confirm === form.password;

  function validate() {
    const next: Record<string, string> = {};
    if (!form.first_name.trim()) next.first_name = 'Enter your first name.';
    if (!form.email.trim()) next.email = 'Enter your email address.';
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) {
      next.email = 'Enter a valid email address.';
    }
    if (!form.phone || !isValidPhoneNumber(form.phone)) {
      next.phone = 'Select your country and enter a valid phone number.';
    }
    if (!form.password) next.password = 'Create a password.';
    else if (!passwordReady) {
      next.password = 'Meet all three password requirements below.';
    }
    if (!form.confirm) next.confirm = 'Re-enter your password.';
    else if (form.confirm !== form.password) next.confirm = 'Passwords do not match.';
    setErrors(next);
    return Object.keys(next).length === 0;
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError('');
    if (!validate()) return;
    setBusy(true);
    try {
      const result = await api.post<any>('/auth/register', {
        first_name: form.first_name.trim(),
        last_name: form.last_name.trim(),
        preferred_name: form.preferred_name.trim(),
        email: form.email.trim(),
        phone: form.phone,
        password: form.password,
      });
      tokens.save(result.access_token, result.refresh_token);
      await refresh();
      window.location.href = '/book';
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'We could not create your account. Please try again.');
    }
    setBusy(false);
  }

  function googleSignup() {
    if (!API_BASE) {
      setError('Google sign up is not available right now. Please create an account with your email.');
      return;
    }
    window.location.href = `${API_BASE}/auth/google/start`;
  }

  return (
    <AuthShell
      image="/images/laundry-water.jpg"
      imageAlt="Fresh towels and water splashing beside a washing machine"
      panelEyebrow="Join LAUNDROMAT"
      panelTitle="A cleaner routine starts here."
      panelText="Create one account for online booking and in-store visits. Your email keeps your bookings, receipts, and sign in together."
    >
      <p className="eyebrow">Create account</p>
      <h1 className="display mt-3 text-3xl text-ink">Your first wash starts here.</h1>
      <p className="mt-3 text-sm leading-6 text-muted">
        Use your email and password to sign in next time. We will only use your phone number for
        booking updates and store contact.
      </p>
      <p className="mt-2 text-xs text-muted">
        <span className="req">*</span> Required field
      </p>

      {googleEnabled && (
        <>
          <button type="button" onClick={googleSignup} className="btn btn-ghost mt-6 w-full">
            <GoogleIcon className="h-5 w-5" />
            Continue with Google
          </button>
          <div className="mt-5 flex items-center gap-3 text-[10px] font-semibold uppercase tracking-[0.2em] text-muted">
            <span className="h-px flex-1 bg-line" />
            or create with email
            <span className="h-px flex-1 bg-line" />
          </div>
        </>
      )}

      <form className="mt-6 space-y-4" onSubmit={submit} noValidate>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="first_name" className="label mb-1.5 block">
              First name
              <span className="req" aria-hidden="true">
                *
              </span>
            </label>
            <input
              id="first_name"
              className={`input ${errors.first_name ? 'border-[#c98b84]' : ''}`}
              value={form.first_name}
              onChange={set('first_name')}
              autoComplete="given-name"
              autoFocus
              aria-invalid={Boolean(errors.first_name)}
              aria-required="true"
            />
            {errors.first_name && <p className="mt-1.5 text-xs text-[#8d3f36]">{errors.first_name}</p>}
          </div>
          <div>
            <label htmlFor="last_name" className="label mb-1.5 block">
              Last name <span className="normal-case tracking-normal text-muted">(optional)</span>
            </label>
            <input
              id="last_name"
              className="input"
              value={form.last_name}
              onChange={set('last_name')}
              autoComplete="family-name"
            />
          </div>
        </div>

        <div>
          <label htmlFor="email" className="label mb-1.5 block">
            Email address
            <span className="req" aria-hidden="true">
              *
            </span>
          </label>
          <input
            id="email"
            className={`input ${errors.email ? 'border-[#c98b84]' : ''}`}
            type="email"
            value={form.email}
            onChange={set('email')}
            placeholder="you@example.com"
            autoComplete="email"
            aria-invalid={Boolean(errors.email)}
            aria-required="true"
          />
          {errors.email ? (
            <p className="mt-1.5 text-xs text-[#8d3f36]">{errors.email}</p>
          ) : (
            <p className="mt-1.5 text-xs text-muted">This is the email you will sign in with.</p>
          )}
        </div>

        <PhoneField
          id="phone"
          label="Phone number"
          value={form.phone}
          onChange={setPhone}
          error={errors.phone}
          hint="Pick your country, then enter your number."
          required
        />

        <div className="space-y-4">
          <div>
            <label htmlFor="password" className="label mb-1.5 block">
              Password
              <span className="req" aria-hidden="true">
                *
              </span>
            </label>
            <input
              id="password"
              className={`input ${errors.password ? 'border-[#c98b84]' : ''}`}
              type="password"
              value={form.password}
              onChange={set('password')}
              autoComplete="new-password"
              aria-invalid={Boolean(errors.password)}
              aria-required="true"
              aria-describedby="password-requirements"
            />
            <ul
              id="password-requirements"
              className="mt-2 space-y-1"
              aria-label="Password requirements"
              aria-live="polite"
            >
              {passwordRules.map((rule) => (
                <li
                  key={rule.label}
                  className={`flex items-center gap-1.5 text-xs ${
                    rule.met ? 'text-[#3f6b45]' : 'text-muted'
                  }`}
                >
                  {rule.met ? (
                    <CheckCircleIcon className="h-3.5 w-3.5 shrink-0" />
                  ) : (
                    <span
                      aria-hidden="true"
                      className="h-3.5 w-3.5 shrink-0 rounded-full border border-line"
                    />
                  )}
                  <span>
                    <span className="sr-only">{rule.met ? 'Met: ' : 'Not met: '}</span>
                    {rule.label}
                  </span>
                </li>
              ))}
            </ul>
            {errors.password && <p className="mt-1.5 text-xs text-[#8d3f36]">{errors.password}</p>}
          </div>
          <div>
            <label htmlFor="confirm" className="label mb-1.5 block">
              Confirm password
              <span className="req" aria-hidden="true">
                *
              </span>
            </label>
            <input
              id="confirm"
              className={`input ${errors.confirm ? 'border-[#c98b84]' : ''}`}
              type="password"
              value={form.confirm}
              onChange={set('confirm')}
              autoComplete="new-password"
              aria-invalid={Boolean(errors.confirm)}
              aria-required="true"
              aria-describedby={form.confirm && !errors.confirm ? 'confirm-status' : undefined}
            />
            {errors.confirm ? (
              <p className="mt-1.5 text-xs text-[#8d3f36]">{errors.confirm}</p>
            ) : form.confirm ? (
              <p
                id="confirm-status"
                className={`mt-1.5 flex items-center gap-1 text-xs ${
                  passwordsMatch ? 'text-[#3f6b45]' : 'text-[#8d3f36]'
                }`}
              >
                {passwordsMatch && <CheckCircleIcon className="h-3.5 w-3.5 shrink-0" />}
                {passwordsMatch ? 'Passwords match.' : 'Passwords do not match yet.'}
              </p>
            ) : null}
          </div>
        </div>

        <div>
          <label htmlFor="preferred_name" className="label mb-1.5 block">
            Username <span className="normal-case tracking-normal text-muted">(optional)</span>
          </label>
          <input
            id="preferred_name"
            className="input"
            placeholder="What should we call you?"
            value={form.preferred_name}
            onChange={set('preferred_name')}
            autoComplete="nickname"
          />
          <p className="mt-1.5 text-xs text-muted">Shown on the queue board. Defaults to your first name.</p>
        </div>

        {error && (
          <p role="alert" className="rounded-xl border border-[#e7c9c4] bg-[#fbefed] px-3 py-2 text-sm text-[#8d3f36]">
            {error}
          </p>
        )}

        <button type="submit" className="btn w-full" disabled={busy}>
          {busy ? 'Creating account...' : 'Create account'}
        </button>
      </form>

      <p className="mt-6 text-sm text-muted">
        Already have an account?{' '}
        <Link href="/login" className="font-semibold text-accent hover:underline">
          Sign in
        </Link>
      </p>
    </AuthShell>
  );
}
