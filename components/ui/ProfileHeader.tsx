/**
 * F-4：プロフィールヘッダー（3サーフェス共通レイアウト）。アバター＋氏名＋役割/バッジ。
 * avatar には共有 Avatar か AvatarEditor を渡す（表示のみ／本人編集の両対応）。
 */
import React from 'react'

export default function ProfileHeader({ avatar, name, sub, badges }: {
  avatar: React.ReactNode
  name: React.ReactNode
  sub?: React.ReactNode
  badges?: React.ReactNode
}) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 14, margin: '0 20px 16px' }}>
      <div style={{ flexShrink: 0 }}>{avatar}</div>
      <div style={{ minWidth: 0 }}>
        <b style={{ fontSize: '.95rem', display: 'block', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{name}</b>
        {sub && <div style={{ fontSize: 'var(--fs-cap)', color: 'var(--muted2)', marginTop: 2 }}>{sub}</div>}
        {badges && <div style={{ marginTop: 5, display: 'flex', gap: 6, flexWrap: 'wrap' }}>{badges}</div>}
      </div>
    </div>
  )
}
