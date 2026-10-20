import Link from 'next/link';
import { ArrowRightIcon } from './icons';

export function BackLink({ href, label }: { href: string; label: string }) {
  return (
    <Link
      href={href}
      className="mb-3 inline-flex items-center gap-2 rounded-full border border-line bg-white px-3 py-1.5 text-xs font-semibold text-muted transition hover:border-accent hover:bg-accent-soft hover:text-ink"
    >
      <ArrowRightIcon className="h-3.5 w-3.5 rotate-180" />
      {label}
    </Link>
  );
}
