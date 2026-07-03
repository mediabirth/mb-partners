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
      {/* v2.2 静音レイヤー（APP .app-quiet / vendor .vendor-quiet と同内容・consoleスコープ限定＝3面分離維持）。
          ★ブランドロゴ（ConsoleNav の MB Partners / Console マーク）は .cq-brand で700維持（APPと同じ例外）。 */}
      <style>{`.console-quiet :is(b,strong,.btn,.ui-btn,.ty-h1,.ty-h2,.eyebrow,.chip,.ui-tag){font-weight:500}
.console-quiet .cq-brand, .console-quiet .cq-brand *{font-weight:700}
.console-quiet{line-break:strict}
.console-quiet p,.console-quiet li{text-wrap:pretty}
@supports (word-break:auto-phrase){.console-quiet p,.console-quiet li{word-break:auto-phrase}}
.console-quiet :is(h1,h2,.ty-h1,.ty-h2){text-wrap:balance}`}</style>
      <div className="console-quiet" style={{ display: 'contents' }}>
        <ConsoleSessionProvider>{children}</ConsoleSessionProvider>
      </div>
    </SWRProvider>
  )
}
