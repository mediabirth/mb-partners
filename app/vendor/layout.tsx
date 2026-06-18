import type { Metadata, Viewport } from 'next'

// /vendor 専用の PWA アイデンティティ（MB Partners・デリバリー）。ブランドは app と統一。
// ルートの manifest（MB Partners）を /vendor 配下でだけ上書きし、start_url/scope を /vendor に。
// SW（/sw.js・scope '/'）と InstallHint はルート layout のものをそのまま利用（partner/console は不変）。
export const metadata: Metadata = {
  title: 'MB Partners',
  applicationName: 'MB Partners',
  manifest: '/vendor.webmanifest',
  icons: {
    icon: [{ url: '/icon-192.png', sizes: '192x192', type: 'image/png' }],
    apple: [{ url: '/icon-192.png', sizes: '192x192', type: 'image/png' }],
  },
  appleWebApp: { capable: true, title: 'MB Partners', statusBarStyle: 'default' },
  other: { 'apple-mobile-web-app-capable': 'yes' },
}

export const viewport: Viewport = {
  themeColor: '#4733E6',
  viewportFit: 'cover',
}

export default function VendorLayout({ children }: { children: React.ReactNode }) {
  return children
}
