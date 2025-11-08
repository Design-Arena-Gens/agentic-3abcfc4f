import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'NSE Accumulation Scanner',
  description: 'Detect stealth accumulation by institutions using CMF over last 5 sessions.'
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
