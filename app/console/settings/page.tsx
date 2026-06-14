'use client'
import { useState, useEffect } from 'react'
import ConsoleNav from '@/components/ConsoleNav'

// ─── Types ───────────────────────────────────────────────────────────────────
type PayCycle = 'monthly_end' | 'monthly_20' | 'bimonthly'
type AdminUser = { id: string; name: string; email: string; role: 'admin' | 'viewer'; color: string }
type AuditLog  = { id: string; actor_name: string; category: string; target: string; action: string; created_at: string }

const AUDIT_CATEGORIES = ['', '案件', '支払', '配信', '権限', '問い合わせ'] as const

const PAY_CYCLE_LABELS: Record<PayCycle, string> = {
  monthly_end: '月末締め翌月末払い',
  monthly_20: '月末締め翌月20日払い',
  bimonthly: '隔月末払い',
}

const ADMIN_MOCK: AdminUser[] = [
  { id: '1', name: '運営管理者', email: 'admin@mb-partners.jp', role: 'admin', color: '#4733E6' },
]

function Toggle({ on, onChange }: { on: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      onClick={() => onChange(!on)}
      style={{
        width: 42, height: 24, borderRadius: 12, border: 'none', cursor: 'pointer',
        background: on ? 'var(--blue)' : 'var(--line)', padding: 0, position: 'relative',
        transition: 'background .2s',
      }}
    >
      <span style={{
        position: 'absolute', top: 3, left: on ? 21 : 3, width: 18, height: 18,
        borderRadius: '50%', background: '#fff',
        boxShadow: '0 1px 4px rgba(0,0,0,.2)',
        transition: 'left .2s cubic-bezier(.2,.8,.2,1)',
      }} />
    </button>
  )
}

function SectionCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ background: '#fff', border: '1px solid var(--line)', borderRadius: 14, marginBottom: 18, overflow: 'hidden' }}>
      <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--line)' }}>
        <b style={{ fontSize: '.84rem' }}>{title}</b>
      </div>
      <div style={{ padding: '16px 20px' }}>{children}</div>
    </div>
  )
}

function RowItem({ label, desc, children }: { label: string; desc?: string; children?: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingBottom: 14, marginBottom: 14, borderBottom: '1px solid #F2F2F6' }}>
      <div>
        <div style={{ fontSize: '.8rem', fontWeight: 600 }}>{label}</div>
        {desc && <div style={{ fontSize: '.62rem', color: 'var(--muted2)', marginTop: 2 }}>{desc}</div>}
      </div>
      {children}
    </div>
  )
}

export default function SettingsPage() {
  const [payCycle, setPayCycle]               = useState<PayCycle>('monthly_end')
  const [calEnabled, setCalEnabled]           = useState(false)
  const [calUrl, setCalUrl]                   = useState('')
  const [notifEmail, setNotifEmail]           = useState(true)
  const [notifSlack, setNotifSlack]           = useState(false)
  const [slackWebhook, setSlackWebhook]       = useState('')
  const [admins]                              = useState<AdminUser[]>(ADMIN_MOCK)
  const [inviteEmail, setInviteEmail]         = useState('')
  const [inviteRole, setInviteRole]           = useState<'admin' | 'viewer'>('viewer')
  const [toast, setToast]                     = useState('')
  const [auditLogs, setAuditLogs]             = useState<AuditLog[]>([])
  const [auditCategory, setAuditCategory]     = useState('')
  const [auditLoading, setAuditLoading]       = useState(true)

  useEffect(() => {
    setAuditLoading(true)
    const url = auditCategory
      ? `/api/console/audit-logs?category=${encodeURIComponent(auditCategory)}`
      : '/api/console/audit-logs'
    fetch(url)
      .then(r => r.json())
      .then(d => setAuditLogs(d.logs ?? []))
      .catch(() => setAuditLogs([]))
      .finally(() => setAuditLoading(false))
  }, [auditCategory])

  function exportCsv() {
    const headers = ['日時', '操作者', 'カテゴリ', '対象', 'アクション']
    const rows = auditLogs.map(l => [
      new Date(l.created_at).toLocaleString('ja'),
      l.actor_name, l.category, l.target, l.action,
    ])
    const csv = [headers, ...rows].map(r => r.map(v => `"${String(v ?? '').replace(/"/g, '""')}"`).join(',')).join('\n')
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url; a.download = 'audit_log.csv'; a.click()
    URL.revokeObjectURL(url)
  }

  function showToast(msg: string) {
    setToast(msg)
    setTimeout(() => setToast(''), 2200)
  }

  function savePayCycle() { showToast('支払サイクルを保存しました') }
  function saveCal() { showToast(calEnabled ? 'カレンダー連携を保存しました' : 'カレンダー連携を無効にしました') }
  function saveNotif() { showToast('通知設定を保存しました') }
  function inviteAdmin(e: React.FormEvent) {
    e.preventDefault()
    if (!inviteEmail) return
    showToast(`招待メールを送信しました: ${inviteEmail}`)
    setInviteEmail('')
  }

  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: 'var(--bg2)' }}>
      <ConsoleNav profileName="管理者" profileColor="#0E0E14" />

      <div style={{ flex: 1, marginLeft: 230 }}>
        {/* Top bar */}
        <div style={{ background: 'rgba(255,255,255,.92)', backdropFilter: 'blur(10px)', borderBottom: '1px solid var(--line)', padding: '13px 28px', position: 'sticky', top: 0, zIndex: 30 }}>
          <h1 style={{ fontSize: '1rem', fontWeight: 900 }}>設定</h1>
        </div>

        <div style={{ padding: '28px 28px', maxWidth: 720 }}>

          {/* 1. 支払サイクル */}
          <SectionCard title="支払サイクル">
            <p style={{ fontSize: '.72rem', color: 'var(--muted2)', marginBottom: 14, lineHeight: 1.6 }}>
              パートナーへの報酬支払いサイクルを設定します。変更は翌月分から適用されます。
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 16 }}>
              {(Object.keys(PAY_CYCLE_LABELS) as PayCycle[]).map(k => (
                <label key={k} style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', padding: '10px 14px', borderRadius: 9, border: `1.5px solid ${payCycle === k ? 'var(--blue)' : 'var(--line)'}`, background: payCycle === k ? 'var(--blue-bg2)' : '#fff' }}>
                  <input type="radio" name="payCycle" checked={payCycle === k} onChange={() => setPayCycle(k)} style={{ accentColor: 'var(--blue)' }} />
                  <div>
                    <div style={{ fontSize: '.78rem', fontWeight: payCycle === k ? 700 : 500, color: payCycle === k ? 'var(--blue)' : 'var(--txt)' }}>{PAY_CYCLE_LABELS[k]}</div>
                  </div>
                </label>
              ))}
            </div>
            <button onClick={savePayCycle} className="btn btn-p" style={{ fontSize: '.74rem', padding: '9px 18px' }}>保存する</button>
          </SectionCard>

          {/* 2. 管理者管理 */}
          <SectionCard title="管理者管理">
            <div style={{ marginBottom: 16 }}>
              {admins.map((a, i) => (
                <div key={a.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 0', borderBottom: i < admins.length - 1 ? '1px solid #F2F2F6' : undefined }}>
                  <span style={{ width: 32, height: 32, borderRadius: '50%', background: a.color, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '.68rem', fontWeight: 700 }}>{a.name[0]}</span>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: '.78rem', fontWeight: 700 }}>{a.name}</div>
                    <div style={{ fontSize: '.62rem', color: 'var(--muted2)' }}>{a.email}</div>
                  </div>
                  <span style={{ fontSize: '.6rem', fontWeight: 700, padding: '2px 8px', borderRadius: 20, background: a.role === 'admin' ? 'var(--blue-bg)' : 'var(--bg2)', color: a.role === 'admin' ? 'var(--blue)' : 'var(--muted2)' }}>
                    {a.role === 'admin' ? '管理者' : '閲覧者'}
                  </span>
                </div>
              ))}
            </div>
            <form onSubmit={inviteAdmin} style={{ display: 'flex', gap: 8 }}>
              <input
                type="email"
                value={inviteEmail}
                onChange={e => setInviteEmail(e.target.value)}
                placeholder="招待するメールアドレス"
                style={{ flex: 1, border: '1.5px solid var(--line)', borderRadius: 8, padding: '9px 13px', fontFamily: 'inherit', fontSize: '.8rem' }}
              />
              <select
                value={inviteRole}
                onChange={e => setInviteRole(e.target.value as 'admin' | 'viewer')}
                style={{ border: '1.5px solid var(--line)', borderRadius: 8, padding: '9px 13px', fontFamily: 'inherit', fontSize: '.8rem', background: '#fff' }}
              >
                <option value="admin">管理者</option>
                <option value="viewer">閲覧者</option>
              </select>
              <button type="submit" className="btn btn-p" style={{ fontSize: '.74rem', padding: '9px 14px', flexShrink: 0 }}>招待</button>
            </form>
          </SectionCard>

          {/* 3. カレンダー連携 */}
          <SectionCard title="カレンダー連携">
            <RowItem label="Google カレンダー連携" desc="商談日程を自動でカレンダーに追加します">
              <Toggle on={calEnabled} onChange={setCalEnabled} />
            </RowItem>
            {calEnabled && (
              <div style={{ marginBottom: 14 }}>
                <label style={{ fontSize: '.68rem', fontWeight: 700, color: 'var(--muted2)', display: 'block', marginBottom: 6 }}>カレンダー ID</label>
                <input
                  value={calUrl}
                  onChange={e => setCalUrl(e.target.value)}
                  placeholder="example@group.calendar.google.com"
                  style={{ width: '100%', border: '1.5px solid var(--line)', borderRadius: 8, padding: '9px 13px', fontFamily: 'inherit', fontSize: '.8rem' }}
                />
              </div>
            )}
            <button onClick={saveCal} className="btn btn-g" style={{ fontSize: '.74rem', padding: '9px 18px' }}>保存する</button>
          </SectionCard>

          {/* 4. 通知設定 */}
          <SectionCard title="通知設定">
            <RowItem label="メール通知" desc="新規案件・ステータス変更・支払完了時にメールを受信">
              <Toggle on={notifEmail} onChange={setNotifEmail} />
            </RowItem>
            <RowItem label="Slack 通知" desc="Webhook URL を設定して Slack に通知を送信">
              <Toggle on={notifSlack} onChange={setNotifSlack} />
            </RowItem>
            {notifSlack && (
              <div style={{ marginBottom: 14 }}>
                <label style={{ fontSize: '.68rem', fontWeight: 700, color: 'var(--muted2)', display: 'block', marginBottom: 6 }}>Slack Webhook URL</label>
                <input
                  value={slackWebhook}
                  onChange={e => setSlackWebhook(e.target.value)}
                  placeholder="https://hooks.slack.com/services/..."
                  style={{ width: '100%', border: '1.5px solid var(--line)', borderRadius: 8, padding: '9px 13px', fontFamily: 'monospace', fontSize: '.8rem' }}
                />
              </div>
            )}
            <button onClick={saveNotif} className="btn btn-g" style={{ fontSize: '.74rem', padding: '9px 18px' }}>保存する</button>
          </SectionCard>

          {/* 5. 監査ログ */}
          <SectionCard title="監査ログ">
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14, flexWrap: 'wrap' }}>
              <p style={{ fontSize: '.72rem', color: 'var(--muted2)', flex: 1, lineHeight: 1.6, minWidth: 160 }}>
                管理操作の履歴（直近50件）
              </p>
              <select
                value={auditCategory}
                onChange={e => setAuditCategory(e.target.value)}
                style={{ border: '1.5px solid var(--line)', borderRadius: 8, padding: '6px 11px', fontFamily: 'inherit', fontSize: '.74rem', background: '#fff' }}
              >
                <option value="">全カテゴリ</option>
                {AUDIT_CATEGORIES.filter(Boolean).map(c => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
              <button
                onClick={exportCsv}
                disabled={auditLogs.length === 0}
                style={{ fontSize: '.7rem', color: 'var(--blue)', background: 'var(--blue-bg2)', border: 'none', borderRadius: 8, padding: '7px 14px', cursor: 'pointer', fontFamily: 'inherit', fontWeight: 700 }}
              >
                CSV出力
              </button>
            </div>
            {auditLoading ? (
              <p style={{ fontSize: '.72rem', color: 'var(--muted2)', padding: '10px 0' }}>読み込み中…</p>
            ) : auditLogs.length === 0 ? (
              <p style={{ fontSize: '.72rem', color: 'var(--muted2)', padding: '10px 0' }}>ログがありません</p>
            ) : (
              <div>
                {auditLogs.map((log, i) => (
                  <div key={log.id} style={{ display: 'flex', gap: 12, padding: '10px 0', borderBottom: i < auditLogs.length - 1 ? '1px solid #F2F2F6' : undefined, alignItems: 'flex-start' }}>
                    <span style={{ fontSize: '.62rem', color: 'var(--muted)', fontFamily: 'Inter', flexShrink: 0, paddingTop: 2, minWidth: 54 }}>
                      {new Date(log.created_at).toLocaleDateString('ja', { month: 'numeric', day: 'numeric' })}
                    </span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 2 }}>
                        <span style={{ fontSize: '.57rem', fontWeight: 700, padding: '1px 6px', borderRadius: 10, background: 'var(--bg2)', color: 'var(--muted2)' }}>
                          {log.category}
                        </span>
                        <span style={{ fontSize: '.76rem', fontWeight: 700 }}>{log.action}</span>
                      </div>
                      <div style={{ fontSize: '.63rem', color: 'var(--muted2)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{log.target}</div>
                    </div>
                    <span style={{ fontSize: '.6rem', color: 'var(--muted2)', flexShrink: 0 }}>{log.actor_name}</span>
                  </div>
                ))}
              </div>
            )}
          </SectionCard>

        </div>
      </div>

      {toast && (
        <div style={{
          position: 'fixed', bottom: 28, left: '50%', transform: 'translateX(-50%)',
          background: 'var(--txt)', color: '#fff', padding: '12px 22px',
          borderRadius: 9, fontSize: '.74rem', fontWeight: 600, zIndex: 99, whiteSpace: 'nowrap',
        }}>
          {toast}
        </div>
      )}
    </div>
  )
}
