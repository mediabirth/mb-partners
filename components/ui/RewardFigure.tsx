import React from 'react'

// デザインシステム v3 署名コンポーネント「RewardFigure」。
//  報酬＝本アプリで唯一インディゴを地ではなく“署名”として立ててよい情報。
//  旧 RewardPill（薄紫地＋999px）を廃止し、「インディゴの下線付き等幅数字」へ。
//  地色なし・角丸なし・下線はインディゴ1.5px。数字は tnum（等幅）。使用量を絞るほど色は強くなる。
export default function RewardFigure({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <span
      className="tnum"
      style={{
        display: 'inline-flex', alignItems: 'baseline',
        fontSize: 12, fontWeight: 500, lineHeight: 1.35,
        color: 'var(--blue)',
        borderBottom: '1.5px solid var(--blue)',
        paddingBottom: 1, whiteSpace: 'nowrap',
        fontFamily: 'inherit', fontFeatureSettings: '"tnum"',
        ...style,
      }}
    >
      {children}
    </span>
  )
}
