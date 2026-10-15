'use client';
import { useState } from 'react';
import Link from 'next/link';
import { PageHeader, Steps } from '../../../components/ui';

export default function DropOff() {
  const [n, setN] = useState(3);
  return (
    <div className="max-w-md mx-auto">
      <PageHeader kicker="Drop-off" title="How many loads?" sub="We wash, dry and fold. You get a ready time and a pickup alert." />
      <Steps steps={['Loads', 'Details', 'Pay', 'Pickup']} current={0} />
      <div className="card text-center">
        <div className="flex items-center justify-center gap-5 my-2">
          <button className="btn !w-12 !rounded-full" onClick={() => setN(Math.max(1, n - 1))} aria-label="fewer">−</button>
          <span className="text-5xl font-extrabold">{n}</span>
          <button className="btn !w-12 !rounded-full" onClick={() => setN(n + 1)} aria-label="more">+</button>
        </div>
        <div className="rounded-2xl bg-slate-50 border mt-4 p-4">
          <p className="label">Estimated ready</p>
          <p className="text-2xl font-extrabold">Today, late afternoon</p>
          <p className="text-xs text-slate-500">Exact time confirmed at the counter.</p>
        </div>
        <Link className="btn w-full mt-4" href={`/checkout?washes=${n}&type=dropoff`}>Continue</Link>
      </div>
    </div>
  );
}
