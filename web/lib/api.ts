// API client with no mock data. Failures surface as typed errors with
// loading/empty states in the UI. Base URL comes from the environment.
export const API_BASE = (process.env.NEXT_PUBLIC_API_URL || '').replace(/\/$/, '');
const BASE = API_BASE;
if (!BASE && typeof window !== 'undefined') {
  // eslint-disable-next-line no-console
  console.warn('NEXT_PUBLIC_API_URL is not set');
}

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

const GENERIC_DETAILS = new Set([
  'not found',
  'bad request',
  'forbidden',
  'unauthorized',
  'internal server error',
  'method not allowed',
  'unprocessable entity',
]);

const STATUS_MESSAGES: Record<number, string> = {
  400: 'Some details need attention. Please review them and try again.',
  401: 'Your session has ended. Please sign in again.',
  403: 'You do not have access to that. Sign in with the right account.',
  404: 'We could not find that page or record. It may have been removed.',
  405: 'That action is not available here. Please refresh and try again.',
  408: 'The request took too long. Please try again.',
  409: 'That change conflicts with an existing record. Please refresh and try again.',
  422: 'Some details need attention. Please review the form and try again.',
  429: 'Too many attempts. Please wait a moment and try again.',
  500: 'Something went wrong on our side. Please try again in a moment.',
  502: 'The laundry service is temporarily unavailable. Please try again in a moment.',
  503: 'The laundry service is temporarily unavailable. Please try again in a moment.',
  504: 'The laundry service is taking too long to respond. Please try again.',
};

function friendlyError(status: number, detail: unknown): string {
  const raw = typeof detail === 'string' ? detail : '';
  const text = raw.trim();
  const lower = text.toLowerCase();
  const looksTechnical =
    !text ||
    text.length > 220 ||
    GENERIC_DETAILS.has(lower) ||
    lower.startsWith('traceback') ||
    lower.includes('sqlalchemy') ||
    lower.includes('internal server error');
  if (!looksTechnical) return text;
  return STATUS_MESSAGES[status] || 'That request did not go through. Please try again.';
}

export const kobo = (n: number | null | undefined) =>
  n == null ? '-' : '₦' + (n / 100).toLocaleString('en-NG');

export const fmtTime = (iso: string | null | undefined) => {
  if (!iso) return '-';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return String(iso);
  return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
};

async function req<T>(path: string, init?: RequestInit, token?: string | null): Promise<T> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json', ...((init?.headers as any) || {}) };
  if (token) headers.Authorization = `Bearer ${token}`;
  let r: Response;
  try {
    r = await fetch(`${BASE}${path}`, { ...init, headers });
  } catch {
    throw new ApiError(0, 'Cannot reach the server. Check your connection and try again.');
  }
  if (!r.ok) {
    let detail: unknown = '';
    try {
      const body = await r.json();
      detail = body?.detail ?? body?.message ?? '';
    } catch {
      try { detail = await r.text(); } catch {}
    }
    throw new ApiError(r.status, friendlyError(r.status, detail));
  }
  if (r.status === 204) return undefined as unknown as T;
  return r.json() as Promise<T>;
}

export const api = {
  get: <T,>(path: string, token?: string | null) => req<T>(path, { cache: 'no-store' }, token),
  post: <T,>(path: string, body: unknown, token?: string | null) =>
    req<T>(path, { method: 'POST', body: JSON.stringify(body ?? {}) }, token),
  put: <T,>(path: string, body: unknown, token?: string | null) =>
    req<T>(path, { method: 'PUT', body: JSON.stringify(body ?? {}) }, token),
  patch: <T,>(path: string, body: unknown, token?: string | null) =>
    req<T>(path, { method: 'PATCH', body: JSON.stringify(body ?? {}) }, token),
  estimate: (washes: number) => req<{ wait_minutes: number | null; first_start: string | null; accepting: boolean }>(`/queue/estimate?washes=${washes}`),
  publicQueue: () => req<{ now_serving: any[]; coming_up: any[] }>(`/queue/public`),
  services: () => req<{ id: string; kind: string; name: string; unit_price: number }[]>(`/services`),
  storeStatus: () => req<{ accepting: boolean; dropoff_open: boolean; dropoff_capacity: number; wait_minutes: number | null; payments_online: boolean }>(`/store/status`),
};

const KEY = 'laundromat_token';
const REFRESH = 'laundromat_refresh';

export const tokens = {
  get(): string | null { return typeof window === 'undefined' ? null : localStorage.getItem(KEY); },
  getRefresh(): string | null { return typeof window === 'undefined' ? null : localStorage.getItem(REFRESH); },
  save(access: string, refresh?: string) {
    localStorage.setItem(KEY, access);
    if (refresh) localStorage.setItem(REFRESH, refresh);
    window.dispatchEvent(new Event('laundromat-auth'));
  },
  clear() {
    localStorage.removeItem(KEY); localStorage.removeItem(REFRESH);
    window.dispatchEvent(new Event('laundromat-auth'));
  },
};
