'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ApiError, api, kobo } from '../../../lib/api';
import { ErrorBox, PageHeader, Steps } from '../../../components/ui';

export default function SelfService() {
  const [n, setN] = useState(2);
  const [est, setEst] = useState<{ wait_minutes: number | null; accepting: boolean } | null>(null);
  const [price, setPrice] = useState<number | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let live = true;
    setError('');
    api.estimate(n).then(e => live && setEst(e)).catch((e: ApiError) => live && setError(e.message));
    api.services().then(s => live && setPrice(s.find(x => x.kind === 'self_service_wash')?.unit_price ?? null)).catch(() => {});
    return () => { live = false; };
  }, [n]);

  return (
    <div className="max-w-md mx-auto">
      <PageHeader kicker="Self-service" title="How many washes?" sub="Each wash is a 10 kg standard load." />
      <Steps steps={['Washes', 'Extras', 'Pay', 'Track']} current={0} />
      <div className="card text-center">
        <div className="flex items-center justify-center gap-5 my-2">
          <button className="btn !w-12 !rounded-full" onClick={() => setN(Math.max(1, n - 1))} aria-label="fewer">−</button>
          <span className="text-5xl font-semibold text-ink">{n}</span>
          <button className="btn !w-12 !rounded-full" onClick={() => setN(Math.min(20, n + 1))} aria-label="more">+</button>
        </div>
        {price != null && <p className="text-sm text-slate-500">{kobo(price)} per wash · total {kobo(price * n)}</p>}
        <div className="rounded-lg bg-paper border border-line mt-4 p-4">
          <p className="label">Estimated wait</p>
          <p className="text-3xl font-semibold text-ink">~ {est?.wait_minutes ?? '…'} min</p>
          {!est?.accepting && <p className="text-sm text-rose-600 font-semibold mt-1">Today&apos;s queue is currently closed.</p>}
        </div>
        {error && <div className="mt-3"><ErrorBox message={error} retry={() => window.location.reload()} /></div>}
        <p className="text-xs text-[#7a5a2a] bg-[#f7f1e6] border border-[#e6d7c1] rounded-lg p-2.5 mt-3">
          Arrive at least 10 minutes before your estimated turn, or your wash may be skipped.
        </p>
        <Link className="btn w-full mt-4" href={`/book/add-ons?washes=${n}`}>Continue</Link>
      </div>
    </div>
  );
}
