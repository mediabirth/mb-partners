'use client'
import { useState, useEffect } from 'react'
import ConsoleNav from '@/components/ConsoleNav'
import LogoutButton from '@/components/LogoutButton'
import ConsoleCalendarCard from '@/components/ConsoleCalendarCard'
import MembersSection from './MembersSection'

// ─── Types ───────────────────────────────────────────────────────────────────
type AuditLog  = { id: string; actor_name: string; category: string; target: string; action: string; created_at: string }

const AUDIT_CATEGORIES = ['', '案件', '支払', '配信', '権限', '問い合わせ'] as const

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
    <div className="card-hover" style={{ background: '#fff', border: '1px solid var(--line)', borderRadius: 14, marginBottom: 20, overflow: 'hidden' }}>
      <div style={{ padding: '15px 22px', borderBottom: '1px solid var(--line)' }}>
        <b style={{ fontSize: '.84rem' }}>{title}</b>
      </div>
      <div style={{ padding: '18px 22px' }}>{children}</div>
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
  const [calEnabled, setCalEnabled]           = useState(false)
  const [calUrl, setCalUrl]                   = useState('')
  const [notifEmail, setNotifEmail]           = useState(true)
  const [notifSlack, setNotifSlack]           = useState(false)
  const [evtNewDeal, setEvtNewDeal]           = useState(true)
  const [evtStatus, setEvtStatus]             = useState(true)
  const [evtPayout, setEvtPayout]             = useState(true)
  const [monthlyTarget, setMonthlyTarget]     = useState('')   // QR: 月間目標（運営取り分）
  const [notifSaving, setNotifSaving]         = useState(false)
  const [toast, setToast]                     = useState('')
  const [auditLogs, setAuditLogs]             = useState<AuditLog[]>([])
  const [auditCategory, setAuditCategory]     = useState('')
  const [auditLoading, setAuditLoading]       = useState(true)

  // ⑤ Load persisted notification settings (Slack ON/OFF + per-event).
  useEffect(() => {
    fetch('/api/console/settings/notifications')
      .then(r => (r.ok ? r.json() : null))
      .then(d => {
        const s = d?.settings
        if (!s) return
        setNotifEmail(s.email_enabled ?? true)
        setNotifSlack(s.slack_enabled ?? false)
        setEvtNewDeal(s.notify_new_deal ?? true)
        setEvtStatus(s.notify_status_change ?? true)
        setEvtPayout(s.notify_payout ?? true)
        if (s.monthly_target != null) setMonthlyTarget(String(s.monthly_target))
      })
      .catch(() => {})
  }, [])

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

  function saveCal() { showToast(calEnabled ? 'カレンダー連携を保存しました' : 'カレンダー連携を無効にしました') }
  async function saveNotif() {
    setNotifSaving(true)
    try {
      const res = await fetch('/api/console/settings/notifications', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email_enabled: notifEmail,
          slack_enabled: notifSlack,
          notify_new_deal: evtNewDeal,
          notify_status_change: evtStatus,
          notify_payout: evtPayout,
          monthly_target: monthlyTarget.trim() === '' ? null : Number(monthlyTarget.replace(/[,，\s]/g, '')),
        }),
      })
      showToast(res.ok ? '通知設定を保存しました' : '保存に失敗しました')
    } catch {
      showToast('保存に失敗しました')
    } finally {
      setNotifSaving(false)
    }
  }
  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: 'var(--bg2)' }}>
      <ConsoleNav />

      <div style={{ flex: 1, marginLeft: 230 }}>
        {/* Top bar */}
        <div style={{ background: 'rgba(255,255,255,.92)', backdropFilter: 'blur(10px)', borderBottom: '1px solid var(--line)', padding: '13px 28px', position: 'sticky', top: 0, zIndex: 30 }}>
          <h1 style={{ fontSize: '1rem', fontWeight: 900 }}>設定</h1>
        </div>

        <div className="stagger" style={{ padding: '30px 28px', maxWidth: 720 }}>

          {/* MBメンバー（内部・案件のMB担当）— サイドバーから統合 */}
          <SectionCard title="MBメンバー（管理者）">
            <MembersSection />
          </SectionCard>

          {/* 支払サイクルは「月末締め翌月末払い」固定（UIは撤去） */}
          {/* BR-C2: 「管理者管理」は MBメンバー（管理者）と同一対象の二重管理だったため統合・撤去。 */}

          {/* 3. カレンダー連携（②③ MB運営カレンダー） */}
          <ConsoleCalendarCard />

          {/* QR: ダッシュボード月間目標 */}
          <SectionCard title="ダッシュボード">
            <RowItem label="月間目標（運営取り分）" desc="ダッシュボードのヒーローに進捗バーを表示します。未設定なら前月比のみ。">
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ color: 'var(--muted2)', fontSize: '.8rem' }}>¥</span>
                <input
                  inputMode="numeric"
                  value={monthlyTarget}
                  onChange={e => setMonthlyTarget(e.target.value)}
                  placeholder="例: 500000"
                  style={{ width: 140, border: '1.5px solid var(--line)', borderRadius: 8, padding: '8px 11px', fontFamily: 'Inter', fontSize: '.82rem', textAlign: 'right' }}
                />
              </div>
            </RowItem>
            <button onClick={saveNotif} disabled={notifSaving} className="btn btn-g" style={{ fontSize: '.74rem', padding: '9px 18px' }}>{notifSaving ? '保存中…' : '保存する'}</button>
          </SectionCard>

          {/* 4. 通知設定 */}
          <SectionCard title="通知設定">
            <RowItem label="メール通知" desc="新規案件・ステータス変更・支払完了時にメールを受信">
              <Toggle on={notifEmail} onChange={setNotifEmail} />
            </RowItem>
            <RowItem label="Slack 通知" desc="Slack に通知を送信（Webhook はサーバー側に設定）">
              <Toggle on={notifSlack} onChange={setNotifSlack} />
            </RowItem>
            {notifSlack && (
              <div style={{ margin: '0 0 14px', padding: '12px 14px', background: 'var(--bg2)', borderRadius: 10 }}>
                <div style={{ fontSize: '.66rem', fontWeight: 700, color: 'var(--muted2)', marginBottom: 8 }}>通知するイベント</div>
                <RowItem label="新規案件"><Toggle on={evtNewDeal} onChange={setEvtNewDeal} /></RowItem>
                <RowItem label="ステータス変更"><Toggle on={evtStatus} onChange={setEvtStatus} /></RowItem>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div style={{ fontSize: '.8rem', fontWeight: 600 }}>支払完了</div>
                  <Toggle on={evtPayout} onChange={setEvtPayout} />
                </div>
              </div>
            )}
            <button onClick={saveNotif} disabled={notifSaving} className="btn btn-g" style={{ fontSize: '.74rem', padding: '9px 18px' }}>{notifSaving ? '保存中…' : '保存する'}</button>
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
              <p style={{ fontSize: '.72rem', color: 'var(--muted2)', padding: '10px 0' }}>ログがありません。設定変更や承認などの操作がここに記録・表示されます。</p>
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

          {/* ログアウト（設定画面の一番下） */}
          <div style={{ display: 'flex', justifyContent: 'center', padding: '8px 0 48px' }}>
            <LogoutButton />
          </div>

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
