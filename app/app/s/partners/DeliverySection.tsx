'use client'
/** 委託先（v6・MBコンソール「パートナー」の区分と同文法）: 招待（名称＋任意メール→リンク）＋一覧。 */
import { useEffect, useState } from 'react'

type Dlv = { id: string; name: string; kind: string | null; contact_email: string | null; active: boolean; auth_user_id: string | null }

export default function DeliverySection() {
  const [list, setList] = useState<Dlv[] | null>(null)
  useEffect(() => { fetch('/api/supplier/self').then(r => r.ok ? r.json() : null).then(d => setList(d?.deliveries ?? [])).catch(() => setList([])) }, [])

  const CARD: React.CSSProperties = { background: 'var(--s-0, #fff)', border: '0.5px solid var(--line)', borderRadius: 14 }
  const FLD: React.CSSProperties = { minHeight: 40, padding: '0 10px', borderRadius: 8, border: '0.5px solid var(--line)', fontSize: '.74rem', fontFamily: 'inherit', boxSizing: 'border-box' }
  return (
    <div>
      <div style={{ ...CARD, overflow: 'hidden' }}>
        {list === null ? <p style={{ fontSize: '.72rem', color: 'var(--muted2)', padding: '14px 15px', margin: 0 }}>読み込み中…</p>
        : list.length === 0 ? <p style={{ fontSize: '.72rem', color: 'var(--muted2)', padding: '14px 15px', margin: 0 }}>まだ委託先がいません。招待すると、案件への委託（アサイン）ができるようになります。</p>
        : list.map((v, i) => (
          <div key={v.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '11px 15px', borderTop: i === 0 ? 'none' : '0.5px solid var(--line)' }}>
            <span style={{ flex: 1, minWidth: 0, fontSize: '.76rem', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{v.name}<span style={{ fontSize: '.6rem', color: 'var(--muted2)', fontWeight: 400, marginLeft: 8 }}>{v.kind ?? ''}</span></span>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, flexShrink: 0 }}>
              <span aria-hidden style={{ width: 6, height: 6, borderRadius: '50%', background: v.auth_user_id ? 'var(--st-success, #0f9d76)' : 'var(--amber)' }} />
              <span style={{ fontSize: '.64rem', color: 'var(--muted2)' }}>{v.auth_user_id ? '稼働中' : '招待済み・未登録'}</span>
            </span>
          </div>
        ))}
      </div>
      <p style={{ fontSize: '.62rem', color: 'var(--muted2)', margin: '8px 2px 0' }}>案件への委託（アサイン）は「案件」の詳細から。委託費のお支払いはMB Partnersの月次サイクルで行われます。</p>
    </div>
  )
}
