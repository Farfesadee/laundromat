'use client';
import { Suspense, useEffect, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { ApiError, api, kobo } from '../../../lib/api';
import { ErrorBox, PageHeader, Skeleton, Steps } from '../../../components/ui';
import { ArrowRightIcon } from '../../../components/icons';

export const dynamic = 'force-dynamic';

function Inner() {
  const sp = useSearchParams();
  const washes = Number(sp.get('washes') || 2);
  const [items, setItems] = useState<any[]>([]);
  const [cart, setCart] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    api.services()
      .then(s => setItems(s.filter(i => i.kind !== 'self_service_wash')))
      .catch((e: ApiError) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  const toggle = (id: string, d: number) =>
    setCart(c => ({ ...c, [id]: Math.max(0, (c[id] || 0) + d) }));
  const qs = Object.entries(cart).filter(([, q]) => q > 0).map(([id, q]) => `${id}:${q}`).join(',');

  return (
    <div className="max-w-md mx-auto">
      <PageHeader kicker="Extras" title="Anything to enjoy?" sub={`${washes} wash${washes > 1 ? 'es' : ''} in your basket.`} />
      <Steps steps={['Washes', 'Extras', 'Pay', 'Track']} current={1} />
      {loading ? <><Skeleton /><Skeleton className="mt-2" /></> :
        error ? <ErrorBox message={error} retry={() => window.location.reload()} /> :
        <div className="card space-y-2">
          {items.map(i => (
            <div key={i.id} className="flex justify-between items-center rounded-xl border border-slate-100 p-3">
              <div><p className="font-bold">{i.name}</p><p className="text-sm text-slate-500">{kobo(i.unit_price)}</p></div>
              <div className="flex items-center gap-2">
                <button className="btn-ghost btn !w-9 !p-2" onClick={() => toggle(i.id, -1)}>−</button>
                <b className="w-5 text-center">{cart[i.id] || 0}</b>
                <button className="btn !w-9 !p-2" onClick={() => toggle(i.id, 1)}>+</button>
              </div>
            </div>
          ))}
          <Link className="btn w-full !mt-4" href={`/checkout?washes=${washes}&addons=${encodeURIComponent(qs)}`}>Continue to payment</Link>
          <Link className="inline-flex items-center gap-1 text-sm text-slate-500" href={`/checkout?washes=${washes}`}>Skip extras <ArrowRightIcon className="w-4 h-4" /></Link>
        </div>}
    </div>
  );
}

export default function AddOns() {
  return (<Suspense><Inner /></Suspense>);
}
