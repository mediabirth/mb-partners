type ColorSpec = { bg: string; fg: string }

// Named color keys (legacy support)
const COLOR_MAP: Record<string, ColorSpec> = {
  'c-blue':   { bg: '#ECE6DA', fg: '#4733E6' },
  'c-purple': { bg: '#F0EAFA', fg: '#7A48D6' },
  'c-amber':  { bg: '#FBF1DF', fg: '#C07A12' },
  'c-green':  { bg: '#E7F6EF', fg: '#1E9E6A' },
  'c-pink':   { bg: '#F9EAF4', fg: '#C2479E' },
  // Common hex values stored in DB
  '#4733e6': { bg: '#ECE6DA', fg: '#4733E6' },
  '#1e9e6a': { bg: '#E7F6EF', fg: '#1E9E6A' },
  '#c07a12': { bg: '#FBF1DF', fg: '#C07A12' },
  '#d34545': { bg: '#FBE9E9', fg: '#D34545' },
  '#0ea5e9': { bg: '#E0F2FE', fg: '#0284c7' },
  '#8b5cf6': { bg: '#ECE6DA', fg: '#7C3AED' },
  '#ec4899': { bg: '#FDF2F8', fg: '#DB2777' },
  '#14b8a6': { bg: '#CCFBF1', fg: '#0F766E' },
}

export function getServiceColors(color: string): ColorSpec {
  const key = (color ?? '').toLowerCase()
  return COLOR_MAP[key] ?? COLOR_MAP[color] ?? { bg: '#ECE6DA', fg: '#4733E6' }
}

function IconShape({ icon }: { icon: string }) {
  switch (icon) {
    case 'home':
      return <path d="M3 10.5L12 4l9 6.5V20a1 1 0 01-1 1h-5v-6h-6v6H4a1 1 0 01-1-1z"/>
    case 'solar':
      return <>
        <circle cx="12" cy="12" r="4"/>
        <path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41"/>
      </>
    case 'insurance':
      return <path d="M12 3l8 4v5c0 5-4 8-8 10C8 20 4 17 4 12V7l8-4zM9 12l2 2 4-4"/>
    case 'tax':
      return <>
        <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/>
        <polyline points="14 2 14 8 20 8"/>
        <line x1="9" y1="13" x2="15" y2="13"/>
        <line x1="9" y1="17" x2="13" y2="17"/>
      </>
    case 'estate':
      return <>
        <rect x="3" y="9" width="18" height="13" rx="1"/>
        <path d="M8 9V5a2 2 0 012-2h4a2 2 0 012 2v4"/>
        <line x1="12" y1="13" x2="12" y2="17"/>
        <line x1="10" y1="15" x2="14" y2="15"/>
      </>
    case 'medical':
      return <>
        <path d="M22 12h-4l-3 9L9 3l-3 9H2"/>
      </>
    case 'fund':
      return <>
        <polyline points="22 7 13.5 15.5 8.5 10.5 2 17"/>
        <polyline points="16 7 22 7 22 13"/>
      </>
    case 'card':
      return <>
        <rect x="2" y="5" width="20" height="14" rx="2"/>
        <line x1="2" y1="10" x2="22" y2="10"/>
        <line x1="6" y1="15" x2="10" y2="15"/>
      </>
    case 'car':
      return <>
        <path d="M5 17H3v-4l2.5-5h13l2.5 5v4h-2"/>
        <circle cx="7.5" cy="17" r="2"/>
        <circle cx="16.5" cy="17" r="2"/>
        <path d="M5 13h14"/>
      </>
    case 'circles':
      return <><circle cx="9" cy="12" r="5.5"/><circle cx="15.5" cy="12" r="5.5"/></>
    case 'aperture':
      return <><circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="3.4"/></>
    case 'mic':
      return <>
        <rect x="9" y="3.5" width="6" height="11" rx="3"/>
        <path d="M5.5 11.5a6.5 6.5 0 0013 0M12 18v3"/>
      </>
    default:
      return <path d="M5 19L19 5M5 5h6v6M19 19h-6v-6"/>
  }
}

export default function ServiceIcon({
  icon, color, size = 38,
}: { icon: string; color: string; size?: number }) {
  const c = getServiceColors(color)
  const r = size <= 32 ? 9 : size <= 42 ? 11 : 13
  const sw = Math.round(size * 0.5)
  return (
    <span style={{
      width: size, height: size, borderRadius: r, flexShrink: 0,
      background: c.bg,
      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
    }}>
      <svg width={sw} height={sw} viewBox="0 0 24 24" fill="none" stroke={c.fg} strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
        <IconShape icon={icon} />
      </svg>
    </span>
  )
}
