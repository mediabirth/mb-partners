'use client'
import { useState, useTransition } from 'react'
import ServiceIcon from '@/components/ServiceIcon'
import type { ServiceWithMenus } from '@/lib/supabase/queries'

const ICON_OPTIONS = ['home', 'solar', 'insurance', 'tax', 'estate', 'medical', 'fund', 'card', 'car']
const COLOR_OPTIONS = ['#4733E6', '#1E9E6A', '#C07A12', '#D34545', '#0ea5e9', '#8b5cf6', '#ec4899', '#14b8a6']

type ServiceForm = {
  name: string; subtitle: string; icon: string; color: string
  description: string; who: string; url: string; active: boolean
}

const defaultForm: ServiceForm = {
  name: '', subtitle: '', icon: 'home', color: '#4733E6',
  description: '', who: '', url: '', active: true,
}

export default function ServicesClient({ initialServices }: { initialServices: ServiceWithMenus[] }) {
  const [services, setServices]     = useState(initialServices)
  const [editing, setEditing]       = useState<ServiceWithMenus | null>(null)
  const [showAdd, setShowAdd]       = useState(false)
  const [form, setForm]             = useState<ServiceForm>(defaultForm)
  const [submitting, startTransition] = useTransition()
  const [toast, setToast]           = useState('')
  const [error, setError]           = useState('')

  function showToast(msg: string) { setToast(msg); setTimeout(() => setToast(''), 2200) }

  function openEdit(svc: ServiceWithMenus) {
    setForm({
      name: svc.name, subtitle: svc.subtitle ?? '', icon: svc.icon,
      color: svc.color, description: svc.description ?? '',
      who: svc.who ?? '', url: svc.url ?? '', active: svc.active,
    })
    setEditing(svc)
    setShowAdd(false)
  }

  function openAdd() {
    setForm(defaultForm)
    setEditing(null)
    setShowAdd(true)
  }

  function closeDrawer() { setEditing(null); setShowAdd(false); setError('') }

  function saveService(e: React.FormEvent) {
    e.preventDefault()
    if (!form.name) { setError('サービス名を入力してください'); return }
    setError('')
    startTransition(async () => {
      const url = editing
        ? `/api/console/services/${editing.id}`
        : '/api/console/services'
      const method = editing ? 'PATCH' : 'POST'
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
      if (!res.ok) { setError(await res.text()); return }
      const data = await res.json()
      if (editing) {
        setServices(prev => prev.map(s => s.id === editing.id ? { ...s, ...data.service } : s))
        showToast('サービスを更新しました')
      } else {
        setServices(prev => [{ ...data.service, service_menus: [] }, ...prev])
        showToast('サービスを追加しました')
      }
      closeDrawer()
    })
  }

  function toggleActive(svc: ServiceWithMenus) {
    startTransition(async () => {
      const res = await fetch(`/api/console/services/${svc.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ active: !svc.active }),
      })
      if (res.ok) {
        setServices(prev => prev.map(s => s.id === svc.id ? { ...s, active: !s.active } : s))
        showToast(svc.active ? '無効にしました' : '有効にしました')
      }
    })
  }

  const drawerOpen = !!editing || showAdd

  return (
    <>
      {/* Top bar */}
      <div style={{ background: 'rgba(255,255,255,.92)', backdropFilter: 'blur(10px)', borderBottom: '1px solid var(--line)', padding: '13px 28px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', position: 'sticky', top: 0, zIndex: 30 }}>
        <h1 style={{ fontSize: '1rem', fontWeight: 900 }}>サービス・報酬ルール</h1>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: '.72rem', color: 'var(--muted2)' }}>{services.length}サービス</span>
          <button onClick={openAdd} className="btn btn-p" style={{ fontSize: '.76rem', padding: '8px 16px' }}>
            + 追加
          </button>
        </div>
      </div>

      <div style={{ padding: '24px 28px', maxWidth: 860 }}>
        {services.length === 0 && (
          <p style={{ fontSize: '.8rem', color: 'var(--muted2)' }}>サービスがありません</p>
        )}
        {services.map(svc => (
          <div key={svc.id} style={{ background: '#fff', border: '1px solid var(--line)', borderRadius: 14, marginBottom: 14, overflow: 'hidden' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '16px 20px', borderBottom: svc.service_menus.length > 0 ? '1px solid var(--line)' : undefined }}>
              <ServiceIcon icon={svc.icon} color={svc.color} size={44} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <b style={{ fontSize: '.9rem' }}>{svc.name}</b>
                  <span style={{ fontSize: '.6rem', fontWeight: 700, padding: '2px 8px', borderRadius: 20, background: svc.active ? '#E5F3F1' : '#F4F4F7', color: svc.active ? '#15917E' : 'var(--muted2)', cursor: 'pointer' }}
                    onClick={() => toggleActive(svc)}>
                    {svc.active ? '有効' : '無効'}
                  </span>
                </div>
                {svc.subtitle && (
                  <div style={{ fontSize: '.66rem', color: 'var(--muted2)', marginTop: 3 }}>{svc.subtitle}</div>
                )}
              </div>
              <button
                onClick={() => openEdit(svc)}
                style={{ fontSize: '.7rem', color: 'var(--blue)', background: 'var(--blue-bg2)', border: 'none', borderRadius: 8, padding: '7px 14px', cursor: 'pointer', fontFamily: 'inherit', fontWeight: 700 }}
              >
                編集
              </button>
            </div>

            {svc.service_menus.length > 0 && (
              <div>
                <div style={{ padding: '10px 20px 6px', fontSize: '.62rem', fontWeight: 700, color: 'var(--muted2)', letterSpacing: '.04em' }}>
                  報酬メニュー
                </div>
                {svc.service_menus.map((menu, i) => (
                  <div key={menu.id} style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 12, padding: '10px 20px', borderTop: i > 0 ? '1px solid #F2F2F6' : undefined, alignItems: 'center' }}>
                    <div>
                      <div style={{ fontSize: '.78rem', fontWeight: 700 }}>{menu.name}</div>
                      {menu.example_ref && (
                        <div style={{ fontSize: '.62rem', color: 'var(--muted2)', marginTop: 2 }}>{menu.example_ref}</div>
                      )}
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontSize: '.8rem', fontWeight: 800, fontFamily: 'Inter', color: 'var(--blue)' }}>
                        {menu.ref_type === 'fixed' ? `¥${menu.ref_value.toLocaleString()}` : `${menu.ref_value}%`}
                      </div>
                      <div style={{ fontSize: '.58rem', color: 'var(--muted2)', marginTop: 1 }}>
                        {menu.ref_type === 'fixed' ? '固定' : 'レート'}{menu.ref_trigger ? ` · ${menu.ref_trigger}` : ''}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {svc.service_menus.length === 0 && (
              <div style={{ padding: '12px 20px', fontSize: '.72rem', color: 'var(--muted2)' }}>
                報酬メニューなし
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Edit/Add drawer */}
      {drawerOpen && (
        <>
          <div onClick={closeDrawer} style={{ position: 'fixed', inset: 0, background: 'rgba(14,14,20,.25)', zIndex: 70 }} />
          <div style={{ position: 'fixed', top: 0, right: 0, width: 480, maxWidth: '96vw', height: '100%', background: '#fff', borderLeft: '1px solid var(--line)', zIndex: 80, display: 'flex', flexDirection: 'column', boxShadow: '-18px 0 48px rgba(14,14,20,.1)', animation: 'slideIn .22s ease' }}>
            <style>{`@keyframes slideIn { from { transform: translateX(100%) } to { transform: translateX(0) } }`}</style>
            <div style={{ padding: '18px 22px', borderBottom: '1px solid var(--line)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <b style={{ fontSize: '.9rem' }}>{editing ? 'サービスを編集' : 'サービスを追加'}</b>
              <button onClick={closeDrawer} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)', fontSize: '1.1rem', width: 30, height: 30, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>✕</button>
            </div>
            <form onSubmit={saveService} style={{ flex: 1, overflowY: 'auto', padding: '20px 22px', display: 'flex', flexDirection: 'column', gap: 0 }}>
              <div className="fld">
                <label>サービス名 *</label>
                <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="不動産" required />
              </div>
              <div className="fld">
                <label>サブタイトル</label>
                <input value={form.subtitle} onChange={e => setForm(f => ({ ...f, subtitle: e.target.value }))} placeholder="住まい・投資用物件" />
              </div>
              <div className="fld">
                <label>説明文</label>
                <input value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} placeholder="サービスの概要を入力" />
              </div>
              <div className="fld">
                <label>こんな人に（対象顧客）</label>
                <input value={form.who} onChange={e => setForm(f => ({ ...f, who: e.target.value }))} placeholder="住宅購入・賃貸を検討中の方" />
              </div>
              <div className="fld">
                <label>URL（任意）</label>
                <input value={form.url} onChange={e => setForm(f => ({ ...f, url: e.target.value }))} placeholder="https://..." />
              </div>

              {/* Icon */}
              <div className="fld">
                <label>アイコン</label>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  {ICON_OPTIONS.map(ic => (
                    <button key={ic} type="button" onClick={() => setForm(f => ({ ...f, icon: ic }))}
                      style={{ width: 42, height: 42, borderRadius: 10, border: `2px solid ${form.icon === ic ? 'var(--blue)' : 'var(--line)'}`, background: form.icon === ic ? 'var(--blue-bg2)' : '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <ServiceIcon icon={ic} color={form.icon === ic ? form.color : '#B9BAC4'} size={24} />
                    </button>
                  ))}
                </div>
              </div>

              {/* Color */}
              <div className="fld">
                <label>カラー</label>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  {COLOR_OPTIONS.map(c => (
                    <button key={c} type="button" onClick={() => setForm(f => ({ ...f, color: c }))}
                      style={{ width: 30, height: 30, borderRadius: '50%', background: c, border: form.color === c ? '3px solid var(--txt)' : '2px solid transparent', cursor: 'pointer' }} />
                  ))}
                </div>
              </div>

              {/* Active toggle */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
                <div>
                  <div style={{ fontSize: '.8rem', fontWeight: 600 }}>有効</div>
                  <div style={{ fontSize: '.62rem', color: 'var(--muted2)' }}>パートナーに表示する</div>
                </div>
                <button type="button" onClick={() => setForm(f => ({ ...f, active: !f.active }))}
                  style={{ width: 42, height: 24, borderRadius: 12, border: 'none', cursor: 'pointer', background: form.active ? 'var(--blue)' : 'var(--line)', padding: 0, position: 'relative', transition: 'background .2s' }}>
                  <span style={{ position: 'absolute', top: 3, left: form.active ? 21 : 3, width: 18, height: 18, borderRadius: '50%', background: '#fff', boxShadow: '0 1px 4px rgba(0,0,0,.2)', transition: 'left .2s' }} />
                </button>
              </div>

              {error && <p style={{ fontSize: '.7rem', color: 'var(--red)', marginBottom: 10 }}>{error}</p>}
              <button type="submit" disabled={submitting} className="btn btn-p" style={{ width: '100%', marginTop: 8 }}>
                {submitting ? '保存中...' : editing ? '更新する' : '追加する'}
              </button>
            </form>
          </div>
        </>
      )}

      {toast && (
        <div style={{
          position: 'fixed', bottom: 28, left: '50%', transform: 'translateX(-50%)',
          background: 'var(--txt)', color: '#fff', padding: '12px 22px',
          borderRadius: 9, fontSize: '.74rem', fontWeight: 600, zIndex: 99, whiteSpace: 'nowrap',
        }}>
          {toast}
        </div>
      )}
    </>
  )
}
