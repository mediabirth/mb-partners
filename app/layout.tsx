import type { Metadata, Viewport } from 'next'
import { Inter, Zen_Kaku_Gothic_New } from 'next/font/google'
import './globals.css'
import InstallHint from '@/components/InstallHint'

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
  applicationName: 'MB Partners',
  // PWA: アイコン + apple-touch-icon
  icons: {
    icon: [
      { url: '/favicon-32.png', sizes: '32x32', type: 'image/png' },
      { url: '/icon-192.png', sizes: '192x192', type: 'image/png' },
      { url: '/icon-512.png', sizes: '512x512', type: 'image/png' },
    ],
    apple: [{ url: '/icon-192.png', sizes: '192x192', type: 'image/png' }],
  },
  // ③ iOS: ホーム画面追加で全画面・ステータスバー・タイトル
  appleWebApp: {
    capable: true,
    title: 'MB Partners',
    statusBarStyle: 'default',
  },
  // 旧iOS全画面用に明示（Next は mobile-web-app-capable を出すため apple- 版も併記）
  other: { 'apple-mobile-web-app-capable': 'yes' },
}

export const viewport: Viewport = {
  themeColor: '#4733E6',
  // H: iOS Safari の動的下部バー対策。env(safe-area-inset-*) を有効化（cover必須）。
  viewportFit: 'cover',
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
        <InstallHint />
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
