// SYNAPSE 紋章：ノード（円）＋リンク（線）の小さなSVG。装飾用途・aria-hidden。
// 色は既存トークン（--blue / --blue-dk）＝HOMEノード/リング演出とトーンを統一。1点だけ紫アクセント。
// モーションは globals.css の .syn-node / .syn-link（脈動・shimmer・低振幅）。scanning で順に灯る。
// reduced-motion は globals.css の media query で静止。

// [cx, cy, r, delay, accent?]。色は tone で切替（default=ブルー系トークン／light=濃色背景向けの白系）。
const NODES: Array<[cx: number, cy: number, r: number, delay: number, accent?: boolean]> = [
  [24, 24, 4.2, 0],            // 中心
  [9, 13, 2.6, 0.35],
  [40, 11, 2.2, 0.7, true],    // アクセント
  [38, 37, 2.8, 1.05],
  [10, 36, 2.2, 1.4],
  [24, 6, 2, 1.75, true],      // アクセント
]
const LINKS: Array<[x2: number, y2: number, delay: number]> = [
  [9, 13, 0.2], [40, 11, 0.55], [38, 37, 0.9], [10, 36, 1.25], [24, 6, 1.6],
]

export default function SynapseCrest({ size = 74, scanning = false, tone = 'default' }: { size?: number; scanning?: boolean; tone?: 'default' | 'light' }) {
  const light = tone === 'light'
  const linkColor = light ? 'rgba(255,255,255,.55)' : 'var(--blue)'
  const nodeColor = (accent?: boolean) => light
    ? (accent ? 'rgba(255,255,255,.95)' : 'rgba(255,255,255,.78)')
    : (accent ? '#7F77DD' : 'var(--blue)')
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" fill="none" aria-hidden="true" className={scanning ? 'syn-crest syn-crest-scan' : 'syn-crest'}>
      <g stroke={linkColor} strokeWidth="1.1" strokeLinecap="round">
        {LINKS.map(([x2, y2, d], i) => (
          <line key={i} className="syn-link" style={{ animationDelay: `${d}s` }} x1="24" y1="24" x2={x2} y2={y2} />
        ))}
      </g>
      {NODES.map(([cx, cy, r, d, accent], i) => (
        <circle key={i} className="syn-node" style={{ animationDelay: `${d}s` }} cx={cx} cy={cy} r={r} fill={nodeColor(accent)} />
      ))}
    </svg>
  )
}
