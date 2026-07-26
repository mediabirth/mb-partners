'use client'
/**
 * 受託者の通知（純化バッチD）— 単一リスト。
 * 「お知らせ」タブは撤去：broadcasts に相当する受託者向け配信機能が存在しないため（存在しない機能の文法を移植しない）。
 * 通知はすべて本人宛の契約・お金イベント（経費承認/差戻し・支払・委託）。
 * 既読はAPPと同じ「行／一括」の操作文法で、本人auth metadataへ永続化する。
 */
import Link from 'next/link'
import type { VNotif } from '@/lib/vendor-data'
import { useCallback, useState } from 'react'

const fmt = (iso: string) => { const d = new Date(iso); return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString('ja', { timeZone: 'Asia/Tokyo', month: 'numeric', day: 'numeric' }) }

function Icon({ type }: { type: string }) {
  const map: Record<string, { bg: string; c: string; d: React.ReactNode }> = {
    ok: { bg: 'var(--green-bg)', c: 'var(--green)', d: <path d="M20 6L9 17l-5-5" /> },
    pay: { bg: 'var(--green-bg)', c: 'var(--green)', d: <><rect x="2" y="6" width="20" height="13" rx="2" /><path d="M2 10h20" /></> },
    ng: { bg: 'var(--red-bg)', c: 'var(--red)', d: <><circle cx="12" cy="12" r="9" /><path d="M15 9l-6 6M9 9l6 6" /></> },
    freeze: { bg: 'var(--blue-bg)', c: 'var(--c-blue)', d: <><rect x="2" y="6" width="20" height="13" rx="2" /><path d="M2 10h20M6 15h4" /></> },
    assign: { bg: 'var(--blue-bg)', c: 'var(--c-blue)', d: <path d="M4 6h16M4 12h16M4 18h10" /> },
  }
  const m = map[type] ?? map.assign
  return <span style={{ width: 34, height: 34, borderRadius: '50%', background: m.bg, color: m.c, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}><svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">{m.d}</svg></span>
}

export default function VendorInboxClient({ notifs }: { notifs: VNotif[] }) {
  const [items, setItems] = useState(notifs)
  const unread = items.filter(item => !item.read_at).length
  const markRead = useCallback(async (ids?: string[]) => {
    const target = ids?.length ? new Set(ids) : null
    const now = new Date().toISOString()
    setItems(current => current.map(item => (!target || target.has(item.id)) ? { ...item, read_at: item.read_at ?? now } : item))
    await fetch('/api/vendor/notifications/read', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(ids?.length ? { ids } : {}),
    })
  }, [])
  return (
    <div className="page-anim">
      <div style={{ padding: '22px 20px 6px', display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <h2 className="ty-h2">通知</h2>
        {unread > 0 && <button type="button" onClick={() => markRead()} style={{ border: 'none', background: 'none', color: 'var(--c-blue)', fontFamily: 'inherit', fontSize: '.6rem', cursor: 'pointer' }}>すべて既読にする</button>}
      </div>
      {items.length === 0 ? (
        <p style={{ padding: '40px 20px', fontSize: '.7rem', color: 'var(--muted2)', textAlign: 'center' }}>まだ通知はありません</p>
      ) : items.map(n => (
        <Link key={n.id} href={n.href ?? '/vendor'} onClick={() => { if (!n.read_at) void markRead([n.id]) }} className="lift" style={{ display: 'flex', gap: 12, padding: '14px 20px', borderBottom: '0.5px solid var(--line)', textDecoration: 'none', color: 'var(--txt)', alignItems: 'center', background: n.read_at ? 'transparent' : 'var(--blue-bg2)' }}>
          <Icon type={n.icon} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <b style={{ fontSize: '.78rem', display: 'block', marginBottom: 2, fontWeight: n.read_at ? 500 : 700 }}>{n.title}</b>
            <p style={{ fontSize: '.66rem', color: 'var(--muted2)', margin: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{n.sub}</p>
          </div>
          <span style={{ fontSize: '.56rem', color: 'var(--muted)', flexShrink: 0 }}>{fmt(n.at)}</span>
        </Link>
      ))}
      <div style={{ height: 80 }} />
    </div>
  )
}
