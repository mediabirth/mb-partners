/**
 * F-2：ListRow — クリック可能な行（左 leading＋本文＋右 trailing＋シェブロン）。
 * 既存の row-hover/lift 演出を共通化。as で <a>(Link) か <div> を選べる。挙動は親が制御。
 */
import React from 'react'

export type ListRowProps = {
  leading?: React.ReactNode
  title: React.ReactNode
  subtitle?: React.ReactNode
  trailing?: React.ReactNode
  chevron?: boolean
  onClick?: () => void
  href?: string
  divider?: boolean
  style?: React.CSSProperties
}

export default function ListRow({ leading, title, subtitle, trailing, chevron = true, onClick, href, divider = true, style }: ListRowProps) {
  const inner = (
    <>
      {leading}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 'var(--fs-sub)', fontWeight: 'var(--fw-head)' as unknown as number, color: 'var(--txt)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{title}</div>
        {subtitle != null && <div style={{ fontSize: 'var(--fs-cap)', color: 'var(--muted2)', marginTop: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{subtitle}</div>}
      </div>
      {trailing}
      {chevron && <span style={{ color: 'var(--muted)', fontSize: 'var(--fs-sub)', flexShrink: 0 }}>›</span>}
    </>
  )
  const css: React.CSSProperties = {
    display: 'flex', gap: 'var(--sp-3)', padding: '13px 14px', alignItems: 'center',
    textDecoration: 'none', color: 'var(--txt)',
    borderBottom: divider ? '1px solid #F2F2F6' : 'none', ...style,
  }
  if (href) return <a href={href} className="row-hover lift" style={css}>{inner}</a>
  return <div onClick={onClick} className="row-hover lift" style={{ ...css, cursor: onClick ? 'pointer' : 'default' }}>{inner}</div>
}
