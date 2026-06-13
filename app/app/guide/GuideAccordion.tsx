'use client'
import { useState } from 'react'
import ServiceIcon from '@/components/ServiceIcon'
import type { ServiceWithMenus } from '@/lib/supabase/queries'

const RefChip = () => (
  <span style={{
    display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: '.6rem', fontWeight: 700,
    padding: '4px 9px', borderRadius: 14, whiteSpace: 'nowrap', flexShrink: 0,
    background: 'var(--blue-bg)', color: 'var(--blue)',
  }}>紹介</span>
)
const FtChip = () => (
  <span style={{
    display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: '.6rem', fontWeight: 700,
    padding: '4px 9px', borderRadius: 14, whiteSpace: 'nowrap', flexShrink: 0,
    background: 'var(--txt)', color: '#fff',
  }}>協力</span>
)

export default function GuideAccordion({ svc }: { svc: ServiceWithMenus }) {
  const [open, setOpen] = useState(false)

  const menus = svc.service_menus

  return (
    <div style={{
      background: '#fff', border: '1px solid var(--line)', borderRadius: 14,
      margin: '0 20px 10px', overflow: 'hidden',
    }}>
      {/* Header */}
      <div
        onClick={() => setOpen(v => !v)}
        style={{ padding: '15px 16px', display: 'flex', alignItems: 'center', gap: 12, cursor: 'pointer' }}
      >
        <ServiceIcon icon={svc.icon} color={svc.color} size={38} />
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: '.5rem', fontFamily: 'Inter', fontWeight: 600, color: 'var(--muted)', letterSpacing: '.22em', marginBottom: 2, textTransform: 'uppercase' }}>
            {svc.url ?? svc.subtitle}
          </div>
          <h3 style={{ fontSize: '.86rem', fontWeight: 700 }}>{svc.name}</h3>
        </div>
        <span style={{
          color: 'var(--muted)', fontSize: '.85rem',
          transition: 'transform .25s', transform: open ? 'rotate(90deg)' : 'none',
          display: 'inline-block',
        }}>›</span>
      </div>

      {/* Body */}
      {open && (
        <div style={{ padding: '0 16px 16px', fontSize: '.72rem', lineHeight: 1.8, color: '#3A3A45', borderTop: '1px solid var(--line)' }}>
          {svc.description && <p style={{ marginTop: 12, marginBottom: 8 }}>{svc.description}</p>}

          {/* Who */}
          {svc.who && (
            <div style={{ display: 'flex', gap: 8, background: 'var(--bg2)', borderRadius: 8, padding: '10px 12px', margin: '4px 0 8px' }}>
              <span style={{ flexShrink: 0, fontFamily: 'Inter', fontSize: '.5rem', fontWeight: 600, color: 'var(--blue)', letterSpacing: '.16em', paddingTop: 3, textTransform: 'uppercase' }}>Who</span>
              <span>{svc.who}</span>
            </div>
          )}

          {/* Fee rows per menu */}
          <div style={{ marginBottom: 4 }}>
            {menus.map(m => (
              <div key={m.id}>
                {/* Referral fee row */}
                <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start', padding: '10px 0', borderTop: '1px solid #F2F2F6' }}>
                  <RefChip />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <b style={{ fontSize: '.71rem', display: 'block' }}>{m.ref_trigger ?? m.name}</b>
                    {m.example_ref && <small style={{ fontSize: '.61rem', color: 'var(--muted2)', display: 'block', marginTop: 3, lineHeight: 1.65 }}>{m.example_ref}</small>}
                  </div>
                  <span style={{ fontFamily: 'Inter', fontWeight: 800, fontSize: '.9rem', whiteSpace: 'nowrap', fontFeatureSettings: '"tnum"', color: 'var(--blue)' }}>
                    {m.ref_type === 'fixed'
                      ? `¥${Number(m.ref_value).toLocaleString()}`
                      : `${m.ref_value}%`}
                  </span>
                </div>

                {/* Frontier fee row */}
                {m.ft_enabled && (
                  <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start', padding: '10px 0', borderTop: '1px solid #F2F2F6' }}>
                    <FtChip />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <b style={{ fontSize: '.71rem', display: 'block' }}>
                        {m.ft_trigger ?? m.name}
                        {m.ft_condition && <span style={{ color: 'var(--amber)', marginLeft: 6 }}>· {m.ft_condition}</span>}
                      </b>
                      {m.example_ft && <small style={{ fontSize: '.61rem', color: 'var(--muted2)', display: 'block', marginTop: 3, lineHeight: 1.65 }}>{m.example_ft}</small>}
                    </div>
                    <span style={{ fontFamily: 'Inter', fontWeight: 800, fontSize: '.9rem', whiteSpace: 'nowrap', fontFeatureSettings: '"tnum"' }}>
                      {m.ft_rate != null ? `${m.ft_rate}%` : '—'}
                    </span>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
