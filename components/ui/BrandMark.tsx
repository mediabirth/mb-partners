/**
 * MB Partners ブランドマーク（案3・多様なつながり）— 全接点共通の単一ソース。
 * 中央ハブ＋5ノード（四角/丸・塗り/線の混在）。既定は配色版、mono指定で単色化。
 * 常時アニメ（衛星ノードの順次点滅＋リンク明滅）は globals.css の .mbmark で付与（reduced-motion尊重）。
 * 純プレゼンテーション（機能・money非接触）。
 */
import React from 'react'

export default function BrandMark({ size = 26, mono, animated = true, style }: {
  size?: number
  mono?: string        // 指定色で単色化（例: '#fff'）。未指定は配色版（indigo＋violetアクセント）。
  animated?: boolean    // 常時アニメ（既定on）。offで静止。
  style?: React.CSSProperties
}) {
  const c = mono || '#4733E6'
  const acc = mono || '#8B5CF6'
  return (
    <span className={animated ? 'mbmark' : undefined} style={{ display: 'inline-flex', lineHeight: 0, ...style }}>
      <svg width={size} height={size} viewBox="0 0 48 48" fill="none" aria-hidden>
        <g stroke={c} strokeWidth="2.2" strokeLinecap="round" opacity="0.4">
          <line x1="24" y1="24" x2="24" y2="7" /><line x1="24" y1="24" x2="39" y2="14" /><line x1="24" y1="24" x2="37" y2="37" /><line x1="24" y1="24" x2="10" y2="37" /><line x1="24" y1="24" x2="8" y2="21" />
        </g>
        <rect x="20.5" y="4" width="7" height="7" rx="1.8" fill={c} />
        <circle cx="39" cy="14" r="3.6" fill={acc} />
        <rect x="33.5" y="33.5" width="7.5" height="7.5" rx="2.2" stroke={c} strokeWidth="2.4" />
        <circle cx="10" cy="37" r="4" fill={c} />
        <circle cx="8" cy="21" r="2.8" stroke={c} strokeWidth="2.4" />
        <rect x="18.5" y="18.5" width="11" height="11" rx="3" fill={c} />
      </svg>
    </span>
  )
}
