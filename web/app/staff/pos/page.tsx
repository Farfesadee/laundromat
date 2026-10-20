'use client';
import { useEffect, useState } from 'react';
import { ApiError, api, kobo, tokens } from '../../../lib/api';
import { ErrorBox, PageHeader } from '../../../components/ui';
import { BackLink } from '../../../components/back-link';
import { PhoneField } from '../../../components/phone-field';

export default function POS() {
  const [services, setServices] = useState<any[]>([]);
  const [cart, setCart] = useState<Record<string, number>>({});
  const [phone, setPhone] = useState('');
  const [name, setName] = useState('');
  const [msg, setMsg] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    api.services().then(setServices).catch((e: ApiError) => setError(e.message));
  }, []);

  const total = services.reduce((s, i) => s + (cart[i.id] || 0) * i.unit_price, 0);
  const setQty = (id: string, d: number) => setCart(c => ({ ...c, [id]: Math.max(0, (c[id] || 0) + d) }));

  async function sale(method: string) {
    setError(''); setMsg('');
    try {
      const washSvc = services.find(s => s.kind === 'self_service_wash');
      const order = await api.post<any>('/orders', {
        phone: phone || undefined, preferred_name: name || undefined,
        washes: (washSvc && cart[washSvc.id]) || 0,
        type: 'retail', channel: 'in_store',
      }, tokens.get());
      const amount = order.total || total;
      await api.post(`/orders/${order.id}/payments`, { method, amount }, tokens.get());
      setMsg(`Sale complete: order #${order.order_no}, ${kobo(amount)} via ${method}.`);
      setCart({});
    } catch (e) { setError(e instanceof ApiError ? e.message : 'We could not complete the sale. Please try again.'); }
  }

  return (
    <div>
      <BackLink href="/staff" label="Back to overview" />
      <PageHeader kicker="Point of sale" title="New sale" sub="Retail, drinks and washes. Partial payments supported." />
      {error && <div className="mb-3"><ErrorBox message={error} /></div>}
      <div className="grid md:grid-cols-[1.4fr_1fr] gap-3">
        <div className="card">
          <div className="grid gap-2">
            <input className="input" placeholder="Customer name" value={name} onChange={e => setName(e.target.value)} />
            <PhoneField id="pos-phone" label="Customer phone" value={phone} onChange={setPhone} hint="Optional. Pick the country, then enter the number." />
          </div>
          <div className="mt-3 space-y-2">
            {services.map(s => (
              <div key={s.id} className="flex justify-between items-center rounded-xl border border-slate-100 p-3 text-sm">
                <span><b>{s.name}</b><br /><span className="text-slate-500">{kobo(s.unit_price)}</span></span>
                <span className="flex gap-2 items-center">
                  <button className="btn-ghost btn !w-8 !p-1.5" onClick={() => setQty(s.id, -1)}>−</button>
                  <b className="w-5 text-center">{cart[s.id] || 0}</b>
                  <button className="btn !w-8 !p-1.5" onClick={() => setQty(s.id, 1)}>+</button>
                </span>
              </div>
            ))}
          </div>
        </div>
        <div className="card h-fit sticky top-20">
          <p className="label">Total</p>
          <p className="text-3xl font-extrabold">{kobo(total)}</p>
          <div className="grid grid-cols-2 gap-2 mt-3">
            {['cash', 'transfer', 'pos', 'paystack_card'].map(m => (
              <button key={m} className="btn !py-2.5" disabled={total <= 0} onClick={() => sale(m)}>{m}</button>
            ))}
          </div>
          {msg && <p className="text-sm mt-3 text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-xl p-2.5">{msg}</p>}
        </div>
      </div>
    </div>
  );
}
