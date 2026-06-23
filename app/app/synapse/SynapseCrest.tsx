// SYNAPSE 紋章：ノード（円）＋リンク（線）の小さなSVG。装飾用途・aria-hidden。
// 色は既存トークン（--blue / --blue-dk）＝HOMEノード/リング演出とトーンを統一。1点だけ紫アクセント。
// モーションは globals.css の .syn-node / .syn-link（脈動・shimmer・低振幅）。scanning で順に灯る。
// reduced-motion は globals.css の media query で静止。

const NODES: Array<[cx: number, cy: number, r: number, fill: string, delay: number]> = [
  [24, 24, 4.2, 'var(--blue)', 0],       // 中心
  [9, 13, 2.6, 'var(--blue-dk)', 0.35],
  [40, 11, 2.2, '#7F77DD', 0.7],         // 紫アクセント
  [38, 37, 2.8, 'var(--blue)', 1.05],
  [10, 36, 2.2, 'var(--blue-dk)', 1.4],
  [24, 6, 2, '#7F77DD', 1.75],           // 紫アクセント
]
const LINKS: Array<[x2: number, y2: number, delay: number]> = [
  [9, 13, 0.2], [40, 11, 0.55], [38, 37, 0.9], [10, 36, 1.25], [24, 6, 1.6],
]

export default function SynapseCrest({ size = 74, scanning = false }: { size?: number; scanning?: boolean }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" fill="none" aria-hidden="true" className={scanning ? 'syn-crest syn-crest-scan' : 'syn-crest'}>
      <g stroke="var(--blue)" strokeWidth="1.1" strokeLinecap="round">
        {LINKS.map(([x2, y2, d], i) => (
          <line key={i} className="syn-link" style={{ animationDelay: `${d}s` }} x1="24" y1="24" x2={x2} y2={y2} />
        ))}
      </g>
      {NODES.map(([cx, cy, r, fill, d], i) => (
        <circle key={i} className="syn-node" style={{ animationDelay: `${d}s` }} cx={cx} cy={cy} r={r} fill={fill} />
      ))}
    </svg>
  )
}
