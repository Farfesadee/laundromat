import './globals.css';
import type { Metadata } from 'next';
import { AuthProvider } from '../lib/auth';
import { Nav } from './nav';

export const metadata: Metadata = {
  title: 'LAUNDROMAT | Wash · Dry · Relax',
  description: 'Same-day self-service laundry: live queue, washers, dryers, coffee.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen">
        <AuthProvider>
          <Nav />
          <main className="max-w-6xl mx-auto px-4 pb-16 pt-6">{children}</main>
          <footer className="border-t border-slate-200 bg-white/70 backdrop-blur">
            <div className="max-w-6xl mx-auto px-4 py-5 flex flex-wrap gap-2 items-center justify-between text-xs text-slate-500">
              <span className="font-bold text-[#0a1633]">LAUNDROMAT</span>
              <span>Wash · Dry · Relax. Please arrive at least 10 minutes before your estimated turn.</span>
            </div>
          </footer>
        </AuthProvider>
      </body>
    </html>
  );
}
