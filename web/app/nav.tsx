'use client';
import Link from 'next/link';
import { useAuth } from '../lib/auth';
import { Logo } from '../components/ui';

export function Nav() {
  const { user, logout } = useAuth();
  return (
    <header className="sticky top-0 z-20 border-b border-white/10 brand-gradient shadow-lg">
      <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between gap-3">
        <Link href="/"><Logo light /></Link>
        <nav className="flex items-center gap-1 text-sm text-white/90">
          <Link className="px-2.5 py-2 rounded-lg hover:bg-white/10" href="/book">Book</Link>
          <Link className="px-2.5 py-2 rounded-lg hover:bg-white/10" href="/orders">Track</Link>
          <Link className="px-2.5 py-2 rounded-lg hover:bg-white/10 hidden sm:inline" href="/tv">TV</Link>
          <Link className="px-2.5 py-2 rounded-lg hover:bg-white/10 hidden sm:inline" href="/staff">Staff</Link>
          <Link className="px-2.5 py-2 rounded-lg hover:bg-white/10 hidden md:inline" href="/owner">Owner</Link>
          {user ? (
            <span className="flex items-center gap-2 ml-1">
              <span className="hidden sm:inline text-cyan-200 font-semibold">{user.preferred_name || user.name || user.email}</span>
              <button onClick={logout} className="px-3 py-1.5 rounded-lg bg-white/15 hover:bg-white/25 font-semibold">Sign out</button>
            </span>
          ) : (
            <Link href="/login" className="ml-1 px-3.5 py-2 rounded-lg bg-amber-400 text-[#0a1633] font-bold hover:bg-amber-300">Sign in</Link>
          )}
        </nav>
      </div>
    </header>
  );
}
