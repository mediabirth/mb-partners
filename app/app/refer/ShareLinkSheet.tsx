'use client'
/**
 * 通水P1: 紹介リンクの共有シート（ブランド=サービス単位）。
 * 既存資産の露出＝getOrCreateReferralToken(referral_links) → /r/{token} を コピー / LINE / QR で配れるようにする。
 * v2.2/静音化: 1画面1焦点・動詞ボタン・0.5px罫線・塗りは最小。共有はユーザー操作＝外部自動送信ではない。
 * 計測: 各共有アクションで trackFunnel('share',{token,channel})（fire-and-forget）。
 */
import { useEffect, useRef, useState } from 'react'
import { getOrCreateReferralToken } from './actions'
import { trackFunnel } from '@/lib/funnel-client'

const APEX = 'https://mb-partners.app'

export default function ShareLinkSheet({ serviceId, serviceName, menus = [], onClose }: { serviceId: string; serviceName: string; menus?: { id: string; name: string }[]; onClose: () => void }) {
  const [token, setToken] = useState<string | null>(null)
  const [err, setErr] = useState('')
  const [copied, setCopied] = useState(false)
  const [qr, setQr] = useState<string | null>(null)
  // 何を共有するか＝ブランド全体（''）／特定メニュー（menu.id）。パートナーが明示選択したものだけがリンクに乗る。
  const [selMenu, setSelMenu] = useState<string>('')
  const canvasWrap = useRef<HTMLDivElement>(null)

  // メニュー選択は URL パラメータ ?m= で表現（帰属token・money非接触。未選択=ブランドリンク）。
  const url = token ? `${APEX}/r/${token}${selMenu ? `?m=${selMenu}` : ''}` : ''
  const selMenuName = menus.find(m => m.id === selMenu)?.name ?? null

  useEffect(() => {
    let alive = true
    getOrCreateReferralToken(serviceId).then(t => { if (alive) setToken(t) }).catch(() => { if (alive) setErr('リンクの取得に失敗しました') })
    return () => { alive = false }
  }, [serviceId])

  // QRは開いた時だけ生成（qrcode を動的import＝初回バンドル非依存）。
  useEffect(() => {
    if (!url) return
    let alive = true
    import('qrcode').then(QR => QR.toDataURL(url, { margin: 1, width: 320, color: { dark: '#0E0E14', light: '#FFFFFF' } }))
      .then(d => { if (alive) setQr(d) }).catch(() => {})
    return () => { alive = false }
  }, [url])

  async function copy() {
    if (!url) return
    try { await navigator.clipboard.writeText(url); setCopied(true); setTimeout(() => setCopied(false), 1800); trackFunnel('share', { token, channel: 'copy' }) } catch { setErr('コピーできませんでした') }
  }
  function line() {
    if (!url) return
    const text = `${selMenuName ?? serviceName}のご紹介です\n${url}`
    trackFunnel('share', { token, channel: 'line' })
    window.open(`https://line.me/R/msg/text/?${encodeURIComponent(text)}`, '_blank', 'noopener')
  }
  function saveQr() {
    if (!qr) return
    trackFunnel('share', { token, channel: 'qr' })
    const a = document.createElement('a'); a.href = qr; a.download = `mb-referral-${serviceName}.png`; a.click()
  }

  const btn: React.CSSProperties = { flex: 1, height: 44, borderRadius: 11, border: '0.5px solid var(--line)', background: '#fff', color: 'var(--txt)', fontFamily: 'inherit', fontSize: '.76rem', fontWeight: 500, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 7 }

  return (
    <>
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(14,14,20,.32)', zIndex: 90 }} />
      {/* 中央寄せは left/right:0 + margin:auto で行う（transform に依存しない）。
          page-anim(@keyframes pageIn) は fill:both で終端 transform:none を焼き付けるため、
          translateX(-50%) をここで使うと打ち消されてシートが右へずれる（実機375pxで left=188 の再現バグ）。 */}
      <div className="page-anim" role="dialog" aria-label="紹介リンクを共有" style={{ position: 'fixed', left: 0, right: 0, bottom: 0, margin: '0 auto', width: '100%', maxWidth: 430, background: '#fff', borderRadius: '18px 18px 0 0', zIndex: 95, boxShadow: '0 -18px 48px rgba(14,14,20,.16)', padding: '20px 22px calc(24px + env(safe-area-inset-bottom))' }}>
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 4 }}>
          <b style={{ fontSize: '.92rem', fontWeight: 500 }}>{serviceName}を紹介する</b>
          <button onClick={onClose} aria-label="閉じる" style={{ background: 'none', border: 'none', color: 'var(--muted)', fontSize: '1rem', cursor: 'pointer' }}>✕</button>
        </div>
        <p style={{ fontSize: '.66rem', color: 'var(--muted2)', lineHeight: 1.6, marginBottom: 14 }}>あなた専用のリンクです。お客さまがここから登録すると、あなたの紹介として記録されます。</p>

        {/* 共有内容の選択：ブランド全体 or 特定メニュー（選んだものだけがリンクに乗る＝勝手な主役化を防ぐ）。 */}
        {menus.length > 0 && (
          <div style={{ marginBottom: 14 }}>
            <div style={{ fontSize: '.6rem', color: 'var(--muted2)', fontWeight: 500, marginBottom: 7 }}>共有する内容</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7 }}>
              {[{ id: '', name: `${serviceName}（全体）` }, ...menus].map(m => {
                const on = selMenu === m.id
                return (
                  <button key={m.id || 'all'} onClick={() => setSelMenu(m.id)} style={{
                    fontFamily: 'inherit', fontSize: '.68rem', fontWeight: 500, cursor: 'pointer',
                    padding: '5px 11px', borderRadius: 7, whiteSpace: 'nowrap',
                    border: on ? '1px solid var(--c-blue)' : '0.5px solid var(--line)',
                    color: on ? 'var(--c-blue)' : 'var(--muted2)', background: on ? 'var(--blue-bg2)' : '#fff',
                  }}>{m.name}</button>
                )
              })}
            </div>
          </div>
        )}

        {err && <p style={{ fontSize: '.7rem', color: 'var(--red)', marginBottom: 12 }}>{err}</p>}

        {/* リンク（読み取り＋コピー） */}
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', border: '0.5px solid var(--line)', borderRadius: 11, padding: '10px 12px', marginBottom: 12, background: 'var(--bg2)' }}>
          <span style={{ flex: 1, minWidth: 0, fontSize: '.72rem', color: 'var(--muted2)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontFamily: 'Inter' }}>{url || 'リンクを準備中…'}</span>
          <button onClick={copy} disabled={!url} style={{ flexShrink: 0, background: 'none', border: 'none', color: 'var(--c-blue)', fontSize: '.72rem', fontWeight: 500, cursor: url ? 'pointer' : 'default', fontFamily: 'inherit' }}>{copied ? 'コピー済' : 'コピー'}</button>
        </div>

        <div style={{ display: 'flex', gap: 10, marginBottom: 16 }}>
          <button onClick={copy} disabled={!url} style={btn}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><rect x="9" y="9" width="13" height="13" rx="2" /><path d="M5 15V5a2 2 0 012-2h10" /></svg>
            リンクをコピー
          </button>
          <button onClick={line} disabled={!url} style={{ ...btn, color: '#fff', background: '#06C755', border: 'none' }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M12 3C6.5 3 2 6.6 2 11c0 3.9 3.5 7.2 8.3 7.9.3.06.7.2.8.46.08.24.05.6.03.85l-.13.8c-.04.24-.19.94.82.51 1-.42 5.4-3.18 7.37-5.44C20.6 15.3 22 13.3 22 11c0-4.4-4.5-8-10-8z" /></svg>
            LINEで送る
          </button>
        </div>

        {/* QR（対面共有） */}
        <div ref={canvasWrap} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, padding: '14px 0 2px', borderTop: '0.5px solid var(--line)' }}>
          {qr ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={qr} alt="紹介リンクのQRコード" width={148} height={148} style={{ borderRadius: 10 }} />
          ) : (
            <div className="ui-skeleton" style={{ width: 148, height: 148, borderRadius: 10 }} />
          )}
          <button onClick={saveQr} disabled={!qr} style={{ background: 'none', border: 'none', color: 'var(--c-blue)', fontSize: '.72rem', fontWeight: 500, cursor: qr ? 'pointer' : 'default', fontFamily: 'inherit' }}>QRコードを保存</button>
        </div>
      </div>
    </>
  )
}
