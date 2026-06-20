import type { Metadata } from 'next'
import ConsoleSessionProvider from '@/components/ConsoleSession'
import SWRProvider from '@/components/SWRProvider'

// console 専用 manifest（start_url=/console）でルート manifest('/') を上書き。
// console host で '/'→'/console' の追加 redirect を PWA 起動時に回避（app/vendor は不変）。
export const metadata: Metadata = { manifest: '/console.webmanifest' }

export default function ConsoleLayout({ children }: { children: React.ReactNode }) {
  // The session provider lives in the persistent layout so the admin identity +
  // badge counts are resolved once and shared — pages remount but this does not,
  // so navigating never re-fetches or flashes a stale account placeholder.
  // SWRProvider: クライアントキャッシュ（遷移一瞬・focus再検証で金額stale防止）。
  return (
    <SWRProvider>
      <ConsoleSessionProvider>{children}</ConsoleSessionProvider>
    </SWRProvider>
  )
}
