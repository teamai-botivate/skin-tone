import type { Metadata } from 'next';
import './globals.css';
import { Providers } from './providers';

export const metadata: Metadata = {
  title: 'SkinTune — AI-Powered Personal Color & Styling',
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
    <html lang="en" className="dark" suppressHydrationWarning>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
      </head>
      <body className="min-h-screen bg-background text-foreground antialiased selection:bg-[#D7BD9B]/30 selection:text-[#D7BD9B]">
        <Providers>
          {children}
        </Providers>
      </body>
    </html>
  );
}
