'use client'
/**
 * 磨き③: プッシュ通知の実トグル（張りぼて「準備中」の解消）。
 * インフラ（VAPID・/api/push/subscribe/unsubscribe・SW・webpushチャネル）は完成済みで、
 * UIだけが未配線だった。端末の購読状態を読み、切替で subscribe/unsubscribe を実行。
 * 非対応環境（iOSの非PWA等）は「未対応」を静かに表示。
 */
import { useEffect, useState } from 'react'
import { pushSupported, subscribePush, unsubscribePush } from '@/lib/push-client'

type State = 'loading' | 'unsupported' | 'denied' | 'off' | 'on' | 'busy'

export default function PushToggle() {
  const [state, setState] = useState<State>('loading')

  useEffect(() => {
    (async () => {
      try {
        if (!pushSupported()) { setState('unsupported'); return }
        if (Notification.permission === 'denied') { setState('denied'); return }
        const reg = await navigator.serviceWorker.ready
        const sub = await reg.pushManager.getSubscription()
        setState(sub ? 'on' : 'off')
      } catch { setState('unsupported') }
    })()
  }, [])

  async function toggle() {
    if (state === 'on') {
      setState('busy')
      await unsubscribePush()
      setState('off')
    } else if (state === 'off') {
      setState('busy')
      const ok = await subscribePush()
      setState(ok ? 'on' : (Notification.permission === 'denied' ? 'denied' : 'off'))
    }
  }

  if (state === 'loading') return <span style={{ flexShrink: 0, width: 40 }} />
  if (state === 'unsupported' || state === 'denied') {
    return (
      <span style={{ flexShrink: 0, fontSize: 'var(--fs-cap)', fontWeight: 500, padding: '3px 10px', borderRadius: 20, color: 'var(--muted2)', background: 'var(--bg2)', border: '0.5px solid var(--line)' }}>
        {state === 'denied' ? 'ブラウザで拒否中' : 'この環境では未対応'}
      </span>
    )
  }
  const on = state === 'on'
  return (
    <button type="button" onClick={toggle} disabled={state === 'busy'} aria-label={`プッシュ通知を${on ? 'オフ' : 'オン'}にする`}
      style={{
        flexShrink: 0, width: 44, height: 26, borderRadius: 20, border: 'none', cursor: 'pointer', padding: 2,
        background: on ? 'var(--c-blue)' : 'var(--line)', transition: 'background 150ms ease-out', opacity: state === 'busy' ? .6 : 1,
      }}>
      <span style={{
        display: 'block', width: 22, height: 22, borderRadius: '50%', background: '#fff',
        transform: `translateX(${on ? 18 : 0}px)`, transition: 'transform 150ms ease-out',
        boxShadow: '0 1px 3px rgba(14,14,20,.2)',
      }} />
    </button>
  )
}
