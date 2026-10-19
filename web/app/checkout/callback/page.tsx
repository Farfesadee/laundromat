'use client';
import { Suspense, useEffect, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { ApiError, api } from '../../../lib/api';
import { CheckCircleIcon, AlertIcon, ClockIcon } from '../../../components/icons';

export const dynamic = 'force-dynamic';

function Inner() {
  const sp = useSearchParams();
  const reference = sp.get('reference') || sp.get('trxref') || '';
  const [state, setState] = useState<'checking' | 'paid' | 'pending' | 'error'>('checking');
  const [message, setMessage] = useState('');

  useEffect(() => {
    if (!reference) {
      setState('error');
      setMessage('No payment reference was returned. If you were charged, contact us with your receipt.');
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const r = await api.get<any>(`/payments/paystack/verify?reference=${encodeURIComponent(reference)}`);
        if (cancelled) return;
        if (r.ok) { setState('paid'); setMessage(`Order #${r.order_no} is confirmed and in the queue.`); }
        else { setState('pending'); setMessage('Payment is not confirmed yet. This page updates as soon as Paystack confirms it.'); }
      } catch (e) {
        if (cancelled) return;
        setState('error');
        setMessage(e instanceof ApiError ? e.message : 'We could not verify this payment.');
      }
    })();
    return () => { cancelled = true; };
  }, [reference]);

  const Icon = state === 'paid' ? CheckCircleIcon : state === 'pending' || state === 'checking' ? ClockIcon : AlertIcon;
  const tone = state === 'paid' ? 'text-emerald-700 bg-emerald-50 border-emerald-200'
    : state === 'error' ? 'text-rose-700 bg-rose-50 border-rose-200'
    : 'text-amber-700 bg-amber-50 border-amber-200';

  return (
    <div className="max-w-md mx-auto">
      <div className={`card border ${tone} text-center`}>
        <span className="mx-auto w-14 h-14 rounded-2xl grid place-items-center bg-white/70">
          <Icon className="w-7 h-7" />
        </span>
        <p className="font-extrabold text-lg mt-3">
          {state === 'checking' ? 'Confirming your payment' : state === 'paid' ? 'Payment confirmed' : state === 'pending' ? 'Payment pending' : 'Could not confirm'}
        </p>
        <p className="text-sm mt-1">{message}</p>
        {reference && <p className="text-[11px] text-slate-400 mt-2">Reference {reference}</p>}
        <div className="flex gap-2 mt-4">
          <Link className="btn flex-1" href="/orders">Track my washes</Link>
          <Link className="btn flex-1 !bg-slate-200 !text-slate-700" href="/book">Book another</Link>
        </div>
      </div>
    </div>
  );
}

export default function Callback() {
  return (<Suspense><Inner /></Suspense>);
}
