import type { Metadata } from 'next';
import { Geist, Geist_Mono } from 'next/font/google';
import './globals.css';
import { Toaster } from 'sonner';

const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
});

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
});

export const metadata: Metadata = {
  title: 'Packshot Studio — AI Ecommerce Product Photography',
  description:
    'Generate marketplace-ready ecommerce packshots, studio hero imagery, and macro material photography with structured realism controls.',
  openGraph: {
    title: 'Packshot Studio — AI Ecommerce Product Photography',
    description:
      'Generate marketplace-ready ecommerce packshots, studio hero imagery, and macro material photography with structured realism controls.',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Packshot Studio — AI Ecommerce Product Photography',
    description:
      'Generate marketplace-ready ecommerce packshots, studio hero imagery, and macro material photography with structured realism controls.',
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark" suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} min-h-screen bg-[var(--background)] text-[var(--foreground)] font-sans antialiased`}
        suppressHydrationWarning
      >
        {children}
        <Toaster
          position="bottom-right"
          toastOptions={{
            classNames: {
              toast:
                'bg-[var(--card)] text-[var(--foreground)] border border-[var(--border)] rounded-[12px] shadow-none text-[13px]',
              description: 'text-[var(--muted-foreground)]',
            },
          }}
        />
      </body>
    </html>
  );
}
