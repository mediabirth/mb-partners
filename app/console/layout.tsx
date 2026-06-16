import ConsoleSessionProvider from '@/components/ConsoleSession'
import SWRProvider from '@/components/SWRProvider'

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
