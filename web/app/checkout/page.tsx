'use client';
import { Suspense, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { ApiError, api, kobo, tokens } from '../../lib/api';
import { ErrorBox, PageHeader, Steps } from '../../components/ui';
import { ArrowRightIcon } from '../../components/icons';

export const dynamic = 'force-dynamic';

const METHODS = ['Card (Paystack)', 'Bank Transfer', 'POS (In-store)'];

function Inner() {
  const sp = useSearchParams();
  const washes = Number(sp.get('washes') || 2);
  const type = sp.get('type') || 'self_service';
  const [phone, setPhone] = useState('');
  const [name, setName] = useState('');
  const [method, setMethod] = useState(METHODS[0]);
  const [washPrice, setWashPrice] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState<any>(null);

  useEffect(() => {
    api.services().then(s => {
      const w = s.find(x => x.kind === 'self_service_wash');
      if (w) setWashPrice(w.unit_price);
    }).catch(() => {});
  }, []);

  const total = useMemo(() => washes * washPrice, [washes, washPrice]);

  async function pay() {
    setBusy(true); setError('');
    try {
      const order = await api.post<any>('/orders', {
        phone: phone || undefined, preferred_name: name || undefined,
        washes, type, channel: 'online',
      }, tokens.get());
      if (method.startsWith('Card')) {
        const init = await api.post<any>('/payments/paystack/initialize', { order_id: order.id }, tokens.get());
        setDone({ ...order, payUrl: init.authorization_url, reference: init.reference });
      } else {
        setDone({ ...order, payUrl: null });
      }
    } catch (e) { setError(e instanceof ApiError ? e.message : 'Checkout failed'); }
    setBusy(false);
  }

  return (
    <div className="max-w-md mx-auto">
      <PageHeader kicker="Checkout" title="Order summary" sub="Online bookings are confirmed after verified payment." />
      <Steps steps={['Washes', 'Extras', 'Pay', 'Track']} current={2} />
      <div className="card space-y-3">
        <div className="rounded-xl bg-slate-50 p-3 text-sm">
          <p>Self-service washes × {washes} <span className="text-slate-400">·</span> <b>{kobo(total)}</b></p>
          <p className="font-extrabold mt-1">Total {kobo(total)}</p>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div><p className="label mb-1">Your name</p><input className="input" value={name} onChange={e => setName(e.target.value)} placeholder="In-store name" /></div>
          <div><p className="label mb-1">Phone</p><input className="input" value={phone} onChange={e => setPhone(e.target.value)} placeholder="+234…" inputMode="tel" /></div>
        </div>
        <div className="space-y-1.5">
          {METHODS.map(m => (
            <label key={m} className={`flex gap-2 items-center rounded-xl border p-3 text-sm cursor-pointer ${method === m ? 'border-cyan-600 bg-cyan-50' : 'border-slate-200'}`}>
              <input type="radio" checked={method === m} onChange={() => setMethod(m)} />{m}
            </label>
          ))}
        </div>
        {error && <ErrorBox message={error} />}
        {done ? (
          <div className="rounded-xl bg-emerald-50 border border-emerald-200 p-3 text-sm">
            <p className="font-bold text-emerald-800">Order #{done.order_no} created</p>
            {done.payUrl
              ? <><p className="mt-1">Complete payment with Paystack, then track your wash.</p><a className="btn w-full mt-2" href={done.payUrl}>Pay with Paystack</a></>
              : <p className="mt-1">Pay {kobo(done.total)} in-store when you arrive.</p>}
            <a className="mt-2 flex items-center justify-center gap-1 text-center font-bold text-cyan-700" href="/orders">Track my washes <ArrowRightIcon className="w-4 h-4" /></a>
          </div>
        ) : (
          <button className="btn w-full" disabled={busy || !phone || !name} onClick={pay}>{busy ? 'Creating order…' : `Pay ${kobo(total)}`}</button>
        )}
        <p className="text-[11px] text-slate-400 text-center">Secured by Paystack · verified by server webhook</p>
      </div>
    </div>
  );
}

export default function Checkout() {
  return (<Suspense><Inner /></Suspense>);
}
