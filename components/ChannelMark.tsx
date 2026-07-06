/**
 * Batch O ⑥: 関わり方の直感マーク（テキストピル置換）。
 * 紹介＝つなぐ（2ノード＋矢印）/ 協力＝協働（重なる2円）/ 直販＝中立（単一の角丸）。
 * 単色フラット線アイコン＋小ラベル＋tooltip で「読まずに識別」を補助。APP・コンソール共通。
 */
const MAP: Record<string, { label: string; color: string; bg: string; hint: string }> = {
  referral:    { label: '', color: 'var(--blue)',  bg: 'var(--blue-bg)', hint: '' },
  cooperation: { label: '', color: '#3F7D72',       bg: '#E5EFEC',        hint: '' },
  frontier:    { label: '', color: '#3F7D72',       bg: '#E5EFEC',        hint: '' },
  direct:      { label: '直販', color: 'var(--muted2)', bg: 'var(--bg2)',     hint: 'MB直販' },
}

function Mark({ channel }: { channel: string }) {
  if (channel === 'cooperation' || channel === 'frontier') {
    // 協働＝重なる2円
    return <><circle cx="9.5" cy="12" r="5" /><circle cx="14.5" cy="12" r="5" /></>
  }
  if (channel === 'direct') {
    // 中立＝単一の角丸
    return <rect x="6.5" y="6.5" width="11" height="11" rx="3" />
  }
  // 紹介＝2ノードを矢印でつなぐ
  return <>
    <circle cx="5" cy="12" r="2.4" />
    <circle cx="19" cy="12" r="2.4" />
    <path d="M7.6 12h6.9M12.3 9.3 14.9 12l-2.6 2.7" />
  </>
}

export default function ChannelMark({
  channel, showLabel = true, size = 12,
}: { channel: string; showLabel?: boolean; size?: number }) {
  const m = MAP[channel] ?? MAP.direct
  return (
    <span
      title={`${m.label}（${m.hint}）`}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 4,
        fontSize: '.56rem', fontWeight: 700, letterSpacing: '.02em',
        color: m.color, background: m.bg, borderRadius: 4, padding: '2px 8px', whiteSpace: 'nowrap',
      }}
    >
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <Mark channel={channel} />
      </svg>
      {showLabel && m.label}
    </span>
  )
}
