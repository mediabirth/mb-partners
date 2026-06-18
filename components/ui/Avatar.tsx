/**
 * F-2/F-4：Avatar — 人/パートナー用アバター。画像(src)があれば表示、無ければイニシャル＋色。
 * 画像はイニシャル円の上に重ねて描画するため、404時はイニシャルにフォールバック（JS不要・サーバー安全）。
 * color は hex か c-* 名（ServiceAvatar と同じ getServiceColors 相当）。BR-0トークン参照。
 */
import React from 'react'

const NAMED: Record<string, { bg: string; fg: string }> = {
  'c-blue':   { bg: '#EDEBFC', fg: '#4733E6' },
  'c-purple': { bg: '#F0EAFA', fg: '#7A48D6' },
  'c-amber':  { bg: '#FBF1DF', fg: '#C07A12' },
  'c-green':  { bg: '#E7F6EF', fg: '#1E9E6A' },
  'c-pink':   { bg: '#F9EAF4', fg: '#C2479E' },
}

function colorsOf(color?: string | null): { bg: string; fg: string } {
  if (color && NAMED[color]) return NAMED[color]
  if (color && /^#/.test(color)) return { bg: color, fg: '#fff' }
  return { bg: 'var(--blue)', fg: '#fff' }
}

export type AvatarProps = {
  name?: string | null
  color?: string | null
  src?: string | null
  size?: number
  style?: React.CSSProperties
}

export default function Avatar({ name, color, src, size = 32, style }: AvatarProps) {
  const { bg, fg } = colorsOf(color)
  const initial = (name ?? '').trim().charAt(0) || '?'
  return (
    <span
      style={{
        position: 'relative', width: size, height: size, borderRadius: '50%', flexShrink: 0,
        background: bg, color: fg, display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        fontFamily: 'Inter', fontWeight: 'var(--fw-strong)' as unknown as number,
        fontSize: Math.max(10, Math.round(size * 0.42)), lineHeight: 1, userSelect: 'none', overflow: 'hidden',
        ...style,
      }}
      aria-hidden
    >
      {initial}
      {src && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt="" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} />
      )}
    </span>
  )
}
