import type { Metadata } from 'next'
import { Inter, Zen_Kaku_Gothic_New } from 'next/font/google'
import './globals.css'

const inter = Inter({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700', '800'],
  variable: '--font-inter',
  display: 'swap',
})

const zenKaku = Zen_Kaku_Gothic_New({
  subsets: ['latin'],
  weight: ['400', '500', '700', '900'],
  variable: '--font-zen',
  display: 'swap',
})

export const metadata: Metadata = {
  title: 'MB Partners',
  description: 'Media Birth Partner Program',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="ja" className={`${inter.variable} ${zenKaku.variable}`}>
      <body>
        {children}
        <script dangerouslySetInnerHTML={{ __html: `
if ('serviceWorker' in navigator) {
  var _mbpRefreshing = false;
  navigator.serviceWorker.addEventListener('controllerchange', function() {
    if (!_mbpRefreshing) { _mbpRefreshing = true; window.location.reload(); }
  });
  window.addEventListener('load', function() {
    navigator.serviceWorker.register('/sw.js').catch(function(e) {
      console.warn('[SW] registration failed:', e);
    });
  });
}
        ` }} />
      </body>
    </html>
  )
}
