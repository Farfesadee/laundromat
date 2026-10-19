'use client';
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { API_BASE, ApiError, api, tokens } from '../../../../lib/api';
import { useAuth } from '../../../../lib/auth';
import { AuthShell } from '../../../../components/auth-shell';

export default function GoogleCallback() {
  const { refresh } = useAuth();
  const started = useRef(false);
  const [status, setStatus] = useState<'working' | 'error'>('working');
  const [message, setMessage] = useState('');

  useEffect(() => {
    if (started.current) return;
    started.current = true;

    const fragment = window.location.hash.replace(/^#/, '');
    const code = new URLSearchParams(fragment).get('code');
    if (!code) {
      setStatus('error');
      setMessage('This sign in link is missing its code. Start again from the sign in page.');
      return;
    }

    // Remove the one time code from the address bar before exchanging it.
    window.history.replaceState(null, '', window.location.pathname);

    (async () => {
      try {
        const result = await api.post<any>('/auth/google/exchange', { code });
        tokens.save(result.access_token, result.refresh_token);
        await refresh();
        window.location.replace('/book');
      } catch (e) {
        setStatus('error');
        setMessage(
          e instanceof ApiError ? e.message : 'Google sign in could not be completed. Please try again.',
        );
      }
    })();
  }, [refresh]);

  return (
    <AuthShell
      image="/images/laundry-flyer.jpg"
      imageAlt="Laundry hanging outside in warm afternoon light"
      panelEyebrow="Google sign in"
      panelTitle="Fresh clothes. One less thing to think about."
      panelText="We are confirming your Google account, then taking you straight to your bookings."
    >
      <p className="eyebrow">Google sign in</p>
      <h1 className="display mt-3 text-3xl text-ink">
        {status === 'working' ? 'One moment.' : 'That did not work.'}
      </h1>
      <div aria-live="polite">
        {status === 'working' ? (
          <div className="mt-4 space-y-5">
            <p className="text-sm leading-6 text-muted">
              We are confirming your Google account and securing your session.
            </p>
            <div className="flex items-center gap-3 rounded-lg border border-line bg-paper px-3 py-3 text-sm text-muted">
              <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-accent" />
              Signing you in securely
            </div>
          </div>
        ) : (
          <div className="mt-4 space-y-5">
            <p className="text-sm leading-6 text-muted">{message}</p>
            <div className="grid gap-3">
              <Link href="/login" className="btn w-full">
                Back to sign in
              </Link>
              {API_BASE && (
                <a href={`${API_BASE}/auth/google/start`} className="btn btn-ghost w-full">
                  Try Google again
                </a>
              )}
            </div>
          </div>
        )}
      </div>
    </AuthShell>
  );
}
