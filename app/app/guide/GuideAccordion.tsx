'use client'
import { useState } from 'react'
import ServiceAvatar from '@/components/ServiceAvatar'
import type { ServiceWithMenus, MenuRow } from '@/lib/supabase/queries'

function CatChip({ cat }: { cat: 'referral' | 'cooperation' }) {
  const isRef = cat === 'referral'
  return (
    <span className={`chip ${isRef ? 'chip-referral' : 'chip-cooperation'}`} style={{ flexShrink: 0 }}>
      {isRef ? '固定' : '成果'}
    </span>
  )
}

function fmtFee(m: MenuRow) {
  if (m.ref_type === 'fixed') return `¥${Number(m.ref_value).toLocaleString()}`
  return `${m.ref_value}%${m.ref_base ? `（${m.ref_base}）` : ''}`
}

function fmtCoopFee(m: MenuRow) {
  if (m.coop_type === 'fixed') return `¥${Number(m.coop_value ?? 0).toLocaleString()}`
  if (m.coop_type === 'rate')  return `${m.coop_value ?? 0}%${m.coop_base ? `（${m.coop_base}）` : ''}`
  return '-'
}

// 注意アイコン（v2.2：絵文字ではなく stroke SVG）
function AlertIcon() {
  return (
    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden style={{ flexShrink: 0, marginTop: 2 }}>
      <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
      <line x1="12" y1="9" x2="12" y2="13" />
      <line x1="12" y1="17" x2="12.01" y2="17" />
    </svg>
  )
}

// ③ 対応範囲タグ＝required協力タスクのラベル（単一ソース）。
function CoverageTags({ labels, accent = false }: {
  labels: string[] | null | undefined
  accent?: boolean
}) {
  if (!labels || labels.length === 0) return null
  return (
    <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginTop: 5 }}>
      {labels.map(l => (
        <span key={l} style={{
          fontSize: '.54rem', fontWeight: 500, padding: '2px 7px', borderRadius: 10,
          background: accent ? 'var(--blue-bg)' : '#EBEBF0',
          color: accent ? 'var(--blue)' : 'var(--txt)',
        }}>{l}</span>
      ))}
    </div>
  )
}

// ロゴがあればロゴ、無ければ従来の色付きアイコンへフォールバック（共通 ServiceAvatar 経由）
function ServiceLogo({ logoPath, name, size = 38, icon = 'arrows', color = '#4733e6' }: {
  logoPath: string | null; name: string; size?: number; icon?: string; color?: string
}) {
  return <ServiceAvatar logoPath={logoPath} icon={icon} color={color} name={name} size={size} />
}

function FeeRow({ m }: { m: MenuRow }) {
  return (
    <div style={{
      padding: '10px 0', borderTop: '1px solid #F2F2F6',
    }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr auto', gap: '8px 10px', alignItems: 'start' }}>
        <CatChip cat="referral" />
        <div style={{ minWidth: 0 }}>
          <span style={{ fontWeight: 500, fontSize: '.72rem', display: 'block', lineHeight: 1.4 }}>{m.name}</span>
          {m.ref_trigger && (
            <span style={{ fontSize: '.6rem', color: 'var(--muted2)', display: 'block', marginTop: 2 }}>{m.ref_trigger}</span>
          )}
          <CoverageTags labels={m.coverage_tasks} accent />
          {m.qualification && (
            <small style={{ fontSize: '.6rem', color: 'var(--amber)', display: 'flex', alignItems: 'flex-start', gap: 4, marginTop: 4 }}>
              <AlertIcon />{m.qualification}
            </small>
          )}
        </div>
        <span style={{ fontFamily: 'Inter', fontWeight: 500, fontSize: '.9rem', whiteSpace: 'nowrap', fontFeatureSettings: '"tnum"', color: 'var(--blue)', paddingTop: 1 }}>
          {fmtFee(m)}
        </span>
      </div>
    </div>
  )
}

function CoopFeeRow({ m }: { m: MenuRow }) {
  const steps = m.coverage_tasks ?? []
  return (
    <div style={{ padding: '10px 0', borderTop: '1px solid #F2F2F6' }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr auto', gap: '8px 10px', alignItems: 'start' }}>
        <CatChip cat="cooperation" />
        <div style={{ minWidth: 0 }}>
          <span style={{ fontWeight: 500, fontSize: '.72rem', display: 'block', lineHeight: 1.4 }}>{m.name}</span>
          {steps.length > 0 && (
            <>
              <span style={{ fontSize: '.54rem', fontWeight: 500, color: 'var(--muted2)', letterSpacing: '.04em', display: 'block', marginTop: 5 }}>あなたが担うこと</span>
              <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginTop: 4 }}>
                {steps.map(l => (
                  <span key={l} style={{ fontSize: '.54rem', fontWeight: 500, padding: '2px 7px', borderRadius: 10, background: '#ECE9F8', color: 'var(--blue-dk)' }}>
                    {l}
                  </span>
                ))}
              </div>
            </>
          )}
          {m.coop_condition && (
            <small style={{ fontSize: '.6rem', color: 'var(--amber)', display: 'flex', alignItems: 'flex-start', gap: 4, marginTop: 4 }}>
              <AlertIcon />{m.coop_condition}
            </small>
          )}
        </div>
        <span style={{ fontFamily: 'Inter', fontWeight: 500, fontSize: '.9rem', whiteSpace: 'nowrap', fontFeatureSettings: '"tnum"', color: 'var(--blue-dk)', paddingTop: 1 }}>
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
        <ServiceLogo logoPath={svc.logo_path} name={svc.name} size={38} icon={svc.icon} color={svc.color} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: '.5rem', fontFamily: 'Inter', fontWeight: 500, color: 'var(--muted)', letterSpacing: '.22em', marginBottom: 2, textTransform: 'uppercase' }}>
            {svc.url ?? svc.subtitle}
          </div>
          <h3 style={{ fontSize: '.86rem', fontWeight: 500 }}>{svc.name}</h3>
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
              <span style={{ flexShrink: 0, fontFamily: 'Inter', fontSize: '.5rem', fontWeight: 500, color: 'var(--blue)', letterSpacing: '.16em', paddingTop: 3, textTransform: 'uppercase' }}>Who</span>
              <span style={{ fontSize: '.68rem' }}>{svc.who}</span>
            </div>
          )}
          {/* Fee table */}
          {hasRows && (
            <div style={{ marginTop: 4 }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr auto', gap: '0 10px', padding: '6px 0 2px' }}>
                <span style={{ fontSize: '.52rem', fontWeight: 500, color: 'var(--muted2)', textTransform: 'uppercase', letterSpacing: '.12em' }}>種別</span>
                <span style={{ fontSize: '.52rem', fontWeight: 500, color: 'var(--muted2)', textTransform: 'uppercase', letterSpacing: '.12em' }}>メニュー / 条件</span>
                <span style={{ fontSize: '.52rem', fontWeight: 500, color: 'var(--muted2)', textTransform: 'uppercase', letterSpacing: '.12em', textAlign: 'right' }}>報酬</span>
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
