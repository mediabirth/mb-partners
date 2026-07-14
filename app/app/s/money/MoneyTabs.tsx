'use client'
/**
 * お金の統合タブ（洗練 2026-07-14）— MBコンソール「支払」と同一文法（topbar内トグル・URL ?tab 同期・hydration安全）。
 * パネルはサーバで描画済みのReactNodeを受け取り表示切替のみ（データ/計算はサーバ側＝money非接触）。
 */
import { useEffect, useState } from 'react'
import PageGuide, { type PageGuideData } from '@/components/PageGuide'

export default function MoneyTabs({ guide, pay, receive }: { guide: PageGuideData; pay: React.ReactNode; receive: React.ReactNode }) {
  // SSRは常に pay で描画し、?tab はマウント後に反映（hydration不一致=React#418回避・MB支払と同方式）
  const [tab, setTab] = useState<'pay' | 'receive'>('pay')
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get('tab') === 'receive') setTab('receive')
  }, [])
  function switchTab(t: 'pay' | 'receive') {
    setTab(t)
    window.history.replaceState(null, '', t === 'receive' ? '/app/s/money?tab=receive' : '/app/s/money')
  }
  return (
    <>
      {/* 狭幅ではタブが2行目に折返し（375px横溢れゼロ）・タブ容器は自身の内部スクロールで包む */}
      <div className="console-topbar" style={{ background: 'rgba(255,255,255,.92)', backdropFilter: 'blur(10px)', borderBottom: '0.5px solid var(--line)', padding: '13px 28px', display: 'flex', alignItems: 'center', gap: 12, position: 'sticky', top: 0, zIndex: 30, flexWrap: 'wrap' }}>
        <span style={{ flex: '1 1 auto', display: 'inline-flex', alignItems: 'center', gap: 7 }}>
          <h1 style={{ fontSize: '1rem', fontWeight: 500 }}>お金</h1>
          <PageGuide data={guide} />
        </span>
        <div style={{ display: 'flex', background: 'var(--bg2)', borderRadius: 9, padding: 3, maxWidth: '100%', overflowX: 'auto' }}>
          {([['pay', 'お支払い（MB Partnersへ）'], ['receive', 'お受け取り（あなたへ）']] as const).map(([v, lbl]) => (
            <button key={v} onClick={() => switchTab(v)} style={{
              border: 'none', cursor: 'pointer', fontFamily: 'inherit', fontSize: '.72rem', fontWeight: 500,
              padding: '7px 14px', borderRadius: 7, whiteSpace: 'nowrap',
              color: tab === v ? 'var(--txt)' : 'var(--muted2)',
              background: tab === v ? '#fff' : 'transparent',
              boxShadow: tab === v ? '0 1px 4px rgba(14,14,20,.1)' : 'none',
            }}>{lbl}</button>
          ))}
        </div>
      </div>
      <div style={{ display: tab === 'pay' ? 'block' : 'none' }}>{pay}</div>
      <div style={{ display: tab === 'receive' ? 'block' : 'none' }}>{receive}</div>
    </>
  )
}
