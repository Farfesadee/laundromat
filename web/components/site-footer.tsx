import Link from 'next/link';
import { Logo } from './ui';

const groups = [
  {
    title: 'Services',
    links: [
      { href: '/book/self-service', label: 'Self-service wash' },
      { href: '/book/drop-off', label: 'Drop-off laundry' },
      { href: '/book/add-ons', label: 'Coffee and drinks' },
    ],
  },
  {
    title: 'Account',
    links: [
      { href: '/register', label: 'Create account' },
      { href: '/login', label: 'Sign in' },
      { href: '/orders', label: 'Track a wash' },
    ],
  },
  {
    title: 'Store',
    links: [
      { href: '/#live', label: 'Live queue' },
      { href: '/tv', label: 'Store TV' },
      { href: '/staff/login', label: 'Staff sign in' },
    ],
  },
];

export function SiteFooter() {
  return (
    <footer className="mt-10 border-t border-line bg-[#eaf6f8]">
      <div className="mx-auto max-w-6xl px-5 py-12 sm:px-6">
        <div className="grid grid-cols-3 gap-x-4 gap-y-9 md:grid-cols-[1.6fr_1fr_1fr_1fr] md:gap-10">
          <div className="col-span-3 md:col-span-1">
            <Logo />
            <p className="mt-4 max-w-xs text-sm leading-6 text-muted">
              Self-service laundry with a live queue, secure payments, and a team that keeps things moving.
            </p>
            <p className="mt-5 text-[10px] font-semibold uppercase tracking-[0.22em] text-accent">
              Wash · Dry · Fold
            </p>
          </div>
          {groups.map((group) => (
            <div key={group.title} className="min-w-0">
              <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-ink sm:text-[11px]">
                {group.title}
              </p>
              <ul className="mt-3 space-y-2.5 sm:mt-4">
                {group.links.map((link) => (
                  <li key={link.href}>
                    <Link
                      href={link.href}
                      className="block break-words text-[12px] leading-5 text-muted transition hover:text-accent sm:text-sm"
                    >
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        <div className="mt-10 flex flex-col justify-between gap-3 border-t border-[#cfe2e5] pt-6 text-xs text-muted sm:flex-row">
          <span>© {new Date().getFullYear()} LAUNDROMAT. All rights reserved.</span>
          <span>Fresh laundry, less waiting.</span>
        </div>
      </div>
    </footer>
  );
}
