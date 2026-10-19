import 'react-phone-number-input/style.css';
import './globals.css';
import type { Metadata } from 'next';
import { AuthProvider } from '../lib/auth';
import { Nav } from './nav';
import { SiteFooter } from '../components/site-footer';

export const metadata: Metadata = {
  title: 'LAUNDROMAT | Self-service laundry, without the wait',
  description:
    'Reserve a washer, follow the live queue, and collect fresh laundry the same day. Self-service laundry with secure payments and real support.',
  openGraph: {
    title: 'LAUNDROMAT | Self-service laundry, without the wait',
    description:
      'Reserve a washer, follow the live queue, and collect fresh laundry the same day.',
    type: 'website',
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="flex min-h-screen flex-col">
        <AuthProvider>
          <Nav />
          <main className="mx-auto w-full max-w-6xl flex-1 px-5 py-6 sm:px-6 sm:py-8">
            {children}
          </main>
          <SiteFooter />
        </AuthProvider>
      </body>
    </html>
  );
}
