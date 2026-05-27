import './globals.css';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'FundCentre Intelligent Filesplit',
  description: 'AI-powered filesplit and auto-tagging for fund reporting',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <div className="min-h-screen">
          <header className="bg-brand-900 text-white">
            <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
              <div>
                <div className="text-sm uppercase tracking-wider text-brand-100/80">SS&amp;C Intralinks</div>
                <div className="text-lg font-semibold">FundCentre · Intelligent Filesplit</div>
              </div>
              <div className="text-xs text-brand-100/70">Hackathon prototype</div>
            </div>
          </header>
          <main className="px-6 py-8">{children}</main>
        </div>
      </body>
    </html>
  );
}
