'use client'
import Button from '@/components/ui/Button'
import EmptyState from '@/components/ui/EmptyState'
import type { Template } from '../../messages/MessagesClient'
import { ChannelBadge } from '../messaging-shared'

type Row = Template & { updated_at: string }
const fmtDate = (iso: string) => iso ? new Date(iso).toLocaleDateString('ja', { year: 'numeric', month: 'numeric', day: 'numeric' }) : ''

// Phase3-D②：自由送信テンプレ一覧（list）。詰め込み解消＝編集フォームは出さず、行クリックで編集画面へ。
export default function TemplatesListClient({ templates }: { templates: Row[] }) {
  return (
    <div style={{ maxWidth: 740, margin: '0 auto', padding: '28px 28px 60px' }}>
      <div style={{ marginBottom: 18 }}>
        <a href="/console/settings" style={{ fontSize: '.66rem', fontWeight: 700, color: 'var(--c-blue)', textDecoration: 'none' }}>← 設定に戻る</a>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 6 }}>
          <h1 style={{ fontSize: '1.4rem', fontWeight: 900 }}>自由送信テンプレート</h1>
          <Button variant="primary" size="sm" href="/console/settings/templates/new">新規作成</Button>
        </div>
        <p style={{ fontSize: '.64rem', color: 'var(--muted2)', marginTop: 4 }}>メッセージ画面で手動送信するときに挿入できる定型文です。行をクリックすると編集できます。</p>
      </div>

      {templates.length === 0 ? (
        <EmptyState title="テンプレートはまだありません" hint="「新規作成」から追加できます。" action={<Button variant="primary" size="sm" href="/console/settings/templates/new">新規作成</Button>} />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {templates.map(t => {
            const hasImg = (t.attachments ?? []).some(a => a.type === 'image')
            return (
              <a key={t.id} href={`/console/settings/templates/${t.id}`} className="ui-card" style={{ padding: '13px 16px', textDecoration: 'none', color: 'inherit', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: '.82rem', fontWeight: 800, display: 'flex', alignItems: 'center', gap: 8 }}>
                    <ChannelBadge channel={t.channel} />
                    <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.title}</span>
                    {hasImg && <span title="画像あり" style={{ flexShrink: 0, fontSize: '.7rem' }}>🖼</span>}
                  </div>
                  {t.body && <div style={{ fontSize: '.66rem', color: 'var(--muted2)', marginTop: 3, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{t.body}</div>}
                </div>
                <div style={{ flexShrink: 0, display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{ fontSize: '.56rem', color: 'var(--t-tertiary)' }}>{fmtDate(t.updated_at)}</span>
                  <span style={{ color: 'var(--t-tertiary)' }}>›</span>
                </div>
              </a>
            )
          })}
        </div>
      )}
    </div>
  )
}
