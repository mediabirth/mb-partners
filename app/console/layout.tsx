import ConsoleSessionProvider from '@/components/ConsoleSession'

export default function ConsoleLayout({ children }: { children: React.ReactNode }) {
  // The session provider lives in the persistent layout so the admin identity +
  // badge counts are resolved once and shared — pages remount but this does not,
  // so navigating never re-fetches or flashes a stale account placeholder.
  return <ConsoleSessionProvider>{children}</ConsoleSessionProvider>
}
