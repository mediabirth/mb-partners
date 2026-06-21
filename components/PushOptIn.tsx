'use client'
/**
 * Wave1-④a：初回紹介の完了直後に出す“ソフト前置き”の通知許可取得。
 * ［受け取る］時のみネイティブ Notification.requestPermission()→購読（ワンショット許可を無駄撃ちしない）。
 * 非対応/拒否済/許可済/既出は非表示（グレースフル）。お金・案件状態には非接触。
 */
import { useEffect, useState } from 'react'
import { pushSupported, subscribePush } from '@/lib/push-client'

const FLAG = 'mbp-push-asked'

export default function PushOptIn() {
  const [show, setShow]   = useState(false)
  const [state, setState] = useState<'idle' | 'busy' | 'on' | 'later'>('idle')

  useEffect(() => {
    if (!pushSupported()) return
    try {
      // 未購読かつ未拒否（permission==='default'）かつ未提示のときだけ出す。
      if (Notification.permission !== 'default') return
      if (localStorage.getItem(FLAG)) return
      setShow(true)
    } catch { /* feature 不可 → 出さない */ }
  }, [])

  if (!show || state === 'later') return null

  async function accept() {
    setState('busy')
    const ok = await subscribePush()
    try { localStorage.setItem(FLAG, '1') } catch { /* noop */ }
    setState(ok ? 'on' : 'later')
  }
  function later() {
    try { localStorage.setItem(FLAG, '1') } catch { /* noop */ }
    setState('later')
  }

  if (state === 'on') return (
    <div style={{ width: '100%', maxWidth: 320, background: 'var(--green-bg)', border: '1px solid var(--green)', borderRadius: 12, padding: '12px 14px', fontSize: '.72rem', fontWeight: 700, color: 'var(--green)', textAlign: 'center' }}>
      ✓ 通知をオンにしました
    </div>
  )

  return (
    <div style={{ width: '100%', maxWidth: 320, background: 'var(--blue-bg2)', border: '1px solid var(--blue-bg)', borderRadius: 12, padding: '14px 16px', textAlign: 'left' }}>
      <b style={{ fontSize: '.8rem', color: 'var(--blue-dk)', display: 'block', marginBottom: 4 }}>成約したら、いち早くお知らせします</b>
      <p style={{ fontSize: '.66rem', color: '#52529E', lineHeight: 1.6, margin: '0 0 12px' }}>通知を受け取りますか？（後から設定で変更できます）</p>
      <div style={{ display: 'flex', gap: 8 }}>
        <button onClick={accept} disabled={state === 'busy'} className="btn btn-p lift" style={{ flex: 1, minHeight: 44 }}>
          {state === 'busy' ? '設定中…' : '受け取る'}
        </button>
        <button onClick={later} className="btn btn-g lift" style={{ flex: 1, minHeight: 44 }}>あとで</button>
      </div>
    </div>
  )
}
