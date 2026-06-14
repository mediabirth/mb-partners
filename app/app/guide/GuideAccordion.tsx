'use client'
import { useState } from 'react'
import type { ServiceWithMenus, MenuRow } from '@/lib/supabase/queries'

function CatChip({ cat }: { cat: 'referral' | 'cooperation' }) {
  const isRef = cat === 'referral'
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', fontSize: '.58rem', fontWeight: 700,
      padding: '3px 8px', borderRadius: 12, whiteSpace: 'nowrap', flexShrink: 0,
      background: isRef ? 'var(--blue-bg)' : '#EBEBF0',
      color: isRef ? 'var(--blue)' : 'var(--txt)',
    }}>
      {isRef ? '紹介' : '協力'}
    </span>
  )
}

function fmtFee(m: MenuRow) {
  if (m.ref_type === 'fixed') return `¥${Number(m.ref_value).toLocaleString()}`
  return `${m.ref_value}%${m.ref_base ? ` (${m.ref_base})` : ''}`
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

function CoopFeeRow({ svc }: { svc: ServiceWithMenus }) {
  const steps = (svc.coverage_steps ?? []).filter(s => s.included)
  const coopFee = svc.coop_rate
    ? `${svc.coop_rate}%${svc.coop_base ? ` (${svc.coop_base})` : ''}`
    : '-'
  return (
    <div style={{ padding: '10px 0', borderTop: '1px solid #F2F2F6' }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr auto', gap: '8px 10px', alignItems: 'start' }}>
        <CatChip cat="cooperation" />
        <div style={{ minWidth: 0 }}>
          <b style={{ fontSize: '.72rem', display: 'block', lineHeight: 1.4 }}>協力</b>
          {svc.ft_trigger && (
            <span style={{ fontSize: '.6rem', color: 'var(--muted2)', display: 'block', marginTop: 2 }}>{svc.ft_trigger}</span>
          )}
          {steps.length > 0 && (
            <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginTop: 5 }}>
              {steps.map(s => (
                <span key={s.label} style={{ fontSize: '.54rem', fontWeight: 600, padding: '2px 7px', borderRadius: 10, background: '#EBEBF0', color: 'var(--txt)' }}>
                  {s.label}
                </span>
              ))}
            </div>
          )}
          {svc.ft_condition && (
            <small style={{ fontSize: '.6rem', color: 'var(--amber)', display: 'block', marginTop: 4 }}>
              ⚠ {svc.ft_condition}
            </small>
          )}
        </div>
        <span style={{ fontFamily: 'Inter', fontWeight: 800, fontSize: '.9rem', whiteSpace: 'nowrap', fontFeatureSettings: '"tnum"', color: 'var(--txt)', paddingTop: 1 }}>
          {coopFee}
        </span>
      </div>
    </div>
  )
}

export default function GuideAccordion({ svc }: { svc: ServiceWithMenus }) {
  const [open, setOpen] = useState(false)

  const refMenus = svc.service_menus.filter(m => m.category !== 'cooperation')
  const hasRows  = refMenus.length > 0 || svc.coop_enabled

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
          {refMenus.length > 0  && <CatChip cat="referral" />}
          {svc.coop_enabled     && <CatChip cat="cooperation" />}
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
              {svc.coop_enabled && <CoopFeeRow svc={svc} />}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
