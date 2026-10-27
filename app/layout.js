import { Unbounded, Inter_Tight } from 'next/font/google';
import './globals.css';

const display = Unbounded({ subsets: ['latin'], weight: ['500', '700', '800'], variable: '--font-display' });
const body = Inter_Tight({ subsets: ['latin'], weight: ['300', '400', '500', '600'], variable: '--font-body' });

export const metadata = {
  title: 'Draft Lab · Direborn',
  description: 'Dota 2 Captain’s Mode draft trainer with S–F grading, built on OpenDota data.',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en" className={display.variable + ' ' + body.variable}>
      <body>{children}</body>
    </html>
  );
}
