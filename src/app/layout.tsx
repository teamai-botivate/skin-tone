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
        <script
          dangerouslySetInnerHTML={{
            __html: `
              (function() {
                function isWebpackStaleError(msg) {
                  if (!msg || typeof msg !== 'string') return false;
                  return (
                    msg.indexOf("Cannot read properties of undefined (reading 'call')") !== -1 ||
                    msg.indexOf('options.factory') !== -1 ||
                    msg.indexOf('ChunkLoadError') !== -1 ||
                    msg.indexOf('Loading chunk') !== -1
                  );
                }

                function reloadOnce() {
                  try {
                    var key = 'webpack_chunk_reload_lock';
                    var now = Date.now();
                    var last = sessionStorage.getItem(key);
                    if (!last || now - parseInt(last, 10) > 8000) {
                      sessionStorage.setItem(key, String(now));
                      window.location.reload();
                    }
                  } catch (e) {}
                }

                window.addEventListener('error', function(event) {
                  var msg = (event && (event.message || (event.error && event.error.message))) || '';
                  if (isWebpackStaleError(msg)) {
                    console.warn('[LetStyle] Safely intercepted stale Webpack chunk mismatch error:', msg);
                    if (event.preventDefault) event.preventDefault();
                    if (event.stopImmediatePropagation) event.stopImmediatePropagation();
                    reloadOnce();
                  }
                }, true);

                window.addEventListener('unhandledrejection', function(event) {
                  var reason = event && event.reason;
                  var msg = (reason && (reason.message || String(reason))) || '';
                  if (isWebpackStaleError(msg)) {
                    console.warn('[LetStyle] Safely intercepted stale Webpack chunk rejection:', msg);
                    if (event.preventDefault) event.preventDefault();
                    if (event.stopImmediatePropagation) event.stopImmediatePropagation();
                    reloadOnce();
                  }
                }, true);
              })();
            `,
          }}
        />
      </head>
      <body className="min-h-screen bg-background text-foreground antialiased selection:bg-[#D9BC96] selection:text-[#194A49]">
        <Providers>
          {children}
        </Providers>
      </body>
    </html>
  );
}
