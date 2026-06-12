const colorMap: Record<string, { bg: string; fg: string }> = {
  'c-blue':   { bg: '#EDEBFC', fg: '#4733E6' },
  'c-purple': { bg: '#F0EAFA', fg: '#7A48D6' },
  'c-amber':  { bg: '#FBF1DF', fg: '#D98914' },
  'c-green':  { bg: '#E5F3F1', fg: '#15917E' },
  'c-pink':   { bg: '#F9EAF4', fg: '#C2479E' },
}

function IconShape({ icon }: { icon: string }) {
  switch (icon) {
    case 'home':
      return <path d="M3 10.5L12 4l9 6.5V20a1 1 0 01-1 1h-5v-6h-6v6H4a1 1 0 01-1-1z"/>
    case 'circles':
      return <><circle cx="9" cy="12" r="5.5"/><circle cx="15.5" cy="12" r="5.5"/></>
    case 'aperture':
      return <><circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="3.4"/></>
    case 'mic':
      return <>
        <rect x="9" y="3.5" width="6" height="11" rx="3"/>
        <path d="M5.5 11.5a6.5 6.5 0 0013 0M12 18v3"/>
      </>
    default: // 'arrows'
      return <path d="M5 19L19 5M5 5h6v6M19 19h-6v-6"/>
  }
}

export default function ServiceIcon({
  icon, color, size = 38,
}: { icon: string; color: string; size?: number }) {
  const c = colorMap[color] ?? colorMap['c-blue']
  const r = size <= 32 ? 9 : size <= 42 ? 11 : 13
  const sw = Math.round(size * 0.5)
  return (
    <span style={{
      width: size, height: size, borderRadius: r, flexShrink: 0,
      background: c.bg, color: c.fg,
      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
    }}>
      <svg width={sw} height={sw} viewBox="0 0 24 24" fill="none" stroke={c.fg} strokeWidth="1.9">
        <IconShape icon={icon} />
      </svg>
    </span>
  )
}
