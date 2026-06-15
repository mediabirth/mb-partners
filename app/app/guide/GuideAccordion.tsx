'use client'
import { useState } from 'react'
import type { ServiceWithMenus, MenuRow } from '@/lib/supabase/queries'

function CatChip({ cat }: { cat: 'referral' | 'cooperation' }) {
  const isRef = cat === 'referral'
  return (
    <span className={`chip ${isRef ? 'chip-referral' : 'chip-cooperation'}`} style={{ flexShrink: 0 }}>
      {isRef ? '紹介' : '協力'}
    </span>
  )
}

function fmtFee(m: MenuRow) {
  if (m.ref_type === 'fixed') return `¥${Number(m.ref_value).toLocaleString()}`
  return `${m.ref_value}%${m.ref_base ? ` (${m.ref_base})` : ''}`
}

function fmtCoopFee(m: MenuRow) {
  if (m.coop_type === 'fixed') return `¥${Number(m.coop_value ?? 0).toLocaleString()}`
  if (m.coop_type === 'rate')  return `${m.coop_value ?? 0}%${m.coop_base ? ` (${m.coop_base})` : ''}`
  return '-'
}

function CoverageTags({ steps, accent = false }: {
  steps: { label: string; included: boolean }[] | null
  accent?: boolean
}) {
  if (!steps) return null
  const included = steps.filter(s => s.included)
  if (included.length === 0) return null
  return (
    <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginTop: 5 }}>
      {included.map(s => (
        <span key={s.label} style={{
          fontSize: '.54rem', fontWeight: 600, padding: '2px 7px', borderRadius: 10,
          background: accent ? 'var(--blue-bg)' : '#EBEBF0',
          color: accent ? 'var(--blue)' : 'var(--txt)',
        }}>{s.label}</span>
      ))}
    </div>
  )
}

function ServiceLogo({ logoPath, name, size = 38 }: { logoPath: string | null; name: string; size?: number }) {
  const r = Math.round(size / 4)
  if (logoPath) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={logoPath} alt={name} width={size} height={size}
        style={{ borderRadius: r, objectFit: 'cover', border: '1px solid var(--line)', flexShrink: 0 }}
        onError={e => { (e.target as HTMLImageElement).style.display = 'none' }} />
    )
  }
  return (
    <div style={{
      width: size, height: size, borderRadius: r,
      background: '#EBEBF0', color: '#999', flexShrink: 0,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontSize: size * 0.38, fontWeight: 800, fontFamily: 'Inter',
    }}>
      {(name || '?').charAt(0).toUpperCase()}
    </div>
  )
}

function FeeRow({ m }: { m: MenuRow }) {
  return (
    <div style={{
      padding: '10px 0', borderTop: '1px solid #F2F2F6',
    }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr auto', gap: '8px 10px', alignItems: 'start' }}>
        <CatChip cat="referral" />
        <div style={{ minWidth: 0 }}>
          <b style={{ fontSize: '.72rem', display: 'block', lineHeight: 1.4 }}>{m.name}</b>
          {m.ref_trigger && (
            <span style={{ fontSize: '.6rem', color: 'var(--muted2)', display: 'block', marginTop: 2 }}>{m.ref_trigger}</span>
          )}
          <CoverageTags steps={m.coverage_steps} accent />
          {m.qualification && (
            <small style={{ fontSize: '.6rem', color: 'var(--amber)', display: 'block', marginTop: 4 }}>
              ⚠ {m.qualification}
            </small>
          )}
        </div>
        <span style={{ fontFamily: 'Inter', fontWeight: 800, fontSize: '.9rem', whiteSpace: 'nowrap', fontFeatureSettings: '"tnum"', color: 'var(--blue)', paddingTop: 1 }}>
          {fmtFee(m)}
        </span>
      </div>
    </div>
  )
}

function CoopFeeRow({ m }: { m: MenuRow }) {
  const steps = (m.coop_coverage ?? []).filter(s => s.included)
  return (
    <div style={{ padding: '10px 0', borderTop: '1px solid #F2F2F6' }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr auto', gap: '8px 10px', alignItems: 'start' }}>
        <CatChip cat="cooperation" />
        <div style={{ minWidth: 0 }}>
          <b style={{ fontSize: '.72rem', display: 'block', lineHeight: 1.4 }}>{m.name}</b>
          {steps.length > 0 && (
            <>
              <span style={{ fontSize: '.54rem', fontWeight: 700, color: 'var(--muted2)', letterSpacing: '.04em', display: 'block', marginTop: 5 }}>対応範囲</span>
              <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginTop: 4 }}>
                {steps.map(s => (
                  <span key={s.label} style={{ fontSize: '.54rem', fontWeight: 600, padding: '2px 7px', borderRadius: 10, background: '#ECE9F8', color: 'var(--blue-dk)' }}>
                    {s.label}
                  </span>
                ))}
              </div>
            </>
          )}
          {m.coop_condition && (
            <small style={{ fontSize: '.6rem', color: 'var(--amber)', display: 'block', marginTop: 4 }}>
              ⚠ {m.coop_condition}
            </small>
          )}
        </div>
        <span style={{ fontFamily: 'Inter', fontWeight: 800, fontSize: '.9rem', whiteSpace: 'nowrap', fontFeatureSettings: '"tnum"', color: 'var(--blue-dk)', paddingTop: 1 }}>
          {fmtCoopFee(m)}
        </span>
      </div>
    </div>
  )
}

export default function GuideAccordion({ svc }: { svc: ServiceWithMenus }) {
  const [open, setOpen] = useState(false)

  const refMenus  = svc.service_menus.filter(m => m.ref_enabled !== false)
  const coopMenus = svc.service_menus.filter(m => m.coop_enabled === true)
  const hasRows   = refMenus.length > 0 || coopMenus.length > 0

  return (
    <div style={{
      background: '#fff', border: '1px solid var(--line)', borderRadius: 14,
      margin: '0 20px 10px', overflow: 'hidden',
    }}>
      {/* Header */}
      <div onClick={() => setOpen(v => !v)}
        style={{ padding: '15px 16px', display: 'flex', alignItems: 'center', gap: 12, cursor: 'pointer' }}>
        <ServiceLogo logoPath={svc.logo_path} name={svc.name} size={38} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: '.5rem', fontFamily: 'Inter', fontWeight: 600, color: 'var(--muted)', letterSpacing: '.22em', marginBottom: 2, textTransform: 'uppercase' }}>
            {svc.url ?? svc.subtitle}
          </div>
          <h3 style={{ fontSize: '.86rem', fontWeight: 700 }}>{svc.name}</h3>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          {refMenus.length > 0   && <CatChip cat="referral" />}
          {coopMenus.length > 0  && <CatChip cat="cooperation" />}
          <span style={{ color: 'var(--muted)', fontSize: '.85rem', transition: 'transform .25s', transform: open ? 'rotate(90deg)' : 'none', display: 'inline-block', marginLeft: 4 }}>›</span>
        </div>
      </div>

      {/* Body */}
      <div className={`accordion-body${open ? ' open' : ''}`}
        style={{ fontSize: '.72rem', lineHeight: 1.8, color: '#3A3A45', borderTop: open ? '1px solid var(--line)' : undefined }}>
        <div style={{ padding: '0 16px 16px' }}>
          {svc.description && <p style={{ marginTop: 12, marginBottom: 8 }}>{svc.description}</p>}
          {svc.who && (
            <div style={{ display: 'flex', gap: 8, background: 'var(--bg2)', borderRadius: 8, padding: '10px 12px', margin: '4px 0' }}>
              <span style={{ flexShrink: 0, fontFamily: 'Inter', fontSize: '.5rem', fontWeight: 600, color: 'var(--blue)', letterSpacing: '.16em', paddingTop: 3, textTransform: 'uppercase' }}>Who</span>
              <span style={{ fontSize: '.68rem' }}>{svc.who}</span>
            </div>
          )}
          {/* Fee table */}
          {hasRows && (
            <div style={{ marginTop: 4 }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr auto', gap: '0 10px', padding: '6px 0 2px' }}>
                <span style={{ fontSize: '.52rem', fontWeight: 700, color: 'var(--muted2)', textTransform: 'uppercase', letterSpacing: '.12em' }}>種別</span>
                <span style={{ fontSize: '.52rem', fontWeight: 700, color: 'var(--muted2)', textTransform: 'uppercase', letterSpacing: '.12em' }}>メニュー / 条件</span>
                <span style={{ fontSize: '.52rem', fontWeight: 700, color: 'var(--muted2)', textTransform: 'uppercase', letterSpacing: '.12em', textAlign: 'right' }}>報酬</span>
              </div>
              {refMenus.map(m => <FeeRow key={m.id} m={m} />)}
              {coopMenus.map(m => <CoopFeeRow key={`coop-${m.id}`} m={m} />)}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
