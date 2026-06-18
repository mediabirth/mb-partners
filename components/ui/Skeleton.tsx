/**
 * F-2：Skeleton — ロード中プレースホルダ。shimmer は globals.css の @keyframes skeleton-shimmer を利用。
 */
import React from 'react'

export type SkeletonProps = {
  w?: number | string
  h?: number | string
  radius?: number | string
  style?: React.CSSProperties
}

export default function Skeleton({ w = '100%', h = 14, radius = 'var(--radius-sm)', style }: SkeletonProps) {
  return (
    <div
      className="skeleton"
      style={{ width: w, height: h, borderRadius: radius, background: 'var(--bg2)', ...style }}
      aria-hidden
    />
  )
}
