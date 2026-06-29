'use client'
import dynamic from 'next/dynamic'
import type { ThreadRow, Msg, Template } from './MessagesClient'

// A: メッセージUI（重いクライアント）を遅延読込で初回バンドルから除外。読込中は骨組み。
function MsgSkeleton() {
  return (
    <div style={{ display: 'flex', gap: 16, padding: '20px 28px' }}>
      <div className="ui-skeleton" style={{ width: 280, height: 480, borderRadius: 14 }} />
      <div className="ui-skeleton" style={{ flex: 1, height: 480, borderRadius: 14 }} />
    </div>
  )
}

const MessagesClient = dynamic(() => import('./MessagesClient'), { ssr: false, loading: () => <MsgSkeleton /> })

export default function MessagesClientLazy(props: { threads: ThreadRow[]; messages: Msg[]; signedUrls?: Record<string, string>; templates?: Template[] }) {
  return <MessagesClient {...props} />
}
