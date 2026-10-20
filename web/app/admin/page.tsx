'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useAuth } from '../../lib/auth';
import { ApiError, api, fmtTime, kobo, tokens } from '../../lib/api';
import {
  AlertIcon,
  BasketIcon,
  BellIcon,
  CardIcon,
  ChartIcon,
  CheckCircleIcon,
  ClockIcon,
  CloseIcon,
  SearchIcon,
  SparkleIcon,
  UserIcon,
  WasherIcon,
} from '../../components/icons';
import { Badge, Empty, ErrorBox, Skeleton, Stat } from '../../components/ui';

type Tab = 'overview' | 'floor' | 'orders' | 'customers' | 'team' | 'catalogue' | 'settings' | 'audit' | 'payments';

const ADMIN_ROLES = ['owner', 'super_admin'];

const TABS: { id: Tab; label: string; Icon: typeof ChartIcon; hint: string }[] = [
  { id: 'overview', label: 'Overview', Icon: ChartIcon, hint: 'The whole business at a glance.' },
  { id: 'floor', label: 'Live floor', Icon: WasherIcon, hint: 'Machines, queue, and the work in motion.' },
  { id: 'orders', label: 'Orders', Icon: BasketIcon, hint: 'Every booking and walk-in, in one ledger.' },
  { id: 'customers', label: 'Customers', Icon: UserIcon, hint: 'Profiles, spend, and contact details.' },
  { id: 'team', label: 'Team', Icon: ClockIcon, hint: 'Staff access and permissions.' },
  { id: 'catalogue', label: 'Catalogue', Icon: SparkleIcon, hint: 'Services, prices, washers, and dryers.' },
  { id: 'settings', label: 'Settings', Icon: BellIcon, hint: 'Opening hours and business rules.' },
  { id: 'audit', label: 'Audit trail', Icon: AlertIcon, hint: 'Every sensitive action, recorded.' },
  { id: 'payments', label: 'Payments', Icon: CardIcon, hint: 'Cash, transfers, cards, and refunds.' },
];

const ORDER_STATUSES = [
  'pending_payment',
  'booked',
  'checked_in',
  'in_progress',
  'ready',
  'collected',
  'cancelled',
  'expired',
];

function dateTime(value: string | null | undefined) {
  if (!value) return '-';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return String(value);
  return d.toLocaleString('en-NG', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

function dateOnly(value: string | null | undefined) {
  if (!value) return '-';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return String(value);
  return d.toLocaleDateString('en-NG', { month: 'short', day: 'numeric', year: 'numeric' });
}

export default function AdminPage() {
  const { user, loading: authLoading } = useAuth();
  const [tab, setTab] = useState<Tab>('overview');
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const [overview, setOverview] = useState<any>(null);
  const [orders, setOrders] = useState<any[]>([]);
  const [customers, setCustomers] = useState<any[]>([]);
  const [team, setTeam] = useState<any[]>([]);
  const [services, setServices] = useState<any[]>([]);
  const [machines, setMachines] = useState<any[]>([]);
  const [settingsData, setSettingsData] = useState<any>(null);
  const [payments, setPayments] = useState<any[]>([]);
  const [audit, setAudit] = useState<any[]>([]);

  const [orderQuery, setOrderQuery] = useState('');
  const [orderStatus, setOrderStatus] = useState('');
  const [customerQuery, setCustomerQuery] = useState('');
  const [paymentQuery, setPaymentQuery] = useState('');
  const [paymentKind, setPaymentKind] = useState('');
  const [auditQuery, setAuditQuery] = useState('');

  const [selectedOrder, setSelectedOrder] = useState<any>(null);
  const [editingCustomer, setEditingCustomer] = useState<any>(null);
  const [editingTeam, setEditingTeam] = useState<any>(null);
  const [editingService, setEditingService] = useState<any>(null);
  const [editingMachine, setEditingMachine] = useState<any>(null);
  const [refundPayment, setRefundPayment] = useState<any>(null);
  const [machinePick, setMachinePick] = useState<Record<string, string>>({});

  const allowed = Boolean(user && ADMIN_ROLES.includes(user.role || ''));

  const loadTab = useCallback(async (target: Tab, query = '') => {
    const t = tokens.get();
    if (!t) return;
    setLoading(true);
    setError('');
    try {
      if (target === 'overview' || target === 'floor') {
        setOverview(await api.get<any>('/admin/overview', t));
      } else if (target === 'orders') {
        setOrders(await api.get<any[]>(`/admin/orders?limit=150${query ? `&q=${encodeURIComponent(query)}` : ''}`, t));
      } else if (target === 'customers') {
        setCustomers(
          await api.get<any[]>(`/admin/customers?limit=150${query ? `&q=${encodeURIComponent(query)}` : ''}`, t),
        );
      } else if (target === 'team') {
        setTeam(await api.get<any[]>('/admin/team', t));
      } else if (target === 'catalogue') {
        const [s, m] = await Promise.all([
          api.get<any[]>('/admin/services', t),
          api.get<any[]>('/admin/machines', t),
        ]);
        setServices(s);
        setMachines(m);
      } else if (target === 'settings') {
        setSettingsData(await api.get<any>('/admin/settings', t));
      } else if (target === 'payments') {
        setPayments(
          await api.get<any[]>(
            `/admin/payments?limit=200${query ? `&q=${encodeURIComponent(query)}` : ''}`,
            t,
          ),
        );
      } else if (target === 'audit') {
        setAudit(
          await api.get<any[]>(
            `/admin/audit?limit=200${query ? `&action=${encodeURIComponent(query)}` : ''}`,
            t,
          ),
        );
      }
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'We could not load this view. Please try again.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!allowed) return;
    loadTab(tab);
  }, [allowed, tab, loadTab]);

  async function perform(
    path: string,
    body: unknown,
    method: 'post' | 'patch' | 'put' = 'post',
    after?: () => Promise<void> | void,
  ) {
    const t = tokens.get();
    setBusy(path);
    setError('');
    setNotice('');
    try {
      if (method === 'post') await api.post(path, body, t);
      else if (method === 'patch') await api.patch(path, body, t);
      else await api.put(path, body, t);
      setNotice('Change saved.');
      await loadTab(tab);
      if (after) await after();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'That change could not be saved. Please try again.');
    } finally {
      setBusy('');
    }
  }

  async function openOrder(id: string) {
    try {
      setSelectedOrder(await api.get<any>(`/admin/orders/${id}`, tokens.get()));
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'We could not open that order. Please try again.');
    }
  }

  const current = TABS.find((item) => item.id === tab) || TABS[0];

  if (authLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-28" />
        <div className="grid gap-4 md:grid-cols-3">
          <Skeleton className="h-36" />
          <Skeleton className="h-36" />
          <Skeleton className="h-36" />
        </div>
      </div>
    );
  }

  if (!allowed) {
    return (
      <div className="mx-auto max-w-xl py-16">
        <div className="card text-center">
          <span className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-accent-soft text-accent">
            <AlertIcon className="h-7 w-7" />
          </span>
          <h1 className="display mt-5 text-3xl text-ink">Owner access only.</h1>
          <p className="mt-3 text-sm leading-6 text-muted">
            Sign in with the store owner account to open the super admin console.
          </p>
          <Link href="/staff/login" className="btn mt-6">
            Go to team sign in
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="rise">
      <div className="grid gap-6 lg:grid-cols-[224px_minmax(0,1fr)]">
        <aside className="min-w-0 lg:sticky lg:top-24 lg:h-fit">
          <div className="flex flex-wrap gap-1 rounded-2xl border border-line bg-white p-1.5 lg:flex-col">
            {TABS.map(({ id, label, Icon }) => {
              const active = tab === id;
              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => setTab(id)}
                  className={`inline-flex shrink-0 items-center gap-2.5 rounded-xl px-3 py-2.5 text-left text-[13px] font-semibold transition lg:w-full ${
                    active
                      ? 'bg-ink text-white'
                      : 'text-muted hover:bg-accent-soft hover:text-ink'
                  }`}
                >
                  <Icon className="h-4 w-4 shrink-0" />
                  {label}
                </button>
              );
            })}
          </div>

          <div className="mt-4 hidden rounded-2xl border border-line bg-white p-4 lg:block">
            <div className="flex items-center gap-2 text-xs font-semibold text-muted">
              <span className="dot bg-[#38a169] live-dot" />
              Live connection
            </div>
            <p className="mt-2 text-xs leading-5 text-muted">
              Data refreshes when you switch views. Use refresh for the newest numbers.
            </p>
            <button
              type="button"
              className="btn btn-ghost btn-sm mt-3 w-full"
              onClick={() => loadTab(tab)}
              disabled={loading}
            >
              {loading ? 'Refreshing...' : 'Refresh now'}
            </button>
          </div>
        </aside>

        <section className="min-w-0">
          <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="eyebrow">Super admin</p>
              <h1 className="display mt-2 text-3xl text-ink sm:text-4xl">{current.label}</h1>
              <p className="mt-2 max-w-xl text-sm leading-6 text-muted">{current.hint}</p>
            </div>
            <div className="flex items-center gap-2">
              {overview?.store && (
                <span className="badge border border-line bg-white text-muted">
                  <span className="dot bg-[#38a169]" />
                  {overview.store.status}
                </span>
              )}
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={() => loadTab(tab)}
                disabled={loading}
              >
                {loading ? 'Refreshing...' : 'Refresh'}
              </button>
            </div>
          </div>

          {error && (
            <div className="mb-4">
              <ErrorBox message={error} retry={() => loadTab(tab)} />
            </div>
          )}
          {notice && (
            <p role="status" className="mb-4 rounded-xl border border-[#bfe3d2] bg-[#eefaf3] px-4 py-3 text-sm text-[#256b47]">
              {notice}
            </p>
          )}

          {loading && !overview && tab === 'overview' ? (
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              {[0, 1, 2, 3].map((n) => (
                <Skeleton key={n} className="h-32" />
              ))}
            </div>
          ) : tab === 'overview' ? (
            <OverviewTab data={overview} onOpenOrder={openOrder} />
          ) : tab === 'floor' ? (
            <FloorTab
              data={overview}
              machines={overview?.machines || []}
              busy={busy}
              machinePick={machinePick}
              setMachinePick={setMachinePick}
              perform={perform}
              onOpenOrder={openOrder}
            />
          ) : tab === 'orders' ? (
            <OrdersTab
              rows={orders}
              query={orderQuery}
              setQuery={setOrderQuery}
              status={orderStatus}
              setStatus={setOrderStatus}
              onSearch={() => loadTab('orders', orderQuery)}
              onOpen={openOrder}
            />
          ) : tab === 'customers' ? (
            <CustomersTab
              rows={customers}
              query={customerQuery}
              setQuery={setCustomerQuery}
              onSearch={() => loadTab('customers', customerQuery)}
              onEdit={setEditingCustomer}
            />
          ) : tab === 'team' ? (
            <TeamTab
              rows={team}
              actorRole={user?.role || 'owner'}
              onAdd={() => setEditingTeam({ new: true })}
              onEdit={setEditingTeam}
              onToggle={(member) =>
                perform(`/admin/team/${member.id}`, { is_active: !member.active }, 'patch')
              }
              busy={busy}
            />
          ) : tab === 'catalogue' ? (
            <CatalogueTab
              services={services}
              machines={machines}
              busy={busy}
              onEditService={setEditingService}
              onAddService={() => setEditingService({ new: true })}
              onEditMachine={setEditingMachine}
              onAddMachine={() => setEditingMachine({ new: true })}
              onMachineStatus={(machine, status) =>
                perform(`/admin/machines/${machine.id}`, { status, reason: 'Updated from admin' }, 'patch')
              }
            />
          ) : tab === 'settings' ? (
            <SettingsTab
              data={settingsData}
              busy={busy}
              onSave={(body) => perform('/admin/settings', body, 'put')}
            />
          ) : tab === 'audit' ? (
            <AuditTab
              rows={audit}
              query={auditQuery}
              setQuery={setAuditQuery}
              onSearch={() => loadTab('audit', auditQuery)}
            />
          ) : (
            <PaymentsTab
              rows={payments}
              query={paymentQuery}
              setQuery={setPaymentQuery}
              kind={paymentKind}
              setKind={setPaymentKind}
              onSearch={() => loadTab('payments', paymentQuery)}
              onRefund={setRefundPayment}
            />
          )}
        </section>
      </div>

      {selectedOrder && (
        <OrderDialog
          order={selectedOrder}
          onClose={() => setSelectedOrder(null)}
          busy={busy}
          onAction={async (path, body) => {
            await perform(path, body, 'post', async () => {
              await openOrder(selectedOrder.id);
            });
          }}
        />
      )}

      {editingCustomer && (
        <CustomerDialog
          key={editingCustomer.id}
          customer={editingCustomer}
          busy={busy}
          onClose={() => setEditingCustomer(null)}
          onSave={async (body: any) => {
            await perform(`/admin/customers/${editingCustomer.id}`, body, 'patch');
            setEditingCustomer(null);
          }}
        />
      )}

      {editingTeam && (
        <TeamDialog
          key={editingTeam.id || 'new'}
          member={editingTeam}
          actorRole={user?.role || 'owner'}
          busy={busy}
          onClose={() => setEditingTeam(null)}
          onSave={async (body: any) => {
            if (editingTeam.new) {
              await perform('/admin/team', body, 'post');
            } else {
              await perform(`/admin/team/${editingTeam.id}`, body, 'patch');
            }
            setEditingTeam(null);
          }}
        />
      )}

      {editingService && (
        <ServiceDialog
          key={editingService.id || 'new-service'}
          service={editingService}
          busy={busy}
          onClose={() => setEditingService(null)}
          onSave={async (body: any) => {
            if (editingService.new) {
              await perform('/admin/services', body, 'post');
            } else {
              await perform(`/admin/services/${editingService.id}`, body, 'patch');
            }
            setEditingService(null);
          }}
        />
      )}

      {editingMachine && (
        <MachineDialog
          key={editingMachine.id || 'new-machine'}
          machine={editingMachine}
          busy={busy}
          onClose={() => setEditingMachine(null)}
          onSave={async (body: any) => {
            if (editingMachine.new) {
              await perform('/admin/machines', body, 'post');
            } else {
              await perform(`/admin/machines/${editingMachine.id}`, body, 'patch');
            }
            setEditingMachine(null);
          }}
        />
      )}

      {refundPayment && (
        <RefundDialog
          key={refundPayment.id}
          payment={refundPayment}
          busy={busy}
          onClose={() => setRefundPayment(null)}
          onSave={async (body: any) => {
            await perform(`/payments/${refundPayment.id}/refund`, body, 'post');
            setRefundPayment(null);
          }}
        />
      )}
    </div>
  );
}

function OverviewTab({ data, onOpenOrder }: { data: any; onOpenOrder: (id: string) => void }) {
  if (!data) return <Empty title="No overview yet" sub="Refresh to load the business snapshot." />;
  const stats = data.stats || {};
  const alerts = data.alerts || [];
  const queue = (data.live_queue || []).slice(0, 6);
  const machines = data.machines || [];
  const methods = Object.entries(data.payments_by_method || {});
  return (
    <div className="space-y-5">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="Collected today" value={kobo(stats.collected_kobo)} hint="Confirmed payments, net of refunds" tone="aqua" />
        <Stat label="Outstanding" value={kobo(stats.outstanding_kobo)} hint="Still to collect on open orders" tone="amber" />
        <Stat label="Orders today" value={stats.orders_today ?? 0} hint={`${stats.active_orders ?? 0} still active`} />
        <Stat label="Queue" value={stats.queue_units ?? 0} hint={`${stats.washers_available ?? 0} washers free`} tone="rose" />
      </div>

      {alerts.length > 0 && (
        <div className="grid gap-2 md:grid-cols-2">
          {alerts.slice(0, 4).map((alert: any, index: number) => (
            <div
              key={`${alert.title}-${index}`}
              className={`flex gap-3 rounded-2xl border p-4 ${
                alert.tone === 'danger'
                  ? 'border-[#e8c3bd] bg-[#fdf1ef]'
                  : 'border-[#ead9b8] bg-[#fdf7ea]'
              }`}
            >
              <AlertIcon className={`mt-0.5 h-5 w-5 shrink-0 ${alert.tone === 'danger' ? 'text-[#a44b3d]' : 'text-[#a87925]'}`} />
              <div>
                <p className="text-sm font-semibold text-ink">{alert.title}</p>
                <p className="mt-1 text-xs leading-5 text-muted">{alert.detail}</p>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="grid gap-4 xl:grid-cols-[1.45fr_1fr]">
        <div className="card">
          <div className="mb-3 flex items-center justify-between gap-3">
            <div>
              <p className="eyebrow">Live queue</p>
              <h2 className="mt-1 text-lg font-semibold text-ink">Who is washing now</h2>
            </div>
            <span className="badge bg-accent-soft text-accent">{queue.length} active</span>
          </div>
          {queue.length === 0 ? (
            <p className="py-6 text-sm text-muted">No active queue units yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="table-clean min-w-[520px]">
                <thead>
                  <tr>
                    <th>Unit</th>
                    <th>Customer</th>
                    <th>Machine</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {queue.map((row: any) => (
                    <tr key={row.id}>
                      <td className="font-semibold text-ink">{row.unit_no}</td>
                      <td>{row.customer}</td>
                      <td className="text-muted">{row.machine || '-'}</td>
                      <td><Badge status={row.status} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="card">
          <p className="eyebrow">Payments</p>
          <h2 className="mt-1 text-lg font-semibold text-ink">Today by method</h2>
          {methods.length === 0 ? (
            <p className="mt-4 text-sm text-muted">No confirmed payments yet today.</p>
          ) : (
            <div className="mt-4 space-y-3">
              {methods.map(([method, amount]) => (
                <div key={method} className="flex items-center justify-between gap-3 text-sm">
                  <span className="capitalize text-muted">{method.replaceAll('_', ' ')}</span>
                  <span className="font-semibold tabular-nums text-ink">{kobo(Number(amount))}</span>
                </div>
              ))}
            </div>
          )}
          <div className="mt-5 grid grid-cols-2 gap-2 border-t border-line pt-4 text-sm">
            <div>
              <p className="label">Customers</p>
              <p className="mt-1 font-semibold text-ink">{stats.customers_total ?? 0}</p>
            </div>
            <div>
              <p className="label">New today</p>
              <p className="mt-1 font-semibold text-ink">{stats.new_customers_today ?? 0}</p>
            </div>
            <div>
              <p className="label">Team active</p>
              <p className="mt-1 font-semibold text-ink">{stats.active_staff ?? 0}</p>
            </div>
            <div>
              <p className="label">Dryers free</p>
              <p className="mt-1 font-semibold text-ink">{stats.dryers_available ?? 0}</p>
            </div>
          </div>
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.25fr_1fr]">
        <div className="card">
          <div className="mb-3 flex items-center justify-between">
            <div>
              <p className="eyebrow">Orders</p>
              <h2 className="mt-1 text-lg font-semibold text-ink">Newest first</h2>
            </div>
            <span className="badge bg-accent-soft text-accent">{data.recent_orders?.length || 0}</span>
          </div>
          <div className="overflow-x-auto">
            <table className="table-clean min-w-[560px]">
              <thead>
                <tr>
                  <th>Order</th>
                  <th>Customer</th>
                  <th>Status</th>
                  <th className="text-right">Total</th>
                </tr>
              </thead>
              <tbody>
                {(data.recent_orders || []).map((order: any) => (
                  <tr key={order.id}>
                    <td>
                      <button className="font-semibold text-accent hover:underline" onClick={() => onOpenOrder(order.id)}>
                        #{order.order_no}
                      </button>
                    </td>
                    <td>{order.customer}</td>
                    <td><Badge status={order.status} /></td>
                    <td className="text-right font-semibold tabular-nums">{kobo(order.total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="card">
          <p className="eyebrow">Audit</p>
          <h2 className="mt-1 text-lg font-semibold text-ink">Recent activity</h2>
          <div className="mt-4 space-y-3">
            {(data.activity || []).slice(0, 7).map((row: any, index: number) => (
              <div key={`${row.action}-${index}`} className="flex gap-3">
                <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-accent" />
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-ink">{row.action.replaceAll('.', ' ')}</p>
                  <p className="truncate text-xs text-muted">{row.actor} · {row.entity}</p>
                  <p className="text-[11px] text-muted">{dateTime(row.at)}</p>
                </div>
              </div>
            ))}
            {(data.activity || []).length === 0 && <p className="text-sm text-muted">No activity yet.</p>}
          </div>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="card">
          <p className="eyebrow">Floor</p>
          <h2 className="mt-1 text-lg font-semibold text-ink">Machine health</h2>
          <div className="mt-4 grid grid-cols-4 gap-2 sm:grid-cols-6">
            {machines.map((machine: any) => (
              <div
                key={machine.id}
                className={`rounded-xl border p-2 text-center ${
                  machine.status === 'available'
                    ? 'border-[#c8e6d4] bg-[#f0faf4]'
                    : machine.status === 'running'
                      ? 'border-[#bfe4ec] bg-[#eef9fc]'
                      : 'border-[#e8c3bd] bg-[#fdf1ef]'
                }`}
                title={`${machine.label} · ${machine.status}`}
              >
                <p className="text-xs font-bold text-ink">{machine.label}</p>
                <p className="mt-1 text-[10px] uppercase tracking-wide text-muted">{machine.status}</p>
              </div>
            ))}
          </div>
        </div>
        <div className="card">
          <p className="eyebrow">Messages</p>
          <h2 className="mt-1 text-lg font-semibold text-ink">Latest notifications</h2>
          <div className="mt-4 space-y-3">
            {(data.notifications || []).slice(0, 5).map((row: any, index: number) => (
              <div key={`${row.template}-${index}`} className="flex items-center justify-between gap-3 text-sm">
                <div className="min-w-0">
                  <p className="truncate font-semibold text-ink">{row.customer}</p>
                  <p className="truncate text-xs text-muted">{row.template}</p>
                </div>
                <span className="badge bg-accent-soft text-accent">{row.status}</span>
              </div>
            ))}
            {(data.notifications || []).length === 0 && <p className="text-sm text-muted">No notifications yet.</p>}
          </div>
        </div>
      </div>
    </div>
  );
}

function FloorTab({
  data,
  machines,
  busy,
  machinePick,
  setMachinePick,
  perform,
  onOpenOrder,
}: {
  data: any;
  machines: any[];
  busy: string;
  machinePick: Record<string, string>;
  setMachinePick: (value: Record<string, string>) => void;
  perform: (path: string, body: unknown, method?: 'post' | 'patch' | 'put', after?: () => Promise<void> | void) => Promise<void>;
  onOpenOrder: (id: string) => void;
}) {
  const queue = data?.live_queue || [];
  const washers = machines.filter((m) => m.kind === 'washer' && m.status === 'available');
  const dryers = machines.filter((m) => m.kind === 'dryer' && m.status === 'available');
  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="Active units" value={queue.length} hint="Queued, washing, drying, or ready" tone="aqua" />
        <Stat label="Washers free" value={washers.length} hint="Ready for the next load" />
        <Stat label="Dryers free" value={dryers.length} hint="Ready for the next load" tone="amber" />
        <Stat label="Store" value={data?.store?.status || 'open'} hint={`${data?.store?.queue_opens_at || '-'} to ${data?.store?.queue_closes_at || '-'}`} tone="rose" />
      </div>

      <div className="card">
        <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="eyebrow">Queue control</p>
            <h2 className="mt-1 text-lg font-semibold text-ink">Move the day forward</h2>
            <p className="mt-1 text-xs text-muted">
              Pick a free machine or let the console use the first one. Every action is audited.
            </p>
          </div>
          <span className="badge bg-accent-soft text-accent">{queue.length} in view</span>
        </div>
        {queue.length === 0 ? (
          <Empty title="The floor is clear" sub="New queue units will appear here as soon as they are booked." />
        ) : (
          <div className="overflow-x-auto">
            <table className="table-clean min-w-[900px]">
              <thead>
                <tr>
                  <th>Unit</th>
                  <th>Customer</th>
                  <th>Order</th>
                  <th>Machine</th>
                  <th>Status</th>
                  <th>Est. start</th>
                  <th className="text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {queue.map((row: any) => {
                  const washerPath = `/wash-units/${row.id}/start`;
                  const dryerPath = `/wash-units/${row.id}/start-dry`;
                  const canStart = row.status === 'queued' || row.status === 'grace';
                  const canDry = row.status === 'wash_done';
                  const canReady = row.status === 'drying';
                  const canCollect = row.status === 'ready';
                  return (
                    <tr key={row.id}>
                      <td className="font-semibold text-ink">{row.unit_no}</td>
                      <td>{row.customer}</td>
                      <td>
                        {row.order_no ? (
                          <button className="text-accent hover:underline" onClick={() => onOpenOrder(row.order_id)}>
                            #{row.order_no}
                          </button>
                        ) : (
                          '-'
                        )}
                      </td>
                      <td className="text-muted">{row.machine || '-'}</td>
                      <td><Badge status={row.status} /></td>
                      <td className="tabular-nums">{fmtTime(row.est_start)}</td>
                      <td>
                        <div className="flex flex-wrap justify-end gap-1.5">
                          {canStart && (
                            <>
                              <select
                                className="rounded-lg border border-line bg-white px-2 py-1.5 text-xs"
                                value={machinePick[row.id] || ''}
                                onChange={(event) =>
                                  setMachinePick({ ...machinePick, [row.id]: event.target.value })
                                }
                                aria-label={`Washer for ${row.unit_no}`}
                              >
                                <option value="">Auto</option>
                                {washers.map((m) => (
                                  <option key={m.id} value={m.id}>{m.label}</option>
                                ))}
                              </select>
                              <button
                                className="btn btn-sm !px-3 !py-1.5 !text-xs"
                                disabled={Boolean(busy) || washers.length === 0}
                                onClick={() => perform(washerPath, { machine_id: machinePick[row.id] || washers[0]?.id })}
                              >
                                Start
                              </button>
                            </>
                          )}
                          {canDry && (
                            <>
                              <select
                                className="rounded-lg border border-line bg-white px-2 py-1.5 text-xs"
                                value={machinePick[row.id] || ''}
                                onChange={(event) =>
                                  setMachinePick({ ...machinePick, [row.id]: event.target.value })
                                }
                                aria-label={`Dryer for ${row.unit_no}`}
                              >
                                <option value="">Auto</option>
                                {dryers.map((m) => (
                                  <option key={m.id} value={m.id}>{m.label}</option>
                                ))}
                              </select>
                              <button
                                className="btn btn-sm !px-3 !py-1.5 !text-xs"
                                disabled={Boolean(busy) || dryers.length === 0}
                                onClick={() => perform(dryerPath, { machine_id: machinePick[row.id] || dryers[0]?.id })}
                              >
                                Dry
                              </button>
                            </>
                          )}
                          {canReady && (
                            <button
                              className="btn btn-ghost btn-sm !px-3 !py-1.5 !text-xs"
                              disabled={Boolean(busy)}
                              onClick={() => perform(`/wash-units/${row.id}/dry-complete`, {})}
                            >
                              Ready
                            </button>
                          )}
                          {canCollect && (
                            <button
                              className="btn btn-ghost btn-sm !px-3 !py-1.5 !text-xs"
                              disabled={Boolean(busy)}
                              onClick={() => perform(`/wash-units/${row.id}/collect`, {})}
                            >
                              Collect
                            </button>
                          )}
                          {canStart && (
                            <button
                              className="btn btn-ghost btn-sm !px-3 !py-1.5 !text-xs"
                              disabled={Boolean(busy)}
                              onClick={() => {
                                if (window.confirm(`Move ${row.unit_no} to the back of the queue?`)) {
                                  perform(`/wash-units/${row.id}/skip`, { reason: 'Moved by admin' });
                                }
                              }}
                            >
                              Skip
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {machines.map((machine: any) => (
          <div key={machine.id} className="card">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-ink">{machine.label}</p>
                <p className="mt-1 text-xs uppercase tracking-wide text-muted">{machine.kind}</p>
              </div>
              <Badge status={machine.status} />
            </div>
            <p className="mt-3 text-xs leading-5 text-muted">
              {machine.current_customer
                ? `${machine.current_customer} · ${machine.current_unit}`
                : 'No active load'}
            </p>
            <p className="mt-1 text-xs text-muted">
              {machine.busy_until ? `Busy until ${fmtTime(machine.busy_until)}` : 'Ready now'}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}

function OrdersTab({
  rows,
  query,
  setQuery,
  status,
  setStatus,
  onSearch,
  onOpen,
}: {
  rows: any[];
  query: string;
  setQuery: (value: string) => void;
  status: string;
  setStatus: (value: string) => void;
  onSearch: () => void;
  onOpen: (id: string) => void;
}) {
  const shown = useMemo(
    () => rows.filter((row) => !status || row.status === status),
    [rows, status],
  );
  return (
    <div className="space-y-4">
      <div className="card">
        <div className="flex flex-col gap-2 sm:flex-row">
          <div className="relative flex-1">
            <SearchIcon className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
            <input
              className="input pl-10"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              onKeyDown={(event) => event.key === 'Enter' && onSearch()}
              placeholder="Search order number, name, phone, or email"
            />
          </div>
          <select className="input sm:w-52" value={status} onChange={(event) => setStatus(event.target.value)}>
            <option value="">All statuses</option>
            {ORDER_STATUSES.map((item) => (
              <option key={item} value={item}>{item.replaceAll('_', ' ')}</option>
            ))}
          </select>
          <button className="btn" onClick={onSearch}>Search</button>
        </div>
      </div>

      {shown.length === 0 ? (
        <Empty title="No orders found" sub="Try a different search or status filter." />
      ) : (
        <div className="card !p-0 overflow-x-auto">
          <table className="table-clean min-w-[860px]">
            <thead>
              <tr>
                <th className="pl-5">Order</th>
                <th>Customer</th>
                <th>Channel</th>
                <th>Status</th>
                <th>Payment</th>
                <th className="text-right">Total</th>
                <th className="text-right">Balance</th>
                <th className="text-right pr-5">Created</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((row) => (
                <tr key={row.id} className="cursor-pointer hover:bg-accent-soft/40" onClick={() => onOpen(row.id)}>
                  <td className="pl-5 font-semibold text-accent">#{row.order_no}</td>
                  <td>
                    <p className="font-semibold text-ink">{row.customer}</p>
                    <p className="text-xs text-muted">{row.phone || row.email || '-'}</p>
                  </td>
                  <td className="capitalize text-muted">{row.channel.replaceAll('_', ' ')}</td>
                  <td><Badge status={row.status} /></td>
                  <td><Badge status={row.payment_status} /></td>
                  <td className="text-right font-semibold tabular-nums">{kobo(row.total)}</td>
                  <td className="text-right tabular-nums">{kobo(row.balance)}</td>
                  <td className="text-right pr-5 text-xs text-muted">{dateTime(row.created_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function CustomersTab({
  rows,
  query,
  setQuery,
  onSearch,
  onEdit,
}: {
  rows: any[];
  query: string;
  setQuery: (value: string) => void;
  onSearch: () => void;
  onEdit: (customer: any) => void;
}) {
  return (
    <div className="space-y-4">
      <div className="card">
        <div className="flex flex-col gap-2 sm:flex-row">
          <div className="relative flex-1">
            <SearchIcon className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
            <input
              className="input pl-10"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              onKeyDown={(event) => event.key === 'Enter' && onSearch()}
              placeholder="Search name, phone, email, or customer code"
            />
          </div>
          <button className="btn" onClick={onSearch}>Search</button>
        </div>
      </div>

      {rows.length === 0 ? (
        <Empty title="No customers found" sub="Try another search, or register a customer at the counter." />
      ) : (
        <div className="card !p-0 overflow-x-auto">
          <table className="table-clean min-w-[780px]">
            <thead>
              <tr>
                <th className="pl-5">Customer</th>
                <th>Contact</th>
                <th>Segment</th>
                <th className="text-right">Orders</th>
                <th className="text-right">Spend</th>
                <th>Last order</th>
                <th className="text-right pr-5">Action</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id}>
                  <td className="pl-5">
                    <p className="font-semibold text-ink">{row.name}</p>
                    <p className="text-xs text-muted">{row.customer_code}</p>
                  </td>
                  <td>
                    <p className="text-sm">{row.phone || '-'}</p>
                    <p className="text-xs text-muted">{row.email || 'No email'}</p>
                  </td>
                  <td><span className="badge bg-accent-soft capitalize text-accent">{row.segment}</span></td>
                  <td className="text-right tabular-nums">{row.orders}</td>
                  <td className="text-right font-semibold tabular-nums">{kobo(row.spend)}</td>
                  <td className="text-xs text-muted">{row.last_order_at ? dateOnly(row.last_order_at) : 'Never'}</td>
                  <td className="text-right pr-5">
                    <button className="btn btn-ghost btn-sm" onClick={() => onEdit(row)}>Edit</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function TeamTab({
  rows,
  actorRole,
  onAdd,
  onEdit,
  onToggle,
  busy,
}: {
  rows: any[];
  actorRole: string;
  onAdd: () => void;
  onEdit: (member: any) => void;
  onToggle: (member: any) => void;
  busy: string;
}) {
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted">
          {rows.filter((row) => row.active).length} active accounts. Owners can manage staff, managers, and other owners.
        </p>
        <button className="btn" onClick={onAdd}>Add team member</button>
      </div>
      {rows.length === 0 ? (
        <Empty title="No team members yet" sub="Add the first manager or staff account." />
      ) : (
        <div className="card !p-0 overflow-x-auto">
          <table className="table-clean min-w-[760px]">
            <thead>
              <tr>
                <th className="pl-5">Name</th>
                <th>Email</th>
                <th>Role</th>
                <th>Status</th>
                <th>PIN</th>
                <th className="text-right pr-5">Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id}>
                  <td className="pl-5 font-semibold text-ink">{row.name || 'Team member'}</td>
                  <td className="text-muted">{row.email}</td>
                  <td>
                    <span className="badge bg-accent-soft capitalize text-accent">
                      {row.role.replaceAll('_', ' ')}
                    </span>
                  </td>
                  <td>
                    <span className={`badge ${row.active ? 'bg-[#e5f5e9] text-[#2d6b43]' : 'bg-[#f4e7e5] text-[#8e4338]'}`}>
                      {row.active ? 'Active' : 'Paused'}
                    </span>
                  </td>
                  <td className="text-muted">{row.has_pin ? 'Set' : 'None'}</td>
                  <td className="text-right pr-5">
                    <div className="flex justify-end gap-1.5">
                      <button className="btn btn-ghost btn-sm" onClick={() => onEdit(row)}>Edit</button>
                      <button
                        className="btn btn-ghost btn-sm"
                        disabled={Boolean(busy)}
                        onClick={() => onToggle(row)}
                      >
                        {row.active ? 'Pause' : 'Activate'}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="text-xs text-muted">
        Signed in as {actorRole.replaceAll('_', ' ')}. Passwords and PINs are hashed and never shown.
      </p>
    </div>
  );
}

function CatalogueTab({
  services,
  machines,
  busy,
  onEditService,
  onAddService,
  onEditMachine,
  onAddMachine,
  onMachineStatus,
}: {
  services: any[];
  machines: any[];
  busy: string;
  onEditService: (service: any) => void;
  onAddService: () => void;
  onEditMachine: (machine: any) => void;
  onAddMachine: () => void;
  onMachineStatus: (machine: any, status: string) => void;
}) {
  return (
    <div className="space-y-5">
      <div className="card !p-0 overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-5 py-4">
          <div>
            <p className="eyebrow">Services</p>
            <h2 className="mt-1 text-lg font-semibold text-ink">Prices and availability</h2>
          </div>
          <button className="btn btn-ghost btn-sm" onClick={onAddService}>Add service</button>
        </div>
        <div className="overflow-x-auto">
          <table className="table-clean min-w-[620px]">
            <thead>
              <tr>
                <th className="pl-5">Service</th>
                <th>Kind</th>
                <th>Status</th>
                <th className="text-right">Price</th>
                <th className="text-right pr-5">Action</th>
              </tr>
            </thead>
            <tbody>
              {services.map((service) => (
                <tr key={service.id}>
                  <td className="pl-5 font-semibold text-ink">{service.name}</td>
                  <td className="capitalize text-muted">{service.kind.replaceAll('_', ' ')}</td>
                  <td>
                    <span className={`badge ${service.is_active ? 'bg-[#e5f5e9] text-[#2d6b43]' : 'bg-[#f4e7e5] text-[#8e4338]'}`}>
                      {service.is_active ? 'Active' : 'Hidden'}
                    </span>
                  </td>
                  <td className="text-right font-semibold tabular-nums">{kobo(service.unit_price)}</td>
                  <td className="text-right pr-5">
                    <button className="btn btn-ghost btn-sm" onClick={() => onEditService(service)}>Edit</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="card !p-0 overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-5 py-4">
          <div>
            <p className="eyebrow">Machines</p>
            <h2 className="mt-1 text-lg font-semibold text-ink">The floor roster</h2>
          </div>
          <button className="btn btn-ghost btn-sm" onClick={onAddMachine}>Add machine</button>
        </div>
        <div className="grid gap-3 p-4 sm:grid-cols-2 xl:grid-cols-3">
          {machines.map((machine) => (
            <div key={machine.id} className="rounded-2xl border border-line bg-white p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-semibold text-ink">{machine.label}</p>
                  <p className="text-xs uppercase tracking-wide text-muted">{machine.kind}</p>
                </div>
                <Badge status={machine.status} />
              </div>
              <p className="mt-3 text-xs text-muted">
                {machine.current_customer ? `${machine.current_customer} · ${machine.current_unit}` : 'No active load'}
              </p>
              <div className="mt-3 flex gap-2">
                <select
                  className="input !py-2 !text-xs"
                  value={machine.status}
                  disabled={Boolean(busy)}
                  onChange={(event) => onMachineStatus(machine, event.target.value)}
                >
                  <option value="available">Available</option>
                  <option value="running">Running</option>
                  <option value="maintenance">Maintenance</option>
                  <option value="error">Error</option>
                </select>
                <button className="btn btn-ghost btn-sm shrink-0" onClick={() => onEditMachine(machine)}>
                  Edit
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function SettingsTab({
  data,
  busy,
  onSave,
}: {
  data: any;
  busy: string;
  onSave: (body: any) => void;
}) {
  const [form, setForm] = useState<any>({
    settings: {},
    day: {},
  });
  useEffect(() => {
    if (data) setForm({ settings: { ...data.settings }, day: { ...data.day } });
  }, [data]);

  if (!data) return <Empty title="Settings are not loaded" sub="Refresh to try again." />;
  const setSetting = (key: string, value: string) =>
    setForm((current: any) => ({
      ...current,
      settings: { ...current.settings, [key]: value === '' ? '' : Number(value) },
    }));
  const setDay = (key: string, value: any) =>
    setForm((current: any) => ({ ...current, day: { ...current.day, [key]: value } }));

  return (
    <div className="space-y-4">
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="card">
          <p className="eyebrow">Business rules</p>
          <h2 className="mt-1 text-lg font-semibold text-ink">Cycle timing and pricing</h2>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <NumberField label="Wash minutes" value={form.settings.wash_minutes} onChange={(v) => setSetting('wash_minutes', v)} />
            <NumberField label="Dry minutes" value={form.settings.dry_minutes} onChange={(v) => setSetting('dry_minutes', v)} />
            <NumberField label="Grace minutes" value={form.settings.grace_minutes} onChange={(v) => setSetting('grace_minutes', v)} />
            <NumberField label="Max wait minutes" value={form.settings.max_wait_minutes} onChange={(v) => setSetting('max_wait_minutes', v)} />
            <NumberField label="Wash price (kobo)" value={form.settings.wash_price_kobo} onChange={(v) => setSetting('wash_price_kobo', v)} />
            <NumberField label="Order number start" value={form.settings.order_no_start} onChange={(v) => setSetting('order_no_start', v)} />
          </div>
          <p className="mt-3 text-xs leading-5 text-muted">
            Money is stored in kobo. 400000 kobo is 4,000 naira.
          </p>
        </div>

        <div className="card">
          <p className="eyebrow">Today</p>
          <h2 className="mt-1 text-lg font-semibold text-ink">Opening controls</h2>
          <div className="mt-4 space-y-3">
            <Toggle
              label="Accepting self-service bookings"
              checked={Boolean(form.day.accepting_bookings)}
              onChange={(value) => setDay('accepting_bookings', value)}
            />
            <Toggle
              label="Drop-off is open"
              checked={Boolean(form.day.dropoff_open)}
              onChange={(value) => setDay('dropoff_open', value)}
            />
            <div className="grid gap-3 sm:grid-cols-2">
              <NumberField label="Drop-off capacity" value={form.day.dropoff_capacity} onChange={(v) => setDay('dropoff_capacity', v === '' ? '' : Number(v))} />
              <div>
                <label className="label mb-1.5 block">Queue opens</label>
                <input className="input" type="time" value={form.day.queue_opens_at || ''} onChange={(event) => setDay('queue_opens_at', event.target.value)} />
              </div>
              <div>
                <label className="label mb-1.5 block">Queue closes</label>
                <input className="input" type="time" value={form.day.queue_closes_at || ''} onChange={(event) => setDay('queue_closes_at', event.target.value)} />
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-line bg-white p-4">
        <p className="text-xs leading-5 text-muted">
          Changes apply to new queue calculations. Existing washes keep their current timing.
        </p>
        <button className="btn" disabled={Boolean(busy)} onClick={() => onSave(form)}>
          {busy ? 'Saving...' : 'Save settings'}
        </button>
      </div>
    </div>
  );
}

function AuditTab({
  rows,
  query,
  setQuery,
  onSearch,
}: {
  rows: any[];
  query: string;
  setQuery: (value: string) => void;
  onSearch: () => void;
}) {
  return (
    <div className="space-y-4">
      <div className="card">
        <div className="flex flex-col gap-2 sm:flex-row">
          <div className="relative flex-1">
            <SearchIcon className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
            <input
              className="input pl-10"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              onKeyDown={(event) => event.key === 'Enter' && onSearch()}
              placeholder="Filter by action, for example order.cancel"
            />
          </div>
          <button className="btn" onClick={onSearch}>Filter</button>
        </div>
      </div>
      {rows.length === 0 ? (
        <Empty title="No audit entries" sub="Sensitive actions will appear here as the team works." />
      ) : (
        <div className="card !p-0 overflow-x-auto">
          <table className="table-clean min-w-[820px]">
            <thead>
              <tr>
                <th className="pl-5">When</th>
                <th>Actor</th>
                <th>Action</th>
                <th>Entity</th>
                <th>Reason</th>
                <th className="text-right pr-5">IP</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id}>
                  <td className="pl-5 whitespace-nowrap text-xs text-muted">{dateTime(row.at)}</td>
                  <td className="text-sm">{row.actor}</td>
                  <td className="font-semibold text-ink">{row.action}</td>
                  <td className="text-xs text-muted">{row.entity || '-'}</td>
                  <td className="max-w-[240px] truncate text-xs text-muted">{row.reason || '-'}</td>
                  <td className="text-right pr-5 text-xs text-muted">{row.ip || '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function PaymentsTab({
  rows,
  query,
  setQuery,
  kind,
  setKind,
  onSearch,
  onRefund,
}: {
  rows: any[];
  query: string;
  setQuery: (value: string) => void;
  kind: string;
  setKind: (value: string) => void;
  onSearch: () => void;
  onRefund: (payment: any) => void;
}) {
  const shown = useMemo(() => rows.filter((row) => !kind || row.kind === kind), [rows, kind]);
  return (
    <div className="space-y-4">
      <div className="card">
        <div className="flex flex-col gap-2 sm:flex-row">
          <div className="relative flex-1">
            <SearchIcon className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
            <input
              className="input pl-10"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              onKeyDown={(event) => event.key === 'Enter' && onSearch()}
              placeholder="Search order, customer, method, or Paystack reference"
            />
          </div>
          <select className="input sm:w-44" value={kind} onChange={(event) => setKind(event.target.value)}>
            <option value="">All entries</option>
            <option value="payment">Payments</option>
            <option value="refund">Refunds</option>
          </select>
          <button className="btn" onClick={onSearch}>Search</button>
        </div>
      </div>

      {shown.length === 0 ? (
        <Empty title="No payments found" sub="Cash, transfer, and card entries will appear here." />
      ) : (
        <div className="card !p-0 overflow-x-auto">
          <table className="table-clean min-w-[820px]">
            <thead>
              <tr>
                <th className="pl-5">When</th>
                <th>Order</th>
                <th>Customer</th>
                <th>Method</th>
                <th>Kind</th>
                <th className="text-right">Amount</th>
                <th className="text-right pr-5">Action</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((row) => (
                <tr key={row.id}>
                  <td className="pl-5 whitespace-nowrap text-xs text-muted">{dateTime(row.paid_at)}</td>
                  <td className="font-semibold text-accent">#{row.order_no || '-'}</td>
                  <td>{row.customer}</td>
                  <td className="capitalize text-muted">{row.method.replaceAll('_', ' ')}</td>
                  <td><span className={`badge ${row.kind === 'refund' ? 'bg-[#f4e7e5] text-[#8e4338]' : 'bg-[#e5f5e9] text-[#2d6b43]'}`}>{row.kind}</span></td>
                  <td className="text-right font-semibold tabular-nums">{kobo(row.amount)}</td>
                  <td className="text-right pr-5">
                    {row.kind === 'payment' && row.status === 'confirmed' ? (
                      <button className="btn btn-ghost btn-sm" onClick={() => onRefund(row)}>Refund</button>
                    ) : (
                      <span className="text-xs text-muted">{row.status}</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function OrderDialog({
  order,
  onClose,
  busy,
  onAction,
}: {
  order: any;
  onClose: () => void;
  busy: string;
  onAction: (path: string, body: any) => Promise<void>;
}) {
  const canCancel = !['collected', 'cancelled', 'expired'].includes(order.status);
  return (
    <Dialog title={`Order #${order.order_no}`} onClose={onClose}>
      <div className="grid gap-3 sm:grid-cols-2">
        <Info label="Customer" value={order.customer_detail?.name || order.customer} />
        <Info label="Contact" value={order.customer_detail?.phone || order.phone || '-'} />
        <Info label="Email" value={order.customer_detail?.email || order.email || '-'} />
        <Info label="Channel" value={order.channel?.replaceAll('_', ' ')} />
        <Info label="Status" value={<Badge status={order.status} />} />
        <Info label="Payment" value={<Badge status={order.payment_status} />} />
        <Info label="Total" value={kobo(order.total)} />
        <Info label="Balance" value={kobo(order.balance)} />
      </div>

      <div className="mt-5">
        <p className="label mb-2">Items</p>
        <div className="space-y-1.5">
          {(order.items || []).map((item: any, index: number) => (
            <div key={index} className="flex justify-between gap-3 rounded-lg bg-accent-soft/50 px-3 py-2 text-sm">
              <span>{item.name} × {item.qty}</span>
              <span className="font-semibold tabular-nums">{kobo(item.line_total)}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="mt-5">
        <p className="label mb-2">Wash units</p>
        <div className="space-y-1.5">
          {(order.units_detail || []).map((unit: any) => (
            <div key={unit.id} className="flex items-center justify-between gap-3 rounded-lg border border-line px-3 py-2 text-sm">
              <span className="font-semibold">{unit.unit_no}</span>
              <span className="text-xs text-muted">{unit.machine || 'No machine'}</span>
              <Badge status={unit.status} />
            </div>
          ))}
          {(order.units_detail || []).length === 0 && <p className="text-sm text-muted">No queue units yet.</p>}
        </div>
      </div>

      <div className="mt-5">
        <p className="label mb-2">Payments</p>
        <div className="space-y-1.5">
          {(order.payments || []).map((payment: any) => (
            <div key={payment.id} className="flex items-center justify-between gap-3 rounded-lg border border-line px-3 py-2 text-sm">
              <span className="capitalize">{payment.method.replaceAll('_', ' ')}</span>
              <span className={`text-xs ${payment.kind === 'refund' ? 'text-[#8e4338]' : 'text-[#2d6b43]'}`}>{payment.kind}</span>
              <span className="font-semibold tabular-nums">{kobo(payment.amount)}</span>
            </div>
          ))}
          {(order.payments || []).length === 0 && <p className="text-sm text-muted">No payments recorded.</p>}
        </div>
      </div>

      <div className="mt-6 flex flex-wrap justify-end gap-2">
        {order.status === 'booked' && (
          <button
            className="btn btn-ghost btn-sm"
            disabled={Boolean(busy)}
            onClick={() => onAction(`/orders/${order.id}/check-in`, {})}
          >
            Check in
          </button>
        )}
        {order.balance > 0 && order.status !== 'cancelled' && (
          <button
            className="btn btn-sm"
            disabled={Boolean(busy)}
            onClick={() => {
              if (window.confirm(`Record the remaining ${kobo(order.balance)} as cash?`)) {
                onAction(`/orders/${order.id}/payments`, { method: 'cash', amount: order.balance });
              }
            }}
          >
            Record cash balance
          </button>
        )}
        {canCancel && (
          <button
            className="btn btn-ghost btn-sm !border-[#e0b9b3] !text-[#8e4338]"
            disabled={Boolean(busy)}
            onClick={() => {
              if (window.confirm(`Cancel order #${order.order_no}? This cannot be undone.`)) {
                onAction(`/orders/${order.id}/cancel`, {});
              }
            }}
          >
            Cancel order
          </button>
        )}
        <button className="btn btn-ghost btn-sm" onClick={onClose}>Close</button>
      </div>
    </Dialog>
  );
}

function CustomerDialog({
  customer,
  busy,
  onClose,
  onSave,
}: {
  customer: any;
  busy: string;
  onClose: () => void;
  onSave: (body: any) => void;
}) {
  const [form, setForm] = useState({
    first_name: customer.first_name || '',
    last_name: customer.last_name || '',
    preferred_name: customer.preferred_name || '',
    phone: customer.phone || '',
    email: customer.email || '',
    segment: customer.segment || 'new',
  });
  return (
    <Dialog title="Edit customer" onClose={onClose}>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="First name" value={form.first_name} onChange={(v) => setForm({ ...form, first_name: v })} />
        <Field label="Last name" value={form.last_name} onChange={(v) => setForm({ ...form, last_name: v })} />
        <Field label="Display name" value={form.preferred_name} onChange={(v) => setForm({ ...form, preferred_name: v })} />
        <Field label="Phone" value={form.phone} onChange={(v) => setForm({ ...form, phone: v })} />
        <Field label="Email" value={form.email} onChange={(v) => setForm({ ...form, email: v })} />
        <div>
          <label className="label mb-1.5 block">Segment</label>
          <select className="input" value={form.segment} onChange={(event) => setForm({ ...form, segment: event.target.value })}>
            <option value="new">New</option>
            <option value="regular">Regular</option>
            <option value="vip">VIP</option>
            <option value="inactive">Inactive</option>
          </select>
        </div>
      </div>
      <div className="mt-6 flex justify-end gap-2">
        <button className="btn btn-ghost btn-sm" onClick={onClose}>Cancel</button>
        <button className="btn btn-sm" disabled={Boolean(busy)} onClick={() => onSave(form)}>
          {busy ? 'Saving...' : 'Save customer'}
        </button>
      </div>
    </Dialog>
  );
}

function TeamDialog({
  member,
  actorRole,
  busy,
  onClose,
  onSave,
}: {
  member: any;
  actorRole: string;
  busy: string;
  onClose: () => void;
  onSave: (body: any) => void;
}) {
  const isNew = Boolean(member.new);
  const [form, setForm] = useState({
    name: member.name || '',
    email: member.email || '',
    role: member.role || 'staff',
    password: '',
    pin: '',
    is_active: member.active ?? true,
  });
  const roles = ['staff', 'manager', 'owner'];
  if (actorRole === 'super_admin') roles.push('super_admin');
  return (
    <Dialog title={isNew ? 'Add team member' : `Edit ${member.name || member.email}`} onClose={onClose}>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Name" value={form.name} onChange={(v) => setForm({ ...form, name: v })} />
        <Field label="Email" value={form.email} onChange={(v) => setForm({ ...form, email: v })} disabled={!isNew} />
        <div>
          <label className="label mb-1.5 block">Role</label>
          <select className="input" value={form.role} onChange={(event) => setForm({ ...form, role: event.target.value })} disabled={!isNew && member.id === member.self}>
            {roles.map((role) => <option key={role} value={role}>{role.replaceAll('_', ' ')}</option>)}
          </select>
        </div>
        <Field
          label={isNew ? 'Initial password' : 'New password (optional)'}
          value={form.password}
          onChange={(v) => setForm({ ...form, password: v })}
          type="password"
        />
        <Field
          label={isNew ? 'Manager PIN (optional)' : 'New PIN (optional)'}
          value={form.pin}
          onChange={(v) => setForm({ ...form, pin: v })}
          type="password"
        />
        {!isNew && (
          <div className="flex items-center gap-2 pt-6">
            <input
              id="team-active"
              type="checkbox"
              checked={form.is_active}
              onChange={(event) => setForm({ ...form, is_active: event.target.checked })}
              className="h-4 w-4 rounded border-line text-accent"
            />
            <label htmlFor="team-active" className="text-sm text-ink">Account is active</label>
          </div>
        )}
      </div>
      <div className="mt-6 flex justify-end gap-2">
        <button className="btn btn-ghost btn-sm" onClick={onClose}>Cancel</button>
        <button
          className="btn btn-sm"
          disabled={Boolean(busy)}
          onClick={() => {
            const body: any = {
              name: form.name,
              role: form.role,
              is_active: form.is_active,
              password: form.password || undefined,
              pin: form.pin || undefined,
            };
            if (isNew) body.email = form.email;
            onSave(body);
          }}
        >
          {busy ? 'Saving...' : isNew ? 'Create account' : 'Save member'}
        </button>
      </div>
    </Dialog>
  );
}

function ServiceDialog({
  service,
  busy,
  onClose,
  onSave,
}: {
  service: any;
  busy: string;
  onClose: () => void;
  onSave: (body: any) => void;
}) {
  const isNew = Boolean(service.new);
  const [form, setForm] = useState({
    name: service.name || '',
    kind: service.kind || 'retail',
    price: service.unit_price != null ? String(service.unit_price / 100) : '',
    is_active: service.is_active ?? true,
  });
  return (
    <Dialog title={isNew ? 'Add service' : `Edit ${service.name}`} onClose={onClose}>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Service name" value={form.name} onChange={(v) => setForm({ ...form, name: v })} />
        <div>
          <label className="label mb-1.5 block">Kind</label>
          <select className="input" value={form.kind} onChange={(event) => setForm({ ...form, kind: event.target.value })}>
            <option value="self_service_wash">Self-service wash</option>
            <option value="dropoff_wash">Drop-off wash</option>
            <option value="retail">Retail</option>
            <option value="drink">Drink</option>
            <option value="coffee">Coffee</option>
          </select>
        </div>
        <Field label="Price in naira" value={form.price} onChange={(v) => setForm({ ...form, price: v })} type="number" />
        <div className="flex items-center gap-2 pt-6">
          <input
            id="service-active"
            type="checkbox"
            checked={form.is_active}
            onChange={(event) => setForm({ ...form, is_active: event.target.checked })}
            className="h-4 w-4 rounded border-line text-accent"
          />
          <label htmlFor="service-active" className="text-sm text-ink">Visible to customers</label>
        </div>
      </div>
      <div className="mt-6 flex justify-end gap-2">
        <button className="btn btn-ghost btn-sm" onClick={onClose}>Cancel</button>
        <button
          className="btn btn-sm"
          disabled={Boolean(busy)}
          onClick={() =>
            onSave({
              name: form.name,
              kind: form.kind,
              unit_price: Math.round(Number(form.price || 0) * 100),
              is_active: form.is_active,
            })
          }
        >
          {busy ? 'Saving...' : 'Save service'}
        </button>
      </div>
    </Dialog>
  );
}

function MachineDialog({
  machine,
  busy,
  onClose,
  onSave,
}: {
  machine: any;
  busy: string;
  onClose: () => void;
  onSave: (body: any) => void;
}) {
  const isNew = Boolean(machine.new);
  const [form, setForm] = useState({
    label: machine.label || '',
    kind: machine.kind || 'washer',
    status: machine.status || 'available',
  });
  return (
    <Dialog title={isNew ? 'Add machine' : `Edit ${machine.label}`} onClose={onClose}>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Label" value={form.label} onChange={(v) => setForm({ ...form, label: v })} />
        <div>
          <label className="label mb-1.5 block">Kind</label>
          <select className="input" value={form.kind} onChange={(event) => setForm({ ...form, kind: event.target.value })}>
            <option value="washer">Washer</option>
            <option value="dryer">Dryer</option>
          </select>
        </div>
        <div>
          <label className="label mb-1.5 block">Status</label>
          <select className="input" value={form.status} onChange={(event) => setForm({ ...form, status: event.target.value })}>
            <option value="available">Available</option>
            <option value="running">Running</option>
            <option value="maintenance">Maintenance</option>
            <option value="error">Error</option>
          </select>
        </div>
      </div>
      <div className="mt-6 flex justify-end gap-2">
        <button className="btn btn-ghost btn-sm" onClick={onClose}>Cancel</button>
        <button className="btn btn-sm" disabled={Boolean(busy)} onClick={() => onSave(form)}>
          {busy ? 'Saving...' : 'Save machine'}
        </button>
      </div>
    </Dialog>
  );
}

function RefundDialog({
  payment,
  busy,
  onClose,
  onSave,
}: {
  payment: any;
  busy: string;
  onClose: () => void;
  onSave: (body: any) => void;
}) {
  const [amount, setAmount] = useState(String(payment.amount / 100));
  const [reason, setReason] = useState('');
  return (
    <Dialog title={`Refund order #${payment.order_no}`} onClose={onClose}>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Refund amount in naira" value={amount} onChange={setAmount} type="number" />
        <div>
          <label className="label mb-1.5 block">Reason</label>
          <input className="input" value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Optional note for the audit trail" />
        </div>
      </div>
      <p className="mt-3 text-xs leading-5 text-muted">
        The original payment was {kobo(payment.amount)} via {payment.method?.replaceAll('_', ' ')}.
      </p>
      <div className="mt-6 flex justify-end gap-2">
        <button className="btn btn-ghost btn-sm" onClick={onClose}>Cancel</button>
        <button
          className="btn btn-sm"
          disabled={Boolean(busy)}
          onClick={() => onSave({ amount: Math.round(Number(amount || 0) * 100), reason })}
        >
          {busy ? 'Refunding...' : 'Record refund'}
        </button>
      </div>
    </Dialog>
  );
}

function Dialog({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-ink/45 p-3 sm:items-center sm:p-6"
      role="dialog"
      aria-modal="true"
      onMouseDown={(event) => event.target === event.currentTarget && onClose()}
    >
      <div className="max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-3xl border border-line bg-white p-5 shadow-2xl sm:p-7">
        <div className="mb-5 flex items-start justify-between gap-4">
          <h2 className="display text-2xl text-ink">{title}</h2>
          <button className="grid h-9 w-9 place-items-center rounded-full border border-line text-muted transition hover:border-accent hover:text-accent" onClick={onClose} aria-label="Close">
            <CloseIcon className="h-4 w-4" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

function Info({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-line bg-[#f8fbfb] px-3 py-2.5">
      <p className="label">{label}</p>
      <div className="mt-1 text-sm font-semibold text-ink">{value}</div>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  type = 'text',
  disabled = false,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
  disabled?: boolean;
}) {
  return (
    <div>
      <label className="label mb-1.5 block">{label}</label>
      <input
        className="input"
        type={type}
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
      />
    </div>
  );
}

function NumberField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: any;
  onChange: (value: string) => void;
}) {
  return (
    <div>
      <label className="label mb-1.5 block">{label}</label>
      <input
        className="input"
        type="number"
        value={value ?? ''}
        onChange={(event) => onChange(event.target.value)}
      />
    </div>
  );
}

function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (value: boolean) => void }) {
  return (
    <label className="flex cursor-pointer items-center justify-between gap-3 rounded-xl border border-line bg-[#f8fbfb] px-3 py-2.5">
      <span className="text-sm text-ink">{label}</span>
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        className="h-4 w-4 rounded border-line text-accent"
      />
    </label>
  );
}
