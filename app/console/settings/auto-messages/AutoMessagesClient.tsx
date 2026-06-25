'use client'
import type { Template } from '../../messages/MessagesClient'
import { ChannelBadge, EventIcon } from '../messaging-shared'
import { SECTIONS } from '../messaging-sections'

// Phase3-D②b：自動メッセージ＝コンパクトな一覧（1行/イベント）。全展開の本文/変数/プレビューは [category] 編集画面へ。
// ★resolveTemplate/Media・各通知の発火/フォールバックは byte-unchanged。状態は読むだけ（is_active テンプレ有無）。
export default function AutoMessagesClient({ customCategories }: { customCategories: string[] }) {
  const custom = new Set(customCategories)
  return (
    <div style={{ maxWidth: 720, margin: '0 auto', padding: '28px 28px 60px' }}>
      <div style={{ marginBottom: 18 }}>
        <a href="/console/settings" style={{ fontSize: '.66rem', fontWeight: 700, color: 'var(--c-blue)', textDecoration: 'none' }}>← 設定に戻る</a>
        <h1 style={{ fontSize: '1.4rem', fontWeight: 900, marginTop: 6 }}>自動メッセージ</h1>
        <p style={{ fontSize: '.64rem', color: 'var(--muted2)', marginTop: 4 }}>各イベントで自動送信される文面・画像。行をタップして編集できます。未設定なら既定の文面が使われます。</p>
      </div>

      <div className="ui-card" style={{ padding: 0, overflow: 'hidden' }}>
        {SECTIONS.map((s, i) => {
          const isCustom = custom.has(s.key)
          return (
            <a key={s.key} href={`/console/settings/auto-messages/${s.key}`} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '13px 16px', textDecoration: 'none', color: 'inherit', borderTop: i === 0 ? 'none' : '1px solid var(--c-hairline)' }}>
              <EventIcon category={s.key} channel={s.channel} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: '.82rem', fontWeight: 800, display: 'flex', alignItems: 'center', gap: 7 }}>
                  <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.label}</span>
                  <ChannelBadge channel={s.channel} />
                </div>
                <div style={{ fontSize: '.62rem', color: 'var(--muted2)', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.desc}</div>
              </div>
              <span style={{ flexShrink: 0, fontSize: '.52rem', fontWeight: 800, color: isCustom ? 'var(--c-blue)' : 'var(--t-tertiary)', background: isCustom ? 'var(--c-ghost-bg)' : 'var(--s-2)', borderRadius: 5, padding: '3px 8px' }}>{isCustom ? 'カスタム' : '既定のまま'}</span>
              <span style={{ flexShrink: 0, color: 'var(--t-tertiary)' }}>›</span>
            </a>
          )
        })}
      </div>
    </div>
  )
}
