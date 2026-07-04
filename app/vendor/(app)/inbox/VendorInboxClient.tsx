'use client'
/**
 * ベンダー通知 — APP と同じ3タブ文法（すべて / あなた宛 / お知らせ）。
 * あなた宛 = deriveVendorNotifs（経費承認・却下・支払・アサイン等の派生イベント・DDLレス）。
 * お知らせ = broadcasts（運営配信の news）。detail は APP 同様のヒーロー付き本文ビュー。
 * ベンダー固有要素は保持: VNotif の icon セット・deep link href・お客さま敬称ラベル。read-state は持たない（派生・DDLレス）。
 */
import { useState } from 'react'
import Link from 'next/link'
import type { VNotif } from '@/lib/vendor-data'

export type VBroadcast = { id: string; kind: string; title: string; body: string | null; sent_at: string | null }

const fmt = (iso: string) => { const d = new Date(iso); return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString('ja', { timeZone: 'Asia/Tokyo', month: 'numeric', day: 'numeric' }) }
const fmtFull = (iso: string) => new Date(iso).toLocaleString('ja', { timeZone: 'Asia/Tokyo', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })

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
function NewsIcon() {
  return <span style={{ width: 34, height: 34, borderRadius: '50%', background: 'var(--bg2)', color: 'var(--muted2)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9"><path d="M4 11a9 9 0 019 9M4 4a16 16 0 0116 16" /><circle cx="5" cy="19" r="1.6" /></svg>
  </span>
}

function NotifRow({ n }: { n: VNotif }) {
  return (
    <Link href={n.href ?? '/vendor'} className="lift" style={{ display: 'flex', gap: 12, padding: '14px 20px', borderBottom: '0.5px solid var(--line)', textDecoration: 'none', color: 'var(--txt)', alignItems: 'center' }}>
      <Icon type={n.icon} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <b style={{ fontSize: '.78rem', display: 'block', marginBottom: 2 }}>{n.title}</b>
        <p style={{ fontSize: '.66rem', color: 'var(--muted2)', margin: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{n.sub}</p>
      </div>
      <span style={{ fontSize: '.56rem', color: 'var(--muted)', flexShrink: 0 }}>{fmt(n.at)}</span>
    </Link>
  )
}
function BroadcastRow({ b, onClick }: { b: VBroadcast; onClick: () => void }) {
  const hasDetail = !!b.body
  return (
    <div onClick={hasDetail ? onClick : undefined} className="lift" style={{ display: 'flex', gap: 12, padding: '14px 20px', borderBottom: '0.5px solid var(--line)', alignItems: 'flex-start', cursor: hasDetail ? 'pointer' : 'default' }}>
      <NewsIcon />
      <div style={{ flex: 1, minWidth: 0 }}>
        <span className="chip" style={{ marginBottom: 4, background: 'var(--bg2)', color: 'var(--muted2)' }}>お知らせ</span>
        <b style={{ fontSize: '.78rem', display: 'block', marginBottom: 2 }}>{b.title}</b>
        {b.body && <p style={{ fontSize: '.66rem', color: 'var(--muted2)', margin: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{b.body}</p>}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4, flexShrink: 0 }}>
        {b.sent_at && <span style={{ fontSize: '.56rem', color: 'var(--muted)' }}>{fmt(b.sent_at)}</span>}
        {hasDetail && <span style={{ fontSize: '.7rem', color: 'var(--muted)' }}>›</span>}
      </div>
    </div>
  )
}
function Empty({ label }: { label: string }) {
  return <p style={{ padding: '40px 20px', fontSize: '.7rem', color: 'var(--muted2)', textAlign: 'center' }}>{label}</p>
}

export default function VendorInboxClient({ notifs, broadcasts }: { notifs: VNotif[]; broadcasts: VBroadcast[] }) {
  const [tab, setTab] = useState<'all' | 'personal' | 'news'>('all')
  const [detail, setDetail] = useState<VBroadcast | null>(null)

  if (detail) {
    return (
      <div className="page-anim">
        <button onClick={() => setDetail(null)} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: '.7rem', color: 'var(--muted2)', padding: '14px 20px 0', fontWeight: 500, background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit' }}>← 通知一覧</button>
        <div style={{ padding: '8px 22px 24px' }}>
          <div style={{ fontSize: '.5rem', fontFamily: 'Inter', fontWeight: 500, letterSpacing: '.2em', textTransform: 'uppercase', marginBottom: 6, color: 'var(--muted2)' }}>お知らせ</div>
          <h1 style={{ fontSize: '1.18rem', fontWeight: 500, marginBottom: 4, lineHeight: 1.5 }}>{detail.title}</h1>
          <span style={{ fontSize: '.62rem', color: 'var(--muted)', marginBottom: 14, display: 'block' }}>{detail.sent_at ? fmtFull(detail.sent_at) : ''}</span>
          <div style={{ height: 150, borderRadius: 14, marginBottom: 6, display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative', overflow: 'hidden', background: 'linear-gradient(130deg,#4733E6,#8A7BFF)' }}>
            <svg width="54" height="54" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="1.6" opacity=".95"><path d="M4 11a9 9 0 019 9M4 4a16 16 0 0116 16" /><circle cx="5" cy="19" r="1.6" /></svg>
            <div style={{ position: 'absolute', right: -30, top: -30, width: 110, height: 110, borderRadius: '50%', border: '1.5px solid rgba(255,255,255,.3)' }} />
          </div>
          {detail.body && <div style={{ fontSize: '.78rem', lineHeight: 1.95, color: '#2E2E38', marginTop: 16, whiteSpace: 'pre-wrap' }}>{detail.body}</div>}
        </div>
      </div>
    )
  }

  const news = broadcasts.filter(b => b.kind === 'news')
  return (
    <div className="page-anim">
      <div style={{ padding: '22px 20px 0' }}>
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 14 }}>
          <h2 className="ty-h2">通知</h2>
        </div>
        <div style={{ display: 'flex', background: 'var(--bg2)', borderRadius: 10, padding: 4, marginBottom: 14 }}>
          {([['all', 'すべて'], ['personal', 'あなた宛'], ['news', 'お知らせ']] as const).map(([val, lbl]) => (
            <button key={val} onClick={() => setTab(val)} style={{ flex: 1, border: 'none', padding: '9px 2px', borderRadius: 8, fontSize: '.7rem', fontWeight: 500, cursor: 'pointer', fontFamily: 'inherit', color: tab === val ? 'var(--txt)' : 'var(--muted2)', background: tab === val ? '#fff' : 'transparent', boxShadow: tab === val ? '0 2px 8px rgba(14,14,20,.08)' : 'none', transition: 'all .25s' }}>
              {lbl}
            </button>
          ))}
        </div>
      </div>

      {tab === 'all' && (notifs.length === 0 && news.length === 0
        ? <Empty label="通知はありません" />
        : <>{notifs.map(n => <NotifRow key={n.id} n={n} />)}{news.map(b => <BroadcastRow key={b.id} b={b} onClick={() => setDetail(b)} />)}</>)}
      {tab === 'personal' && (notifs.length === 0 ? <Empty label="あなた宛の通知はありません" /> : notifs.map(n => <NotifRow key={n.id} n={n} />))}
      {tab === 'news' && (news.length === 0 ? <Empty label="お知らせはありません" /> : news.map(b => <BroadcastRow key={b.id} b={b} onClick={() => setDetail(b)} />))}

      <div style={{ height: 80 }} />
    </div>
  )
}
