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
    <footer className="mt-8 border-t border-line bg-[#f0ede6]">
      <div className="mx-auto max-w-6xl px-5 py-12 sm:px-6">
        <div className="grid gap-10 md:grid-cols-[1.6fr_1fr_1fr_1fr]">
          <div>
            <Logo />
            <p className="mt-4 max-w-xs text-sm leading-6 text-muted">
              Self-service laundry with a live queue, secure payments, and a team that keeps things moving.
            </p>
            <p className="mt-5 text-[10px] font-semibold uppercase tracking-[0.22em] text-[#8a938f]">
              Wash · Dry · Relax
            </p>
          </div>
          {groups.map((group) => (
            <div key={group.title}>
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-ink">{group.title}</p>
              <ul className="mt-4 space-y-2.5">
                {group.links.map((link) => (
                  <li key={link.href}>
                    <Link href={link.href} className="text-sm text-muted transition hover:text-accent">
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        <div className="mt-10 flex flex-col justify-between gap-3 border-t border-[#ddd8ce] pt-6 text-xs text-[#7a8581] sm:flex-row">
          <span>© {new Date().getFullYear()} LAUNDROMAT. All rights reserved.</span>
          <span>Built for a calmer laundry day.</span>
        </div>
      </div>
    </footer>
  );
}
