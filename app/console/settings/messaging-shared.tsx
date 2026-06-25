'use client'
import type { Template } from '../messages/MessagesClient'

// Phase3-D②：テンプレ/自動メッセージUIの共有クライアントヘルパー。
// ★純データ（SECTIONS/EXAMPLE 等）は messaging-sections.ts（非client）に分離（サーバーからも import するため）。
// ★UI専用。CRUD API・resolveTemplate/Media・送信ロジックには一切触れない。

export function ChannelBadge({ channel }: { channel: Template['channel'] }) {
  const isLine = channel === 'line'
  const isMail = channel === 'email'
  const label = isLine ? 'LINE用' : isMail ? 'メール用' : channel === 'both' ? 'LINE/メール' : '汎用'
  const color = isLine ? 'var(--c-success)' : isMail ? 'var(--c-info)' : 'var(--t-tertiary)'
  const bg = isLine ? 'rgba(30,158,106,0.1)' : isMail ? 'rgba(55,138,221,0.12)' : 'var(--s-2)'
  return <span style={{ fontSize: '.5rem', fontWeight: 800, color, background: bg, borderRadius: 5, padding: '2px 7px' }}>{label}</span>
}

// イベント別アイコン（LINE=緑系地/メール=青系地）。Tabler相当を inline SVG で。
export function EventIcon({ category, channel, size = 36 }: { category: string; channel: Template['channel']; size?: number }) {
  const isLine = channel === 'line'
  const bg = isLine ? '#E1F5EE' : '#E6F1FB'
  const fg = isLine ? 'var(--c-success)' : 'var(--c-info)'
  const paths: Record<string, React.ReactNode> = {
    greeting: <><path d="M8 9h8M8 13h5" /><path d="M21 12a8 8 0 01-8 8H7l-4 3 1-5a8 8 0 1117-6z" /></>,
    'deal-won': <><path d="M8 21h8M12 17v4M7 4h10v4a5 5 0 01-10 0z" /><path d="M5 6H3v1a3 3 0 003 3M19 6h2v1a3 3 0 01-3 3" /></>,
    recognition: <><path d="M16 21v-2a4 4 0 00-4-4H6a4 4 0 00-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M19 8l2 2 3-3" /></>,
    nudge: <><path d="M18 8a6 6 0 00-12 0c0 7-3 9-3 9h18s-3-2-3-9" /><path d="M13.7 21a2 2 0 01-3.4 0" /></>,
    receipt: <><path d="M4 4h16v16l-3-2-2 2-2-2-2 2-2-2-3 2z" /><path d="M8 9h8M8 13h6" /></>,
    booking: <><rect x="3" y="4" width="18" height="18" rx="2" /><path d="M16 2v4M8 2v4M3 10h18" /></>,
    'payout-confirmed': <><circle cx="12" cy="12" r="9" /><path d="M12 7v10M9.5 9.5h4a1.5 1.5 0 010 3h-3a1.5 1.5 0 000 3h4" /></>,
  }
  return (
    <span style={{ width: size, height: size, borderRadius: 9, background: bg, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
      <svg width={size * 0.5} height={size * 0.5} viewBox="0 0 24 24" fill="none" stroke={fg} strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">{paths[category] ?? <circle cx="12" cy="12" r="9" />}</svg>
    </span>
  )
}

export async function uploadImage(file: File): Promise<{ path: string; previewUrl: string } | null> {
  const dataUrl: string = await new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result as string); r.onerror = rej; r.readAsDataURL(file) })
  const res = await fetch('/api/console/messages/upload', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ filename: file.name, contentType: file.type, contentBase64: dataUrl }) })
  const j = await res.json().catch(() => ({}))
  if (!res.ok || !j.attachment) return null
  return { path: j.attachment.path as string, previewUrl: (j.previewUrl as string) || '' }
}
