/**
 * F-2：Modal（PC・中央）/ Sheet（スマホ・ボトム）— 既存のモーダル/ドロワー演出に整合。
 * 純プレゼンテーション：open 制御は親が持つ（既存の {modal && <Modal>} パターンのまま使える）。
 */
import React from 'react'

const SCRIM: React.CSSProperties = { position: 'fixed', inset: 0, background: 'rgba(14,14,20,.4)', zIndex: 90 }

export function Modal({ open, onClose, title, children, footer, width = 420 }: {
  open: boolean
  onClose?: () => void
  title?: React.ReactNode
  children: React.ReactNode
  footer?: React.ReactNode
  width?: number
}) {
  if (!open) return null
  return (
    <div className="modal-fade" style={{ ...SCRIM, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 'var(--sp-4)' }} onClick={onClose}>
      <div onClick={e => e.stopPropagation()} style={{ width, maxWidth: '92vw', background: '#fff', borderRadius: 'var(--radius-lg)', boxShadow: 'var(--shadow-lg)', overflow: 'hidden', maxHeight: '90vh', display: 'flex', flexDirection: 'column' }}>
        {title && <div style={{ padding: 'var(--sp-4) var(--sp-5)', borderBottom: '1px solid var(--line)' }}><b style={{ fontSize: 'var(--fs-h2)' }}>{title}</b></div>}
        <div className="cascade" style={{ padding: 'var(--sp-5)', overflowY: 'auto' }}>{children}</div>
        {footer && <div style={{ padding: 'var(--sp-3) var(--sp-5)', borderTop: '1px solid var(--line)', display: 'flex', gap: 'var(--sp-2)', justifyContent: 'flex-end' }}>{footer}</div>}
      </div>
    </div>
  )
}

export function Sheet({ open, onClose, title, children, footer }: {
  open: boolean
  onClose?: () => void
  title?: React.ReactNode
  children: React.ReactNode
  footer?: React.ReactNode
}) {
  if (!open) return null
  return (
    <div className="modal-fade" style={{ ...SCRIM, display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }} onClick={onClose}>
      <div className="drawer-slide" onClick={e => e.stopPropagation()} style={{ width: '100%', maxWidth: 480, background: '#fff', borderRadius: 'var(--radius-xl) var(--radius-xl) 0 0', boxShadow: 'var(--shadow-lg)', maxHeight: '88vh', display: 'flex', flexDirection: 'column' }}>
        <div style={{ padding: '10px 0 6px', display: 'flex', justifyContent: 'center' }}><span style={{ width: 36, height: 4, borderRadius: 'var(--radius-pill)', background: 'var(--line)' }} /></div>
        {title && <div style={{ padding: '4px var(--sp-5) var(--sp-3)', borderBottom: '1px solid var(--line)' }}><b style={{ fontSize: 'var(--fs-h2)' }}>{title}</b></div>}
        <div className="cascade" style={{ padding: 'var(--sp-4) var(--sp-5)', overflowY: 'auto' }}>{children}</div>
        {footer && <div style={{ padding: 'var(--sp-3) var(--sp-5)', borderTop: '1px solid var(--line)', display: 'flex', gap: 'var(--sp-2)', justifyContent: 'flex-end' }}>{footer}</div>}
      </div>
    </div>
  )
}
