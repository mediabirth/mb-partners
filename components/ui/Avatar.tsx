/**
 * Avatar — 人/パートナー用アバター（3面共通）。画像(src)があれば表示、無ければ人型シルエット。
 * ④勝彦明示許可：画像未設定フォールバックを「頭文字1文字」→「人型シルエット（muted色＋surface背景）」に変更。
 * ★ブランド/サービスのアイコン（ServiceAvatar）は対象外。size は現行踏襲。
 */
import React from 'react'

export type AvatarProps = {
  name?: string | null
  color?: string | null
  src?: string | null
  size?: number
  style?: React.CSSProperties
}

export default function Avatar({ src, size = 32, style }: AvatarProps) {
  return (
    <span
      style={{
        position: 'relative', width: size, height: size, borderRadius: '50%', flexShrink: 0,
        background: 'var(--bg2)', color: 'var(--muted)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        overflow: 'hidden', ...style,
      }}
      aria-hidden
    >
      {/* 人型シルエット（画像未設定時のフォールバック） */}
      <svg width={Math.round(size * 0.62)} height={Math.round(size * 0.62)} viewBox="0 0 24 24" fill="currentColor">
        <path d="M12 12.4a4.2 4.2 0 1 0 0-8.4 4.2 4.2 0 0 0 0 8.4Zm0 1.7c-3.55 0-6.9 1.86-6.9 4.55V20a.75.75 0 0 0 .75.75h12.3A.75.75 0 0 0 18.9 20v-1.35c0-2.69-3.35-4.55-6.9-4.55Z" />
      </svg>
      {src && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt="" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} />
      )}
    </span>
  )
}
