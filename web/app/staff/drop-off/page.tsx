'use client';
import { useEffect, useState } from 'react';
import { ApiError, api, kobo, tokens } from '../../../lib/api';
import { Badge, Empty, ErrorBox, PageHeader } from '../../../components/ui';

export default function DropOffStaff() {
  const [rows, setRows] = useState<any[]>([]);
  const [error, setError] = useState('');
  useEffect(() => {
    api.get<any[]>('/dropoff/orders', tokens.get()).then(setRows).catch((e: ApiError) => setError(e.message));
  }, []);
  return (
    <div>
      <PageHeader kicker="Drop-off" title="Drop-off orders" sub="Separate lane from the self-service queue." />
      {error ? <ErrorBox message={error} /> : rows.length === 0 ? <Empty title="No drop-off orders" sub="New drop-offs will land here." /> : (
        <div className="card !p-0 overflow-hidden">
          <table className="table-clean min-w-[560px]">
            <thead><tr><th className="pl-4">Order</th><th>Status</th><th>Total</th><th className="text-right pr-4">Action</th></tr></thead>
            <tbody>{rows.map(r => (
              <tr key={r.id}><td className="pl-4 font-extrabold">#{r.order_no}</td><td><Badge status={r.status} /></td>
                <td className="tabular-nums">{kobo(r.total)}</td><td className="text-right pr-4"><span className="badge bg-slate-100">View</span></td></tr>
            ))}</tbody>
          </table>
        </div>
      )}
    </div>
  );
}
