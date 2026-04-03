import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';

// Inter is the closest freely available match to NVIDIA Sans —
// clean, geometric, and used in NVIDIA's developer portal UI
const inter = Inter({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700', '900'],
  variable: '--font-inter',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'NVIDIA AI Ecosystem Visualizer',
  description:
    'Interactive map of the official NVIDIA AI stack — understand how every service connects and generate your custom path with Groq AI.',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${inter.variable} h-full`}>
      <body className="h-full bg-[#050505] text-white antialiased" style={{ fontFamily: 'var(--font-inter), system-ui, sans-serif' }}>
        {children}
      </body>
    </html>
  );
}
