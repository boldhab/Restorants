import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { SessionProvider } from '../features/session';
import './globals.css';
export const metadata: Metadata = {
  title: 'ZAYQORA · Your restaurant, together',
  description: 'A secure foundation for your restaurant business.',
};
export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <SessionProvider>{children}</SessionProvider>
      </body>
    </html>
  );
}
