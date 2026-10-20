import Link from 'next/link';
import React from 'react';
import { Logo } from './ui';

type Props = {
  image: string;
  imageAlt: string;
  panelEyebrow: string;
  panelTitle: string;
  panelText: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
};

export function AuthShell({
  image,
  imageAlt,
  panelEyebrow,
  panelTitle,
  panelText,
  children,
  footer,
}: Props) {
  return (
    <div className="py-4 sm:py-8">
      <div className="grid min-h-[640px] overflow-hidden rounded-[1.75rem] border border-line bg-white lg:grid-cols-2">
        <div className="relative hidden lg:block">
          <img src={image} alt={imageAlt} className="absolute inset-0 h-full w-full object-cover" />
          <div className="absolute inset-0 bg-[#0b3c49]/80" />
          <div className="relative flex h-full flex-col justify-between p-10 xl:p-12">
            <Link href="/" className="inline-flex w-fit" aria-label="LAUNDROMAT home">
              <Logo light />
            </Link>
            <div className="max-w-md">
              <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-white/55">
                {panelEyebrow}
              </p>
              <p className="display mt-4 text-4xl leading-tight text-white xl:text-5xl">{panelTitle}</p>
              <p className="mt-4 max-w-sm text-sm leading-6 text-white/65">{panelText}</p>
            </div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-white/35">
              Wash · Dry · Fold
            </p>
          </div>
        </div>

        <div className="flex min-w-0 flex-col justify-center p-6 sm:p-10 xl:p-12">
          <div className="mb-8 flex items-center justify-between">
            <Link href="/" className="inline-flex lg:hidden" aria-label="LAUNDROMAT home">
              <Logo />
            </Link>
            <Link
              href="/"
              className="ml-auto text-sm font-medium text-muted transition hover:text-ink"
            >
              Back to home
            </Link>
          </div>
          {children}
          {footer && <div className="mt-6 border-t border-line pt-5 text-sm text-muted">{footer}</div>}
        </div>
      </div>
    </div>
  );
}
