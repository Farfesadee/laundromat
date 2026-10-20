'use client';
import React from 'react';

type P = { className?: string };

function Base({ className = '', children, filled = false }: P & { children: React.ReactNode; filled?: boolean }) {
  return (
    <svg viewBox="0 0 24 24" fill={filled ? 'currentColor' : 'none'} stroke={filled ? 'none' : 'currentColor'}
      strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className={className}>
      {children}
    </svg>
  );
}

export function WasherIcon({ className = '' }: P) {
  return (
    <Base className={className}>
      <rect x="4" y="2.5" width="16" height="19" rx="2.5" />
      <circle cx="12" cy="13.5" r="5" />
      <path d="M8 13.5a4 4 0 0 1 8 0" />
      <circle cx="12" cy="13.5" r="1" fill="currentColor" stroke="none" />
      <rect x="7" y="5.2" width="4" height="1.6" rx=".8" fill="currentColor" stroke="none" />
      <circle cx="16.5" cy="6" r="1" />
    </Base>
  );
}

export function DryerIcon({ className = '' }: P) {
  return (
    <Base className={className}>
      <rect x="4" y="2.5" width="16" height="19" rx="2.5" />
      <rect x="7.5" y="9" width="9" height="9" rx="1.5" />
      <path d="M10 12.5h4M10 15h4" />
      <rect x="7" y="5.2" width="4" height="1.6" rx=".8" fill="currentColor" stroke="none" />
      <circle cx="16.5" cy="6" r="1" />
    </Base>
  );
}

export function BasketIcon({ className = '' }: P) {
  return (
    <Base className={className}>
      <path d="M5 10h14l-1.5 9a2 2 0 0 1-2 1.7h-7A2 2 0 0 1 6.5 19L5 10Z" />
      <path d="M3.5 10h17M9 10V6.5A1.5 1.5 0 0 1 10.5 5h3A1.5 1.5 0 0 1 15 6.5V10" />
      <path d="M9.5 13.5v3M12 13.5v3M14.5 13.5v3" />
      <path d="M9 5.5C9 3.5 10.5 2.5 12 2.5s3 1 3 3" />
    </Base>
  );
}

export function CoffeeIcon({ className = '' }: P) {
  return (
    <Base className={className}>
      <path d="M5 10h11v6a4 4 0 0 1-4 4H9a4 4 0 0 1-4-4v-6Z" />
      <path d="M16 11h1.5a2.5 2.5 0 0 1 0 5H16" />
      <path d="M8.5 7.5c0-1.2 1-1.3 1-2.5M12 7.5c0-1.2 1-1.3 1-2.5" />
    </Base>
  );
}

export function ShirtIcon({ className = '' }: P) {
  return (
    <Base className={className}>
      <path d="M9 4 4.5 7l1.8 3 2.2-1.2V20h7V8.8l2.2 1.2 1.8-3L15 4a3 3 0 0 1-6 0Z" />
    </Base>
  );
}

export function ClockIcon({ className = '' }: P) {
  return (
    <Base className={className}>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 7.5V12l3 2" />
    </Base>
  );
}

export function CheckCircleIcon({ className = '' }: P) {
  return (
    <Base className={className}>
      <circle cx="12" cy="12" r="8.5" />
      <path d="m8.5 12.2 2.4 2.4 4.6-5" />
    </Base>
  );
}

export function AlertIcon({ className = '' }: P) {
  return (
    <Base className={className}>
      <path d="M12 3.5 2.8 19.5h18.4L12 3.5Z" />
      <path d="M12 10v4" />
      <circle cx="12" cy="16.8" r=".4" fill="currentColor" stroke="none" />
    </Base>
  );
}

export function ArrowRightIcon({ className = '' }: P) {
  return (
    <Base className={className}>
      <path d="M4 12h15M13.5 6.5 19 12l-5.5 5.5" />
    </Base>
  );
}

export function MenuIcon({ className = '' }: P) {
  return (
    <Base className={className}>
      <path d="M4 7h16M4 12h16M4 17h16" />
    </Base>
  );
}

export function CloseIcon({ className = '' }: P) {
  return (
    <Base className={className}>
      <path d="m6 6 12 12M18 6 6 18" />
    </Base>
  );
}

export function UserIcon({ className = '' }: P) {
  return (
    <Base className={className}>
      <circle cx="12" cy="8" r="3.5" />
      <path d="M5 20a7 7 0 0 1 14 0" />
    </Base>
  );
}

export function CardIcon({ className = '' }: P) {
  return (
    <Base className={className}>
      <rect x="3" y="6" width="18" height="13" rx="2.5" />
      <path d="M3 10.5h18" />
      <path d="M6.5 15h4" />
    </Base>
  );
}

export function TvIcon({ className = '' }: P) {
  return (
    <Base className={className}>
      <rect x="3" y="5" width="18" height="12" rx="2" />
      <path d="M9.5 20.5h5M12 17v3.5" />
    </Base>
  );
}

export function ChartIcon({ className = '' }: P) {
  return (
    <Base className={className}>
      <path d="M4 4v15.5h16" />
      <path d="M8.5 15.5v-4M13 15.5V8.5M17.5 15.5v-6.5" />
    </Base>
  );
}

export function DropIcon({ className = '' }: P) {
  return (
    <Base className={className}>
      <path d="M12 3s6 6.2 6 10.5a6 6 0 0 1-12 0C6 9.2 12 3 12 3Z" />
      <path d="M9.5 13.5a2.5 2.5 0 0 0 2.5 2.5" />
    </Base>
  );
}

export function SparkleIcon({ className = '' }: P) {
  return (
    <Base className={className}>
      <path d="M12 3c.7 4.5 2.5 6.3 7 7-4.5.7-6.3 2.5-7 7-.7-4.5-2.5-6.3-7-7 4.5-.7 6.3-2.5 7-7Z" />
      <path d="M18.5 3.5c.3 1.8 1 2.5 2.8 2.8-1.8.3-2.5 1-2.8 2.8-.3-1.8-1-2.5-2.8-2.8 1.8-.3 2.5-1 2.8-2.8Z" />
    </Base>
  );
}

export function BoxIcon({ className = '' }: P) {
  return (
    <Base className={className}>
      <path d="m12 3 8 4.5v9L12 21l-8-4.5v-9L12 3Z" />
      <path d="M4.2 7.5 12 12l7.8-4.5M12 12v9" />
    </Base>
  );
}

export function BellIcon({ className = '' }: P) {
  return (
    <Base className={className}>
      <path d="M6 10a6 6 0 0 1 12 0c0 4 1.5 5.5 1.5 5.5h-15C4.5 15.5 6 14 6 10Z" />
      <path d="M10 19a2.2 2.2 0 0 0 4 0" />
    </Base>
  );
}

export function SearchIcon({ className = '' }: P) {
  return (
    <Base className={className}>
      <circle cx="11" cy="11" r="6.5" />
      <path d="m16 16 4.5 4.5" />
    </Base>
  );
}

export function GoogleIcon({ className = '' }: P) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
      <path
        fill="#4285F4"
        d="M23.49 12.27c0-.79-.07-1.54-.19-2.27H12v4.51h6.47a5.53 5.53 0 0 1-2.4 3.62v3.01h3.88c2.27-2.09 3.54-5.17 3.54-8.87z"
      />
      <path
        fill="#34A853"
        d="M12 24c3.24 0 5.96-1.07 7.95-2.91l-3.88-3.01c-1.08.72-2.45 1.15-4.07 1.15-3.13 0-5.78-2.11-6.73-4.96H1.27v3.09A12 12 0 0 0 12 24z"
      />
      <path
        fill="#FBBC05"
        d="M5.27 14.27A7.2 7.2 0 0 1 4.89 12c0-.79.14-1.56.38-2.27V6.64H1.27A12 12 0 0 0 0 12c0 1.93.46 3.76 1.27 5.36l4-3.09z"
      />
      <path
        fill="#EA4335"
        d="M12 4.77c1.76 0 3.34.61 4.58 1.79l3.44-3.44C17.95 1.19 15.24 0 12 0A12 12 0 0 0 1.27 6.64l4 3.09C6.22 6.88 8.87 4.77 12 4.77z"
      />
    </svg>
  );
}
