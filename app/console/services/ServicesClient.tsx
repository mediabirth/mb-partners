'use client'
import { useRef, useState, useTransition } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { ServiceWithMenus, MenuRow } from '@/lib/supabase/queries'

// ─── Constants ────────────────────────────────────────────────────────────────

const BASE_OPTIONS = ['売上', '粗利', '利益', '受取収入']

const COVERAGE_DEFAULTS = [
  { label: 'つなぐ',             included: true  },
  { label: 'アポイント設定',     included: false },
  { label: '商談',               included: false },
  { label: '価格合意',           included: false },
  { label: 'フォロー・アシスト', included: false },
]

// ─── Types ────────────────────────────────────────────────────────────────────

type CoverageStep = { label: string; included: boolean }

type ServiceForm = {
  name: string; subtitle: string; description: string; who: string; url: string
  logo_path: string; active: boolean
  icon: string; color: string  // kept for backward compat, not shown in UI
  coop_enabled: boolean
  coop_rate: string
  coop_base: string
  coop_trigger: string
  coop_condition: string
  coop_coverage: CoverageStep[]
}

const defaultServiceForm: ServiceForm = {
  name: '', subtitle: '', description: '', who: '', url: '', logo_path: '',
  active: true, icon: 'arrows', color: '#4733e6',
  coop_enabled: false, coop_rate: '', coop_base: '',
  coop_trigger: '', coop_condition: '',
  coop_coverage: COVERAGE_DEFAULTS.map(s => ({ ...s })),
}

type MenuForm = {
  name: string
  ref_type: 'fixed' | 'rate'
  ref_value: string
  ref_base: string
  ref_trigger: string
  coverage_steps: CoverageStep[]
  qualification: string
  ref_months: string
}

const defaultMenuForm: MenuForm = {
  name: '', ref_type: 'fixed', ref_value: '', ref_base: '', ref_trigger: '',
  coverage_steps: COVERAGE_DEFAULTS.map(s => ({ ...s })),
  qualification: '',
  ref_months: '',
}

function menuToForm(m: MenuRow): MenuForm {
  return {
    name:           m.name,
    ref_type:       m.ref_type,
    ref_value:      String(m.ref_value ?? ''),
    ref_base:       m.ref_base ?? '',
    ref_trigger:    m.ref_trigger ?? '',
    coverage_steps: Array.isArray(m.coverage_steps) && m.coverage_steps.length === 5
                    ? m.coverage_steps
                    : COVERAGE_DEFAULTS.map(s => ({ ...s })),
    qualification:  m.qualification ?? '',
    ref_months:     m.ref_months && m.ref_months > 1 ? String(m.ref_months) : '',
  }
}

function formToMenuPayload(f: MenuForm) {
  return {
    name:           f.name,
    category:       'referral',
    ref_type:       f.ref_type,
    ref_value:      f.ref_value ? Number(f.ref_value) : 0,
    ref_base:       f.ref_type === 'rate' ? (f.ref_base || null) : null,
    ref_trigger:    f.ref_trigger || null,
    coverage_steps: f.coverage_steps,
    qualification:  f.qualification || null,
    ref_months:     f.ref_months ? Number(f.ref_months) : null,
  }
}

function svcFormToPayload(f: ServiceForm) {
  return {
    name:           f.name,
    subtitle:       f.subtitle       || null,
    description:    f.description    || null,
    who:            f.who            || null,
    url:            f.url            || null,
    logo_path:      f.logo_path      || null,
    active:         f.active,
    icon:           f.icon,
    color:          f.color,
    coop_enabled:   f.coop_enabled,
    coop_rate:      f.coop_enabled && f.coop_rate ? Number(f.coop_rate) : null,
    coop_base:      f.coop_enabled ? (f.coop_base || null) : null,
    ft_trigger:     f.coop_enabled ? (f.coop_trigger || null) : null,
    ft_condition:   f.coop_enabled ? (f.coop_condition || null) : null,
    coverage_steps: f.coop_enabled ? f.coop_coverage : null,
  }
}

function svcToForm(svc: ServiceWithMenus): ServiceForm {
  const rawCov = Array.isArray(svc.coverage_steps) && svc.coverage_steps.length === 5
    ? svc.coverage_steps
    : COVERAGE_DEFAULTS.map(s => ({ ...s }))
  return {
    name:           svc.name,
    subtitle:       svc.subtitle    ?? '',
    description:    svc.description ?? '',
    who:            svc.who         ?? '',
    url:            svc.url         ?? '',
    logo_path:      svc.logo_path   ?? '',
    active:         svc.active,
    icon:           svc.icon        || 'arrows',
    color:          svc.color       || '#4733e6',
    coop_enabled:   svc.coop_enabled ?? false,
    coop_rate:      svc.coop_rate   ? String(svc.coop_rate) : '',
    coop_base:      svc.coop_base   ?? '',
    coop_trigger:   svc.ft_trigger  ?? '',
    coop_condition: svc.ft_condition ?? '',
    coop_coverage:  rawCov,
  }
}

// ─── UI helpers ───────────────────────────────────────────────────────────────

function Fld({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 10 }}>
      <label style={{ fontSize: '.62rem', fontWeight: 700, color: 'var(--muted2)', letterSpacing: '.04em' }}>{label}</label>
      {children}
    </div>
  )
}

const inputStyle: React.CSSProperties = {
  border: '1.5px solid var(--line)', borderRadius: 7, padding: '8px 11px',
  fontFamily: 'inherit', fontSize: '.82rem', color: 'var(--txt)', background: '#fff',
  width: '100%', boxSizing: 'border-box',
}

function FInput({ value, onChange, placeholder, type = 'text' }: {
  value: string; onChange: (v: string) => void; placeholder?: string; type?: string
}) {
  return <input value={value} type={type} onChange={e => onChange(e.target.value)} placeholder={placeholder} style={inputStyle} />
}

function FTextarea({ value, onChange, placeholder, rows = 3 }: {
  value: string; onChange: (v: string) => void; placeholder?: string; rows?: number
}) {
  return <textarea value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} rows={rows} style={{ ...inputStyle, resize: 'vertical' }} />
}

function FSelect({ value, onChange, options, placeholder }: {
  value: string; onChange: (v: string) => void
  options: { v: string | number; l: string }[]; placeholder?: string
}) {
  return (
    <select value={value} onChange={e => onChange(e.target.value)} style={inputStyle}>
      {placeholder && <option value="">{placeholder}</option>}
      {options.map(o => <option key={o.v} value={o.v}>{o.l}</option>)}
    </select>
  )
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      fontSize: '.58rem', fontWeight: 700, color: 'var(--blue)', letterSpacing: '.12em',
      textTransform: 'uppercase', marginBottom: 12,
      paddingTop: 16, borderTop: '1px solid var(--line)', marginTop: 4,
    }}>
      {children}
    </div>
  )
}

function Toggle2({ val, onA, onB, labelA, labelB }: {
  val: boolean; onA: () => void; onB: () => void; labelA: string; labelB: string
}) {
  return (
    <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
      {[{ active: !val, fn: onA, label: labelA }, { active: val, fn: onB, label: labelB }].map(({ active, fn, label }) => (
        <button key={label} type="button" onClick={fn} style={{
          flex: 1, padding: '8px 0', borderRadius: 7, cursor: 'pointer', fontFamily: 'inherit', fontSize: '.74rem', fontWeight: 700,
          border: `1.5px solid ${active ? 'var(--blue)' : 'var(--line)'}`,
          background: active ? 'var(--blue-bg2)' : '#fff',
          color: active ? 'var(--blue)' : 'var(--muted2)',
        }}>{label}</button>
      ))}
    </div>
  )
}

// ─── Service Logo (neutral placeholder when no logo) ──────────────────────────

function ServiceLogo({ logoPath, name, size = 44 }: { logoPath: string | null; name: string; size?: number }) {
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

// ─── Logo Upload ──────────────────────────────────────────────────────────────

function LogoUpload({ logoPath, name, onUpload }: { logoPath: string; name: string; onUpload: (url: string) => void }) {
  const fileRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)
  const [err, setErr] = useState('')

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setErr(''); setUploading(true)
    try {
      const sb = createClient()
      const ext = file.name.split('.').pop() ?? 'png'
      const path = `logos/${Date.now()}.${ext}`
      const { error: upErr } = await sb.storage.from('service-logos').upload(path, file, { upsert: true, contentType: file.type })
      if (upErr) { setErr(upErr.message); return }
      const { data } = sb.storage.from('service-logos').getPublicUrl(path)
      onUpload(data.publicUrl)
    } catch (ex: unknown) {
      setErr((ex as Error).message ?? 'アップロード失敗')
    } finally {
      setUploading(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  return (
    <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
      <ServiceLogo logoPath={logoPath || null} name={name || '?'} size={52} />
      <div style={{ flex: 1 }}>
        <button type="button" onClick={() => fileRef.current?.click()} disabled={uploading}
          style={{ fontSize: '.72rem', fontWeight: 700, color: 'var(--blue)', background: 'var(--blue-bg2)', border: 'none', borderRadius: 7, padding: '7px 14px', cursor: uploading ? 'not-allowed' : 'pointer', fontFamily: 'inherit', opacity: uploading ? .6 : 1 }}>
          {uploading ? 'アップロード中…' : logoPath ? '画像を変更' : '画像を選択（PNG/SVG推奨）'}
        </button>
        {logoPath && (
          <button type="button" onClick={() => onUpload('')}
            style={{ marginLeft: 8, fontSize: '.68rem', color: 'var(--muted2)', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit' }}>
            削除
          </button>
        )}
        {err && <p style={{ fontSize: '.62rem', color: 'var(--red)', marginTop: 4 }}>{err}</p>}
        <input ref={fileRef} type="file" accept="image/*" onChange={handleFile} style={{ display: 'none' }} />
      </div>
    </div>
  )
}

// ─── Coverage steps editor ────────────────────────────────────────────────────

function CoverageEditor({ steps, onChange }: {
  steps: CoverageStep[]
  onChange: (steps: CoverageStep[]) => void
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      {steps.map((step, i) => (
        <label key={step.label} style={{
          display: 'flex', alignItems: 'center', gap: 9, padding: '7px 10px', borderRadius: 7,
          border: `1.5px solid ${step.included ? 'var(--txt)' : 'var(--line)'}`,
          background: step.included ? '#F0F0F4' : '#fff',
          cursor: i === 0 ? 'default' : 'pointer',
        }}>
          <input type="checkbox" checked={step.included} disabled={i === 0}
            onChange={e => {
              if (i === 0) return
              onChange(steps.map((s, j) => j === i ? { ...s, included: e.target.checked } : s))
            }}
            style={{ accentColor: 'var(--txt)', width: 14, height: 14 }} />
          <span style={{ fontSize: '.78rem', fontWeight: i === 0 ? 700 : 500, color: step.included ? 'var(--txt)' : 'var(--muted2)' }}>
            {step.label}
            {i === 0 && <span style={{ fontSize: '.58rem', marginLeft: 5, opacity: .55 }}>必須</span>}
          </span>
        </label>
      ))}
    </div>
  )
}

// ─── Coverage tags (display only) ─────────────────────────────────────────────

export function CoverageTags({ steps, accent = false }: {
  steps: { label: string; included: boolean }[] | null
  accent?: boolean
}) {
  if (!steps) return null
  const included = steps.filter(s => s.included)
  if (included.length === 0) return null
  return (
    <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginTop: 4 }}>
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

// ─── Referral menu inline edit form ──────────────────────────────────────────

function MenuEditForm({ form, onChange, onSave, onCancel, saving, error }: {
  form: MenuForm; onChange: (f: MenuForm) => void
  onSave: () => void; onCancel: () => void; saving: boolean; error: string
}) {
  const f = form
  const set = (patch: Partial<MenuForm>) => onChange({ ...f, ...patch })

  return (
    <div style={{ background: '#F5F5FA', border: '1.5px solid var(--blue)', borderRadius: 10, padding: '14px 14px 10px', marginBottom: 8 }}>

      <Fld label="メニュー名 *">
        <FInput value={f.name} onChange={v => set({ name: v })} placeholder="例: 賃貸成約時" />
      </Fld>

      <Fld label="報酬タイプ">
        <div style={{ display: 'flex', gap: 8 }}>
          {(['fixed', 'rate'] as const).map(t => (
            <button key={t} type="button" onClick={() => set({ ref_type: t })}
              style={{
                flex: 1, padding: '7px 0', borderRadius: 7, cursor: 'pointer', fontFamily: 'inherit', fontSize: '.74rem', fontWeight: 700,
                border: `1.5px solid ${f.ref_type === t ? 'var(--blue)' : 'var(--line)'}`,
                background: f.ref_type === t ? 'var(--blue-bg2)' : '#fff',
                color: f.ref_type === t ? 'var(--blue)' : 'var(--muted2)',
              }}>
              {t === 'fixed' ? '固定額（円）' : '率（%）'}
            </button>
          ))}
        </div>
      </Fld>

      {f.ref_type === 'fixed' ? (
        <Fld label="金額（円）">
          <FInput value={f.ref_value} onChange={v => set({ ref_value: v })} placeholder="30000" type="number" />
        </Fld>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          <Fld label="率（%）">
            <FInput value={f.ref_value} onChange={v => set({ ref_value: v })} placeholder="10" type="number" />
          </Fld>
          <Fld label="基準">
            <FSelect value={f.ref_base} onChange={v => set({ ref_base: v })}
              options={BASE_OPTIONS.map(b => ({ v: b, l: b }))} placeholder="選択" />
          </Fld>
        </div>
      )}

      <Fld label="報酬発生条件（成果地点）">
        <FInput value={f.ref_trigger} onChange={v => set({ ref_trigger: v })} placeholder="例: 賃貸成約で確定" />
      </Fld>

      <div style={{ marginBottom: 10 }}>
        <label style={{ fontSize: '.62rem', fontWeight: 700, color: 'var(--muted2)', display: 'block', marginBottom: 6, letterSpacing: '.04em' }}>
          対応範囲
        </label>
        <CoverageEditor steps={f.coverage_steps} onChange={steps => set({ coverage_steps: steps })} />
      </div>

      <Fld label="資格条件（任意）">
        <FInput value={f.qualification} onChange={v => set({ qualification: v })} placeholder="例: 宅建業免許が必要" />
      </Fld>

      <Fld label="継続（任意・ヶ月）">
        <FInput value={f.ref_months} onChange={v => set({ ref_months: v })} placeholder="例: 12" type="number" />
      </Fld>

      {error && <p style={{ fontSize: '.68rem', color: 'var(--red)', margin: '6px 0 4px' }}>{error}</p>}

      <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
        <button type="button" onClick={onCancel}
          style={{ flex: 1, padding: '8px 0', borderRadius: 7, border: '1.5px solid var(--line)', background: '#fff', color: 'var(--muted2)', fontSize: '.74rem', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}>
          キャンセル
        </button>
        <button type="button" onClick={onSave} disabled={saving || !f.name}
          style={{ flex: 2, padding: '8px 0', borderRadius: 7, border: 'none', background: 'var(--blue)', color: '#fff', fontSize: '.74rem', fontWeight: 700, cursor: saving ? 'not-allowed' : 'pointer', opacity: saving || !f.name ? .5 : 1, fontFamily: 'inherit' }}>
          {saving ? '保存中…' : '保存'}
        </button>
      </div>
    </div>
  )
}

// ─── Chips ────────────────────────────────────────────────────────────────────

function RefChip() {
  return <span className="chip chip-referral" style={{ flexShrink: 0 }}>紹介</span>
}

function CoopChip() {
  return <span className="chip chip-cooperation" style={{ flexShrink: 0 }}>協力</span>
}

function Btn2({ label, onClick, danger }: { label: string; onClick: () => void; danger?: boolean }) {
  return (
    <button type="button" onClick={onClick} style={{
      fontSize: '.6rem', fontWeight: 700, padding: '4px 8px', borderRadius: 5,
      border: '1px solid var(--line)', background: danger ? '#FBE9E9' : '#fff',
      color: danger ? 'var(--red)' : 'var(--muted2)', cursor: 'pointer', fontFamily: 'inherit',
    }}>{label}</button>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function ServicesClient({ initialServices }: { initialServices: ServiceWithMenus[] }) {
  const [services, setServices]  = useState(initialServices)
  const [editing, setEditing]    = useState<ServiceWithMenus | null>(null)
  const [showAdd, setShowAdd]    = useState(false)
  const [svcForm, setSvcForm]    = useState<ServiceForm>(defaultServiceForm)
  const [submitting, startTrans] = useTransition()
  const [toast, setToast]        = useState('')
  const [svcError, setSvcError]  = useState('')

  const [menuEditId, setMenuEditId] = useState<string | null>(null)
  const [menuForm, setMenuForm]     = useState<MenuForm>(defaultMenuForm)
  const [menuSaving, setMenuSaving] = useState(false)
  const [menuError, setMenuError]   = useState('')
  const [liveMenus, setLiveMenus]   = useState<MenuRow[]>([])

  function showToast(msg: string) { setToast(msg); setTimeout(() => setToast(''), 2500) }

  function openEdit(svc: ServiceWithMenus) {
    setSvcForm(svcToForm(svc))
    setEditing(svc); setShowAdd(false)
    setLiveMenus([...svc.service_menus].sort((a, b) => a.sort - b.sort))
    setMenuEditId(null); setSvcError('')
  }

  function openAdd() {
    setSvcForm({ ...defaultServiceForm, coop_coverage: COVERAGE_DEFAULTS.map(s => ({ ...s })) })
    setEditing(null); setShowAdd(true)
    setLiveMenus([]); setMenuEditId(null); setSvcError('')
  }

  function closeDrawer() {
    setEditing(null); setShowAdd(false); setMenuEditId(null); setSvcError('')
  }

  const setF = (patch: Partial<ServiceForm>) => setSvcForm(f => ({ ...f, ...patch }))

  // ── Service save ──────────────────────────────────────────────────────────
  function saveService(e: React.FormEvent) {
    e.preventDefault()
    if (!svcForm.name) { setSvcError('サービス名を入力してください'); return }
    setSvcError('')
    startTrans(async () => {
      const url    = editing ? `/api/console/services/${editing.id}` : '/api/console/services'
      const method = editing ? 'PATCH' : 'POST'
      const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(svcFormToPayload(svcForm)) })
      if (!res.ok) { setSvcError(await res.text()); return }
      const data = await res.json()
      if (editing) {
        setServices(prev => prev.map(s => s.id === editing.id ? { ...s, ...data.service, service_menus: liveMenus } : s))
      } else {
        setServices(prev => [...prev, { ...data.service, service_menus: [] }])
      }
      showToast(editing ? '保存しました — パートナー画面へ反映' : 'サービスを追加しました')
      closeDrawer()
    })
  }

  function toggleActive(svc: ServiceWithMenus) {
    startTrans(async () => {
      const res = await fetch(`/api/console/services/${svc.id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ active: !svc.active }),
      })
      if (res.ok) {
        setServices(prev => prev.map(s => s.id === svc.id ? { ...s, active: !s.active } : s))
        showToast(svc.active ? '停止しました' : '公開しました')
      }
    })
  }

  // ── Menu CRUD ─────────────────────────────────────────────────────────────
  function startAddMenu() {
    setMenuForm({ ...defaultMenuForm, coverage_steps: COVERAGE_DEFAULTS.map(s => ({ ...s })) })
    setMenuEditId('new'); setMenuError('')
  }
  function startEditMenu(m: MenuRow) { setMenuForm(menuToForm(m)); setMenuEditId(m.id); setMenuError('') }

  async function saveMenu() {
    if (!menuForm.name) { setMenuError('メニュー名を入力してください'); return }
    if (menuForm.ref_type === 'rate') {
      const v = Number(menuForm.ref_value)
      if (!v || v <= 0 || v > 100) { setMenuError('率は 0〜100% の範囲で入力してください'); return }
      if (!menuForm.ref_base) { setMenuError('率タイプでは基準を選択してください'); return }
    }
    if (!editing) return
    setMenuSaving(true); setMenuError('')
    try {
      const payload = formToMenuPayload(menuForm)
      if (menuEditId === 'new') {
        const res = await fetch(`/api/console/services/${editing.id}/menus`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
        })
        if (!res.ok) { setMenuError(await res.text()); return }
        const { menu } = await res.json()
        setLiveMenus(prev => [...prev, menu])
        showToast('メニューを追加しました')
      } else {
        const res = await fetch(`/api/console/services/${editing.id}/menus/${menuEditId}`, {
          method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
        })
        if (!res.ok) { setMenuError(await res.text()); return }
        const { menu } = await res.json()
        setLiveMenus(prev => prev.map(m => m.id === menuEditId ? menu : m))
        showToast('メニューを更新しました')
      }
      setMenuEditId(null)
    } finally { setMenuSaving(false) }
  }

  async function deleteMenu(mid: string) {
    if (!editing || !confirm('このメニューを削除しますか?')) return
    const res = await fetch(`/api/console/services/${editing.id}/menus/${mid}`, { method: 'DELETE' })
    if (res.ok) { setLiveMenus(prev => prev.filter(m => m.id !== mid)); showToast('削除しました') }
  }

  async function moveMenu(mid: string, dir: -1 | 1) {
    if (!editing) return
    const idx = liveMenus.findIndex(m => m.id === mid)
    if (idx < 0) return
    const swapIdx = idx + dir
    if (swapIdx < 0 || swapIdx >= liveMenus.length) return
    const next = [...liveMenus]
    ;[next[idx], next[swapIdx]] = [next[swapIdx], next[idx]]
    const updated = next.map((m, i) => ({ ...m, sort: i }))
    setLiveMenus(updated)
    await Promise.all([
      fetch(`/api/console/services/${editing.id}/menus/${updated[idx].id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ sort: updated[idx].sort }) }),
      fetch(`/api/console/services/${editing.id}/menus/${updated[swapIdx].id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ sort: updated[swapIdx].sort }) }),
    ])
  }

  const drawerOpen = !!editing || showAdd

  return (
    <>
      {/* ── Top bar ── */}
      <div style={{ background: 'rgba(255,255,255,.92)', backdropFilter: 'blur(10px)', borderBottom: '1px solid var(--line)', padding: '13px 28px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', position: 'sticky', top: 0, zIndex: 30 }}>
        <h1 style={{ fontSize: '1rem', fontWeight: 900 }}>サービス</h1>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span className="chip chip-direct" style={{ fontVariantNumeric: 'tabular-nums' }}>{services.length} サービス</span>
          <button onClick={openAdd} className="btn btn-p" style={{ fontSize: '.76rem', padding: '8px 16px' }}>＋ 追加</button>
        </div>
      </div>

      {/* ── Service list ── */}
      <div className="page-anim stagger" style={{ padding: '28px', maxWidth: 860 }}>
        {services.length === 0 && <p style={{ fontSize: '.8rem', color: 'var(--muted2)' }}>サービスがありません</p>}
        {services.map(svc => {
          const refMenus = svc.service_menus.filter(m => m.category !== 'cooperation')
          const hasBody  = refMenus.length > 0 || svc.coop_enabled
          return (
            <div key={svc.id} className="card-hover" style={{ background: '#fff', border: '1px solid var(--line)', borderRadius: 16, marginBottom: 16, overflow: 'hidden' }}>

              {/* Header row */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '18px 22px', borderBottom: hasBody ? '1px solid var(--line)' : undefined }}>
                <ServiceLogo logoPath={svc.logo_path} name={svc.name} size={44} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    <b style={{ fontSize: '.9rem' }}>{svc.name}</b>
                    <span onClick={() => toggleActive(svc)} style={{
                      fontSize: '.6rem', fontWeight: 700, padding: '2px 8px', borderRadius: 20, cursor: 'pointer',
                      background: svc.active ? '#E5F3F1' : '#F4F4F7',
                      color: svc.active ? '#15917E' : 'var(--muted2)',
                    }}>
                      {svc.active ? '公開中' : '停止中'}
                    </span>
                  </div>
                  {svc.subtitle && <div style={{ fontSize: '.66rem', color: 'var(--muted2)', marginTop: 3 }}>{svc.subtitle}</div>}
                </div>
                <button onClick={() => openEdit(svc)}
                  style={{ fontSize: '.7rem', color: 'var(--blue)', background: 'var(--blue-bg2)', border: 'none', borderRadius: 8, padding: '7px 14px', cursor: 'pointer', fontFamily: 'inherit', fontWeight: 700, flexShrink: 0 }}>
                  編集
                </button>
              </div>

              {/* Referral menus — blue tint */}
              {refMenus.map((menu, i) => (
                <div key={menu.id} className="lift" style={{
                  padding: '12px 22px',
                  borderTop: i > 0 ? '1px solid #EEF0FF' : undefined,
                  background: '#FAFBFF',
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <RefChip />
                    <span style={{ flex: 1, fontSize: '.78rem', fontWeight: 600, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{menu.name}</span>
                    {menu.ref_trigger && (
                      <span style={{ fontSize: '.62rem', color: 'var(--muted2)', maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flexShrink: 0 }}>
                        {menu.ref_trigger}
                      </span>
                    )}
                    <span style={{ fontFamily: 'Inter', fontWeight: 800, fontSize: '.88rem', color: 'var(--blue)', flexShrink: 0 }}>
                      {menu.ref_type === 'fixed'
                        ? `¥${Number(menu.ref_value).toLocaleString()}`
                        : `${menu.ref_value}%${menu.ref_base ? ` (${menu.ref_base})` : ''}`}
                    </span>
                  </div>
                  <CoverageTags steps={menu.coverage_steps} accent />
                  {menu.qualification && (
                    <div style={{ fontSize: '.58rem', color: 'var(--amber)', marginTop: 4 }}>⚠ {menu.qualification}</div>
                  )}
                </div>
              ))}

              {/* Cooperation — neutral dark tint */}
              {svc.coop_enabled && (
                <div className="lift" style={{
                  padding: '12px 22px',
                  borderTop: refMenus.length > 0 ? '1px solid #EBEBEF' : undefined,
                  background: '#F6F6FA',
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <CoopChip />
                    <span style={{ flex: 1, fontSize: '.78rem', fontWeight: 600, minWidth: 0 }}>
                      協力
                      {svc.ft_trigger && (
                        <span style={{ fontSize: '.62rem', fontWeight: 400, color: 'var(--muted2)', marginLeft: 6 }}>{svc.ft_trigger}</span>
                      )}
                    </span>
                    {svc.ft_condition && (
                      <span style={{ fontSize: '.6rem', color: 'var(--amber)', flexShrink: 0 }}>⚠ {svc.ft_condition}</span>
                    )}
                    <span style={{ fontFamily: 'Inter', fontWeight: 800, fontSize: '.88rem', color: 'var(--txt)', flexShrink: 0 }}>
                      {svc.coop_rate ? `${svc.coop_rate}%` : '-'}
                      {svc.coop_base ? ` (${svc.coop_base})` : ''}
                    </span>
                  </div>
                  <CoverageTags steps={svc.coverage_steps} />
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* ── Drawer overlay ── */}
      {drawerOpen && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(14,14,20,.3)', backdropFilter: 'blur(2px)', zIndex: 40 }}
          onClick={closeDrawer} />
      )}

      {/* ── Drawer ── */}
      <div style={{
        position: 'fixed', right: drawerOpen ? 0 : '-520px', top: 0, height: '100vh', width: 500,
        background: '#fff', borderLeft: '1px solid var(--line)', boxShadow: '-8px 0 40px rgba(14,14,20,.12)',
        zIndex: 50, overflowY: 'auto', transition: 'right .3s cubic-bezier(.4,0,.2,1)',
      }}>
        {drawerOpen && (
          <form key={editing?.id ?? 'new'} onSubmit={saveService} className="cascade" style={{ padding: '24px 26px 88px' }}>

            {/* Header */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 22 }}>
              <h2 style={{ fontSize: '.92rem', fontWeight: 900 }}>
                {editing ? 'サービスを編集' : '新しいサービス'}
              </h2>
              <button type="button" onClick={closeDrawer} className="lift"
                style={{ fontSize: '1rem', width: 30, height: 30, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg2)', border: 'none', borderRadius: 8, cursor: 'pointer', color: 'var(--muted2)', lineHeight: 1, flexShrink: 0 }}>✕</button>
            </div>

            {/* ── A. 基本情報 ── */}
            <SectionLabel>A. 基本情報</SectionLabel>

            <Fld label="ロゴ画像（推奨）">
              <LogoUpload logoPath={svcForm.logo_path} name={svcForm.name} onUpload={v => setF({ logo_path: v })} />
            </Fld>

            <Fld label="サービス名 *">
              <FInput value={svcForm.name} onChange={v => setF({ name: v })} placeholder="MOOM" />
            </Fld>

            <Fld label="サブタイトル">
              <FInput value={svcForm.subtitle} onChange={v => setF({ subtitle: v })} placeholder="賃貸仲介プラットフォーム" />
            </Fld>

            <Fld label="サービスサイト URL">
              <FInput value={svcForm.url} onChange={v => setF({ url: v })} placeholder="https://example.com" />
            </Fld>

            <Fld label="説明">
              <FTextarea value={svcForm.description} onChange={v => setF({ description: v })} placeholder="サービスの概要を記載" />
            </Fld>

            <Fld label="こんな方に（Who）">
              <FInput value={svcForm.who} onChange={v => setF({ who: v })} placeholder="不動産業に従事する方、物件を探している方" />
            </Fld>

            <Fld label="公開状態">
              <Toggle2
                val={svcForm.active}
                onA={() => setF({ active: false })}
                onB={() => setF({ active: true })}
                labelA="停止中"
                labelB="公開中"
              />
            </Fld>

            {/* ── B. 紹介メニュー（編集時のみ） ── */}
            {editing && (
              <>
                <SectionLabel>B. 紹介メニューと報酬</SectionLabel>

                {liveMenus.filter(m => m.category !== 'cooperation').map((menu, i, arr) => (
                  <div key={menu.id}>
                    {menuEditId === menu.id ? (
                      <MenuEditForm
                        form={menuForm} onChange={setMenuForm}
                        onSave={saveMenu} onCancel={() => setMenuEditId(null)}
                        saving={menuSaving} error={menuError}
                      />
                    ) : (
                      <div style={{ background: '#F8F9FF', border: '1px solid #DDE2FF', borderRadius: 9, marginBottom: 6, overflow: 'hidden' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '9px 12px' }}>
                          <RefChip />
                          <span style={{ flex: 1, fontSize: '.8rem', fontWeight: 600, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{menu.name}</span>
                          <span style={{ fontFamily: 'Inter', fontWeight: 700, fontSize: '.82rem', color: 'var(--blue)', flexShrink: 0 }}>
                            {menu.ref_type === 'fixed' ? `¥${Number(menu.ref_value).toLocaleString()}` : `${menu.ref_value}%`}
                          </span>
                          <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
                            {i > 0 && <Btn2 label="↑" onClick={() => moveMenu(menu.id, -1)} />}
                            {i < arr.length - 1 && <Btn2 label="↓" onClick={() => moveMenu(menu.id, 1)} />}
                            <Btn2 label="編集" onClick={() => startEditMenu(menu)} />
                            <Btn2 label="削除" onClick={() => deleteMenu(menu.id)} danger />
                          </div>
                        </div>
                        {menu.coverage_steps && (
                          <div style={{ padding: '0 12px 8px' }}>
                            <CoverageTags steps={menu.coverage_steps} accent />
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                ))}

                {menuEditId === 'new' ? (
                  <MenuEditForm
                    form={menuForm} onChange={setMenuForm}
                    onSave={saveMenu} onCancel={() => setMenuEditId(null)}
                    saving={menuSaving} error={menuError}
                  />
                ) : (
                  <button type="button" onClick={startAddMenu}
                    style={{ width: '100%', padding: '8px 0', borderRadius: 8, border: '1.5px dashed var(--blue)', background: 'var(--blue-bg2)', color: 'var(--blue)', fontSize: '.74rem', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', marginBottom: 4 }}>
                    ＋ メニューを追加
                  </button>
                )}
              </>
            )}

            {/* ── C. 協力設定 ── */}
            <SectionLabel>C. 協力設定（サービス単位）</SectionLabel>

            <Toggle2
              val={svcForm.coop_enabled}
              onA={() => setF({ coop_enabled: false })}
              onB={() => setF({ coop_enabled: true })}
              labelA="協力なし（紹介のみ）"
              labelB="協力あり"
            />

            {svcForm.coop_enabled && (
              <>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                  <Fld label="協力率（%）">
                    <FInput value={svcForm.coop_rate} onChange={v => setF({ coop_rate: v })} placeholder="50" type="number" />
                  </Fld>
                  <Fld label="協力基準">
                    <FSelect value={svcForm.coop_base} onChange={v => setF({ coop_base: v })}
                      options={BASE_OPTIONS.map(b => ({ v: b, l: b }))} placeholder="選択" />
                  </Fld>
                </div>

                <Fld label="協力の成果地点">
                  <FInput value={svcForm.coop_trigger} onChange={v => setF({ coop_trigger: v })} placeholder="共同仲介を担当" />
                </Fld>

                <Fld label="協力の資格条件（任意）">
                  <FInput value={svcForm.coop_condition} onChange={v => setF({ coop_condition: v })} placeholder="例: 宅建業免許が必要" />
                </Fld>

                <div style={{ marginBottom: 12 }}>
                  <label style={{ fontSize: '.62rem', fontWeight: 700, color: 'var(--muted2)', display: 'block', marginBottom: 6, letterSpacing: '.04em' }}>
                    協力の対応範囲
                  </label>
                  <CoverageEditor
                    steps={svcForm.coop_coverage}
                    onChange={steps => setF({ coop_coverage: steps })}
                  />
                </div>
              </>
            )}

            {svcError && <p style={{ fontSize: '.72rem', color: 'var(--red)', marginTop: 8 }}>{svcError}</p>}

            <div style={{ marginTop: 16 }}>
              <button type="submit" disabled={submitting || !svcForm.name} className="btn btn-p"
                style={{ width: '100%', opacity: submitting || !svcForm.name ? .5 : 1 }}>
                {submitting ? '保存中…' : '保存してパートナー画面へ反映'}
                <span style={{ width: 5, height: 5, borderRadius: '50%', background: 'currentColor', opacity: .85 }} />
              </button>
            </div>
          </form>
        )}
      </div>

      {/* ── Toast ── */}
      <div style={{
        position: 'fixed', bottom: 32, right: 32,
        transform: `translateY(${toast ? 0 : 16}px)`,
        background: 'var(--txt)', color: '#fff', padding: '12px 22px',
        borderRadius: 9, fontSize: '.74rem', fontWeight: 600,
        opacity: toast ? 1 : 0, pointerEvents: 'none',
        transition: 'all .28s', zIndex: 130, whiteSpace: 'nowrap',
        boxShadow: '0 8px 28px rgba(14,14,20,.18)',
      }}>
        {toast}
      </div>
    </>
  )
}
