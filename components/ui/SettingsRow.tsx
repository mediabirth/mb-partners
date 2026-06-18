/**
 * BR-V2：設定の共有行コンポーネント（app / vendor で完全一致）。partnerアプリと同じ見た目・操作。
 * SettingsRow＝リンク行、NotiRow＝通知チャネルの状態表示。純プレゼンテーション。BR-0トークン参照。
 */
import React from 'react'
import Link from 'next/link'

export function SettingsRow({ href, onClick, children, last }: {
  href?: string
  onClick?: () => void
  children: React.ReactNode
  last?: boolean
}) {
  const css: React.CSSProperties = {
    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
    padding: '15px', borderBottom: last ? 'none' : '1px solid #F2F2F6',
    fontSize: 'var(--fs-sub)', textDecoration: 'none', color: 'var(--txt)', cursor: 'pointer',
  }
  const inner = <><span>{children}</span><span style={{ color: 'var(--muted)' }}>›</span></>
  return href ? <Link href={href} style={css}>{inner}</Link> : <div onClick={onClick} style={css}>{inner}</div>
}

export function NotiRow({ title, desc, state, last }: {
  title: string; desc: string; state: 'on' | 'soon'; last?: boolean
}) {
  const on = state === 'on'
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, padding: '14px 15px', borderBottom: last ? 'none' : '1px solid #F2F2F6' }}>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 'var(--fs-sub)', color: 'var(--txt)', fontWeight: 'var(--fw-head)' as unknown as number }}>{title}</div>
        <div style={{ fontSize: 'var(--fs-cap)', color: 'var(--muted)', marginTop: 2 }}>{desc}</div>
      </div>
      <span style={{ flexShrink: 0, fontSize: 'var(--fs-cap)', fontWeight: 700, padding: '3px 10px', borderRadius: 'var(--radius-pill)', color: on ? 'var(--green)' : 'var(--muted2)', background: on ? 'var(--green-bg)' : 'var(--bg2)', border: on ? 'none' : '1px solid var(--line)' }}>{on ? '有効' : '準備中'}</span>
    </div>
  )
}
