'use client'
import { useEffect, useState, type CSSProperties } from 'react'
import { createPortal } from 'react-dom'
import { getOrCreateReferralToken } from './actions'
import { trackFunnel } from '@/lib/funnel-client'
import { makeShareMessage, makeShareUrl } from '@/lib/share-card-public'

type ShareMenu = { id: string; name: string; public_description: string | null }

export default function ShareLinkSheet({
  serviceId,
  serviceName,
  menus = [],
  onClose,
}: {
  serviceId: string
  serviceName: string
  menus?: ShareMenu[]
  onClose: () => void
}) {
  const [mounted, setMounted] = useState(false)
  const [token, setToken] = useState<string | null>(null)
  const [err, setErr] = useState('')
  const [copied, setCopied] = useState<'message' | 'url' | null>(null)
  const [qr, setQr] = useState<string | null>(null)
  const [selMenu, setSelMenu] = useState('')
  const canShare = mounted && typeof navigator !== 'undefined' && typeof navigator.share === 'function'

  const selected = menus.find(menu => menu.id === selMenu) ?? null
  const url = token ? makeShareUrl(token, selMenu) : ''
  const message = url ? makeShareMessage({
    serviceName,
    menuName: selected?.name,
    publicDescription: selected?.public_description,
    url,
  }) : ''
  const ogUrl = token
    ? `/api/og/r/${encodeURIComponent(token)}${selMenu ? `?m=${encodeURIComponent(selMenu)}` : ''}`
    : ''

  useEffect(() => {
    const frame = requestAnimationFrame(() => setMounted(true))
    return () => cancelAnimationFrame(frame)
  }, [])

  useEffect(() => {
    let alive = true
    getOrCreateReferralToken(serviceId)
      .then(value => { if (alive) setToken(value) })
      .catch(() => { if (alive) setErr('リンクの取得に失敗しました') })
    return () => { alive = false }
  }, [serviceId])

  useEffect(() => {
    if (!url) return
    let alive = true
    import('qrcode')
      .then(QR => QR.toDataURL(url, { margin: 1, width: 320, color: { dark: '#0E0E14', light: '#FFFFFF' } }))
      .then(data => { if (alive) setQr(data) })
      .catch(() => {})
    return () => { alive = false }
  }, [url])

  function record(channel: 'line' | 'copy' | 'qr') {
    trackFunnel('share', { token, channel, src: 'card', menuId: selMenu })
  }

  function showCopied(kind: 'message' | 'url') {
    setCopied(kind)
    window.setTimeout(() => setCopied(null), 1800)
  }

  async function copyMessage() {
    if (!message) return
    try {
      await navigator.clipboard.writeText(message)
      showCopied('message')
      record('copy')
    } catch { setErr('コピーできませんでした') }
  }

  async function copyUrl() {
    if (!url) return
    try {
      await navigator.clipboard.writeText(url)
      showCopied('url')
      record('copy')
    } catch { setErr('コピーできませんでした') }
  }

  function line() {
    if (!message) return
    record('line')
    window.open(`https://line.me/R/msg/text/?${encodeURIComponent(message)}`, '_blank', 'noopener')
  }

  async function share() {
    if (!canShare || !url || !message) return
    const lines = message.split('\n')
    const text = lines.slice(0, -1).join('\n')
    try {
      await navigator.share({ title: selected?.name ?? serviceName, text, url })
      trackFunnel('share', { token, src: 'card', menuId: selMenu })
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return
      setErr('共有できませんでした')
    }
  }

  function saveQr() {
    if (!qr) return
    record('qr')
    const anchor = document.createElement('a')
    anchor.href = qr
    anchor.download = `mb-referral-${serviceName}.png`
    anchor.click()
  }

  const btn: CSSProperties = {
    flex: 1, minHeight: 44, borderRadius: 11, border: '0.5px solid var(--line)', background: '#fff',
    color: 'var(--txt)', fontFamily: 'inherit', fontSize: '.76rem', fontWeight: 500, cursor: 'pointer',
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 7, padding: '0 12px',
  }

  if (!mounted) return null
  return createPortal(
    <div role="presentation" style={{ position: 'fixed', inset: 0, zIndex: 90, display: 'grid', alignItems: 'end', justifyItems: 'center' }}>
      <div onClick={onClose} style={{ position: 'absolute', inset: 0, background: 'rgba(14,14,20,.32)' }} />
      <div role="dialog" aria-modal="true" aria-label="紹介リンクを共有" style={{
        position: 'relative', width: '100%', maxWidth: 430, maxHeight: 'min(92dvh, 720px)', display: 'flex', flexDirection: 'column',
        background: '#fff', borderRadius: '18px 18px 0 0', boxShadow: '0 -18px 48px rgba(14,14,20,.16)',
        paddingBottom: 'env(safe-area-inset-bottom)', overflow: 'hidden',
      }}>
        <div style={{ overflowY: 'auto', overscrollBehavior: 'contain', padding: '16px 22px 24px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 2 }}>
            <b style={{ fontSize: '.92rem', fontWeight: 500 }}>{serviceName}を紹介する</b>
            <button onClick={onClose} aria-label="閉じる" style={{ width: 44, height: 44, background: 'none', border: 'none', color: 'var(--muted)', fontSize: '1rem', cursor: 'pointer' }}>✕</button>
          </div>
          <p style={{ fontSize: '.66rem', color: 'var(--muted2)', lineHeight: 1.6, margin: '0 0 14px' }}>あなた専用のリンクです。お客さまがここから登録すると、あなたの紹介として記録されます。</p>

          {menus.length > 0 && <div style={{ marginBottom: 14 }}>
            <div style={{ fontSize: '.6rem', color: 'var(--muted2)', fontWeight: 500, marginBottom: 7 }}>共有する内容</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7 }}>
              {[{ id: '', name: `${serviceName}（全体）`, public_description: null }, ...menus].map(menu => {
                const active = selMenu === menu.id
                return <button key={menu.id || 'all'} onClick={() => setSelMenu(menu.id)} style={{
                  minHeight: 44, fontFamily: 'inherit', fontSize: '.68rem', fontWeight: 500, cursor: 'pointer', padding: '8px 12px',
                  borderRadius: 7, border: active ? '1px solid var(--c-blue)' : '0.5px solid var(--line)',
                  color: active ? 'var(--c-blue)' : 'var(--muted2)', background: active ? 'var(--blue-bg2)' : '#fff',
                }}>{menu.name}</button>
              })}
            </div>
          </div>}

          <div style={{ fontSize: '.6rem', color: 'var(--muted2)', fontWeight: 500, marginBottom: 7 }}>相手にはこう見えます</div>
          <div style={{ aspectRatio: '1200 / 630', overflow: 'hidden', border: '0.5px solid var(--line)', borderRadius: 11, background: 'var(--bg2)', marginBottom: 14 }}>
            {ogUrl
              // next/imageを通すとOG実物ではなく最適化APIを検証することになるため、生成物を直接表示する。
              // eslint-disable-next-line @next/next/no-img-element
              ? <img src={ogUrl} alt="共有カードのプレビュー" style={{ display: 'block', width: '100%', height: '100%', objectFit: 'cover' }} />
              : <div className="ui-skeleton" style={{ width: '100%', height: '100%' }} />}
          </div>

          {err && <p style={{ fontSize: '.7rem', color: 'var(--red)', marginBottom: 12 }}>{err}</p>}

          <div style={{ border: '0.5px solid var(--line)', borderRadius: 11, padding: 12, marginBottom: 10, background: 'var(--bg2)' }}>
            <p style={{ whiteSpace: 'pre-wrap', fontSize: '.7rem', color: 'var(--muted2)', lineHeight: 1.7, margin: '0 0 10px' }}>{message || '紹介文を準備中…'}</p>
            <button onClick={copyUrl} disabled={!url} style={{ minHeight: 44, width: '100%', border: '0.5px solid var(--line)', borderRadius: 9, background: '#fff', color: 'var(--c-blue)', fontFamily: 'inherit', fontSize: '.7rem', cursor: url ? 'pointer' : 'default' }}>
              {copied === 'url' ? 'URLをコピー済' : '表示中のURLをコピー'}
            </button>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: canShare ? '1fr 1fr' : '1fr', gap: 10, marginBottom: 10 }}>
            <button onClick={copyMessage} disabled={!message} style={btn}>{copied === 'message' ? '文面をコピー済' : '文面ごとコピー'}</button>
            {canShare && <button onClick={share} disabled={!url} style={btn}>共有…</button>}
          </div>
          <button onClick={line} disabled={!message} style={{ ...btn, width: '100%', color: '#fff', background: '#06C755', border: 'none', marginBottom: 16 }}>
            LINEで送る
          </button>

          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, padding: '14px 0 2px', borderTop: '0.5px solid var(--line)' }}>
            {qr
              // data URLのQRを端末保存するため、最適化を挟まない。
              // eslint-disable-next-line @next/next/no-img-element
              ? <img src={qr} alt="紹介リンクのQRコード" width={148} height={148} style={{ borderRadius: 10 }} />
              : <div className="ui-skeleton" style={{ width: 148, height: 148, borderRadius: 10 }} />}
            <button onClick={saveQr} disabled={!qr} style={{ minHeight: 44, background: 'none', border: 'none', color: 'var(--c-blue)', fontSize: '.72rem', fontWeight: 500, cursor: qr ? 'pointer' : 'default', fontFamily: 'inherit' }}>QRコードを保存する</button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  )
}
