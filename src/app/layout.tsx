import type { Metadata } from 'next';
import './globals.css';
import { Providers } from './providers';

export const metadata: Metadata = {
  title: 'LetStyle — AI-Powered Personal Color & Styling',
  description: 'Discover your optimal color palette, outfits, and personalized fashion recommendations powered by AI.',
  icons: {
    icon: '/favicon.svg',
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
      </head>
      <body className="min-h-screen bg-background text-foreground antialiased selection:bg-[#D9BC96] selection:text-[#194A49]">
        <Providers>
          {children}
        </Providers>
      </body>
    </html>
  );
}
