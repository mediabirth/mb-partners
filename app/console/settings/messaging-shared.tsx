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

export async function uploadImage(file: File): Promise<{ path: string; previewUrl: string } | null> {
  const dataUrl: string = await new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result as string); r.onerror = rej; r.readAsDataURL(file) })
  const res = await fetch('/api/console/messages/upload', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ filename: file.name, contentType: file.type, contentBase64: dataUrl }) })
  const j = await res.json().catch(() => ({}))
  if (!res.ok || !j.attachment) return null
  return { path: j.attachment.path as string, previewUrl: (j.previewUrl as string) || '' }
}
