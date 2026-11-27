import type { Metadata } from 'next';
import { headers } from 'next/headers';
import './globals.css';
import { AuthProvider } from '@/lib/auth-context';

export const metadata: Metadata = {
  title: 'Aura',
  description: 'Aura — piattaforma per artisti di musica generata con AI.',
  robots: { index: false, follow: false }, // finché il sito è in costruzione
};

// Legge gli header della richiesta: rende la pagina dinamica, così Next applica il nonce della CSP
// (generato dal middleware) a ogni script. Una pagina statica non avrebbe nonce e la CSP la bloccherebbe.
export const dynamic = 'force-dynamic';

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  await headers();
  return (
    <html lang="it">
      <body className="font-sans antialiased">
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  );
}
