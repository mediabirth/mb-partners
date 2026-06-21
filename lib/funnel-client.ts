'use client'
/**
 * Wave1-⑤：クライアント側ファネル計測（additive・完全非ブロッキング・fire-and-forget）。
 * 既存の共有/送信/閲覧動作には一切割り込まない（後追いで投げるだけ・例外を投げない）。
 */
type TrackOpts = { token?: string | null; channel?: 'mail' | 'line' | 'copy' | 'qr' }

export function trackFunnel(eventType: 'share' | 'landing_view', opts: TrackOpts = {}): void {
  try {
    const body = JSON.stringify({ event_type: eventType, token: opts.token ?? undefined, channel: opts.channel })
    // sendBeacon は描画/遷移をブロックしない。非対応時は keepalive fetch にフォールバック。
    if (typeof navigator !== 'undefined' && navigator.sendBeacon) {
      navigator.sendBeacon('/api/funnel/track', new Blob([body], { type: 'application/json' }))
    } else {
      fetch('/api/funnel/track', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body, keepalive: true }).catch(() => {})
    }
  } catch { /* 計測失敗は無視（UXを止めない） */ }
}
