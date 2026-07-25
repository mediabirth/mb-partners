/**
 * Server-Timing の恒久計測。値や認証判断には一切使わず、応答ヘッダだけに出す。
 * Edge / Node.js の両runtimeで同じコードを使えるよう Web標準APIだけに限定する。
 */
export type ServerTimingEntry = { name: string; duration: number; description?: string }

export function timingNow(): number {
  return performance.now()
}

export function timingEntry(name: string, startedAt: number, description?: string): ServerTimingEntry {
  return { name, duration: Math.max(0, timingNow() - startedAt), description }
}

export function serverTimingHeader(entries: ServerTimingEntry[]): string {
  return entries.map(({ name, duration, description }) => {
    const safeName = name.replace(/[^a-zA-Z0-9_-]/g, '-')
    const desc = description ? `;desc="${description.replace(/["\\]/g, '')}"` : ''
    return `${safeName};dur=${duration.toFixed(1)}${desc}`
  }).join(', ')
}
