'use client';
import Link from 'next/link';
import { useState } from 'react';
import { useAuth } from '../lib/auth';
import { Logo } from '../components/ui';
import { CloseIcon, MenuIcon } from '../components/icons';

const LINKS = [
  { href: '/#services', label: 'Services' },
  { href: '/#how-it-works', label: 'How it works' },
  { href: '/#live', label: 'Live queue' },
  { href: '/staff/login', label: 'For teams' },
];

export function Nav() {
  const { user, logout } = useAuth();
  const [open, setOpen] = useState(false);

  const dashboard =
    user?.role === 'owner'
      ? '/owner'
      : user?.role === 'staff' || user?.role === 'manager'
        ? '/staff'
        : null;
  const name = user?.preferred_name || user?.name || user?.email || '';
  const close = () => setOpen(false);

  return (
    <header className="sticky top-0 z-40 border-b border-line bg-paper/95 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-5 sm:h-20 sm:px-6">
        <Link href="/" onClick={close} aria-label="LAUNDROMAT home" className="shrink-0">
          <Logo />
        </Link>

        <nav className="hidden items-center gap-7 text-sm text-muted lg:flex">
          {LINKS.map((link) => (
            <Link key={link.href} href={link.href} className="transition hover:text-ink">
              {link.label}
            </Link>
          ))}
        </nav>

        <div className="hidden items-center gap-4 sm:flex">
          {user ? (
            <>
              {dashboard && (
                <Link
                  href={dashboard}
                  className="hidden text-sm font-semibold text-ink transition hover:text-accent md:inline"
                >
                  Dashboard
                </Link>
              )}
              <Link
                href="/orders"
                className="hidden text-sm text-muted transition hover:text-ink md:inline"
              >
                My bookings
              </Link>
              <span className="hidden max-w-[12rem] truncate text-sm text-muted lg:inline">{name}</span>
              <button onClick={logout} className="btn btn-ghost btn-sm">
                Sign out
              </button>
            </>
          ) : (
            <>
              <Link href="/login" className="text-sm font-semibold text-ink transition hover:text-accent">
                Sign in
              </Link>
              <Link href="/register" className="btn btn-sm">
                Create account
              </Link>
            </>
          )}
        </div>

        <button
          type="button"
          onClick={() => setOpen((value) => !value)}
          className="grid h-10 w-10 place-items-center rounded-lg border border-line bg-white text-ink lg:hidden"
          aria-label={open ? 'Close menu' : 'Open menu'}
          aria-expanded={open}
        >
          {open ? <CloseIcon className="h-5 w-5" /> : <MenuIcon className="h-5 w-5" />}
        </button>
      </div>

      {open && (
        <div className="border-t border-line bg-paper lg:hidden">
          <div className="mx-auto max-w-6xl px-5 py-4 sm:px-6">
            <nav className="flex flex-col">
              {LINKS.map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  onClick={close}
                  className="border-b border-line py-3 text-sm font-medium text-ink last:border-0"
                >
                  {link.label}
                </Link>
              ))}
            </nav>

            <div className="mt-4 flex flex-col gap-2 sm:hidden">
              {user ? (
                <>
                  {dashboard && (
                    <Link href={dashboard} onClick={close} className="btn btn-ghost">
                      Dashboard
                    </Link>
                  )}
                  <Link href="/orders" onClick={close} className="btn btn-ghost">
                    My bookings
                  </Link>
                  <button
                    onClick={() => {
                      close();
                      logout();
                    }}
                    className="btn"
                  >
                    Sign out
                  </button>
                </>
              ) : (
                <>
                  <Link href="/login" onClick={close} className="btn btn-ghost">
                    Sign in
                  </Link>
                  <Link href="/register" onClick={close} className="btn">
                    Create account
                  </Link>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </header>
  );
}
