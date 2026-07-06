import React from 'react'

// デザインシステム改定：報酬は本アプリで唯一、常に accent ピルで語ってよい情報（情報ピル全廃の唯一の例外）。
// 報酬ピル＝bg-accent薄＋text-accent・12px・値のみ500・999px角丸。全箇所でこの共通コンポーネントを使う。
export default function RewardPill({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <span style={{ display: 'inline-block', fontSize: 12, fontWeight: 500, color: 'var(--c-blue)', background: 'var(--blue-bg)', borderRadius: 999, padding: '2px 10px', whiteSpace: 'nowrap', fontFamily: 'inherit', ...style }}>
      {children}
    </span>
  )
}
