'use client'
import { useState } from 'react'
import { getServiceColors } from './ServiceIcon'

/**
 * サービスのアバター表示。必ず解決する。
 * - logoPath があればロゴ画像。
 * - logoPath が無い／画像の読み込みに失敗した場合は、破線円プレースホルダや壊れ画像ではなく
 *   サービス頭文字のクリーンなモノグラム（サービス色の淡色面＋濃色の頭文字）へフォールバック。
 * 一覧・ボード・案件詳細で同一の見た目を共有する。
 */
export default function ServiceAvatar({
  logoPath, color, name, size = 44,
}: { logoPath?: string | null; icon?: string; color: string; name: string; size?: number }) {
  const [errored, setErrored] = useState(false)
  const r = Math.round(size / 4)

  if (logoPath && !errored) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={logoPath}
        alt={name}
        width={size}
        height={size}
        onError={() => setErrored(true)}
        style={{ borderRadius: r, objectFit: 'cover', border: '1px solid var(--line)', flexShrink: 0, background: '#fff' }}
      />
    )
  }

  // クリーンなモノグラム（未解決時のフォールバック）
  const c = getServiceColors(color)
  const letter = (name?.trim()?.[0] ?? '#').toUpperCase()
  return (
    <span
      aria-label={name}
      style={{
        width: size, height: size, borderRadius: r, flexShrink: 0,
        background: c.bg, color: c.fg, border: '1px solid var(--line)',
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        fontFamily: 'Inter', fontWeight: 800, fontSize: Math.round(size * 0.42),
        lineHeight: 1, userSelect: 'none',
      }}
    >
      {letter}
    </span>
  )
}
