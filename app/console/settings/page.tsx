'use client'
import { useState, useEffect } from 'react'
import ConsoleNav from '@/components/ConsoleNav'
import LogoutButton from '@/components/LogoutButton'
import ConsoleCalendarCard from '@/components/ConsoleCalendarCard'
import MembersSection from './MembersSection'
import ProfileSection from './ProfileSection'
import EditBlock from '@/components/ui/EditBlock'
import { SECTION_KEYS } from './messaging-sections'

// ─── Types ───────────────────────────────────────────────────────────────────
type AuditLog  = { id: string; actor_name: string; category: string; target: string; action: string; created_at: string }

const AUDIT_CATEGORIES = ['', '案件', '支払', '配信', '権限', '問い合わせ'] as const

function Toggle({ on, onChange }: { on: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      onClick={() => onChange(!on)}
      style={{
        width: 42, height: 24, borderRadius: 12, border: 'none', cursor: 'pointer',
        background: on ? 'var(--c-blue)' : 'var(--line)', padding: 0, position: 'relative',
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
    <div className="card-hover ui-card" style={{ background: '#fff', border: '1px solid var(--line)', borderRadius: 14, marginBottom: 20, overflow: 'hidden' }}>
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
  const [monthlyTarget, setMonthlyTarget]     = useState('')   // QR: 月間目標（運営取り分・確定値）
  const [mtDraft, setMtDraft]                 = useState('')   // 月間目標 編集中ドラフト
  const [notifSaving, setNotifSaving]         = useState(false)
  const [toast, setToast]                     = useState('')
  const [auditLogs, setAuditLogs]             = useState<AuditLog[]>([])
  const [auditCategory, setAuditCategory]     = useState('')
  const [auditLoading, setAuditLoading]       = useState(true)
  const [msgFreeCount, setMsgFreeCount]       = useState<number | null>(null)   // 自由送信テンプレ件数
  const [msgAutoCount, setMsgAutoCount]       = useState<number | null>(null)   // 自動メッセージ カスタム件数

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

  // 段階C：自分の通知宛先（member_notification_prefs）。
  const [myMailTo, setMyMailTo] = useState('')      // 確定値
  const [myMailDraft, setMyMailDraft] = useState('') // 宛先編集中ドラフト
  const [myMailOn, setMyMailOn] = useState(true)
  const [myMailSaving, setMyMailSaving] = useState(false)
  useEffect(() => {
    fetch('/api/console/settings/notify-prefs')
      .then(r => (r.ok ? r.json() : null))
      .then(d => { if (d) { setMyMailTo(d.email_to ?? ''); setMyMailOn(d.email_enabled ?? true) } })
      .catch(() => {})
  }, [])
  // 通知宛先 PATCH（確定値ベース＋override）。trueで保存成功。
  async function patchMyMail(over: Record<string, unknown> = {}): Promise<boolean> {
    setMyMailSaving(true)
    try {
      const res = await fetch('/api/console/settings/notify-prefs', {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email_to: myMailTo, email_enabled: myMailOn, ...over }),
      })
      return res.ok
    } catch { return false } finally { setMyMailSaving(false) }
  }
  // 「受信する」トグルは即保存（現状どおり切り替えが本質）。
  async function toggleMyMail(v: boolean) {
    setMyMailOn(v)
    const ok = await patchMyMail({ email_enabled: v })
    showToast(ok ? '通知メール設定を保存しました' : '保存に失敗しました')
  }
  // 月間目標の保存（ドラフト値で PUT・他の通知設定は現値を維持）。
  async function saveMonthlyTarget(): Promise<boolean> {
    const val = mtDraft.trim() === '' ? null : Number(mtDraft.replace(/[,，\s]/g, ''))
    try {
      const res = await fetch('/api/console/settings/notifications', {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email_enabled: notifEmail, slack_enabled: notifSlack,
          notify_new_deal: evtNewDeal, notify_status_change: evtStatus, notify_payout: evtPayout,
          monthly_target: val,
        }),
      })
      if (res.ok) { setMonthlyTarget(mtDraft); showToast('月間目標を保存しました'); return true }
      showToast('保存に失敗しました'); return false
    } catch { showToast('保存に失敗しました'); return false }
  }

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

  // メッセージ入口カードの件数（既存CRUD一覧API流用・owner gate・money非接触）。
  useEffect(() => {
    fetch('/api/console/messages/templates')
      .then(r => (r.ok ? r.json() : null))
      .then(d => {
        const tpls: { category: string | null }[] = d?.templates ?? []
        setMsgFreeCount(tpls.filter(t => !t.category || !SECTION_KEYS.has(t.category)).length)
        setMsgAutoCount(tpls.filter(t => t.category && SECTION_KEYS.has(t.category)).length)
      })
      .catch(() => {})
  }, [])

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

          {/* あなたのプロフィール（表示名・アイコン・色）— 各自いつでも変更可・本人のみ */}
          <SectionCard title="プロフィール">
            <ProfileSection />
          </SectionCard>

          {/* MBメンバー（内部・案件のMB担当）— サイドバーから統合 */}
          <SectionCard title="MBメンバー（管理者）">
            <MembersSection />
          </SectionCard>

          {/* メッセージ（テンプレート／自動メッセージ）— Phase3-D②b 入口カード（件数動的） */}
          <div style={{ marginBottom: 20 }}>
            <b style={{ fontSize: '.84rem', display: 'block', marginBottom: 10 }}>メッセージ</b>
            <a href="/console/settings/templates" className="card-hover ui-card" style={{ display: 'flex', alignItems: 'center', gap: 14, background: '#fff', border: '1px solid var(--line)', borderRadius: 14, padding: '16px 18px', marginBottom: 10, textDecoration: 'none', color: 'inherit' }}>
              <span style={{ width: 40, height: 40, borderRadius: 10, background: 'var(--c-ghost-bg)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--c-blue)" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M14 3v4a1 1 0 001 1h4" /><path d="M17 21H7a2 2 0 01-2-2V5a2 2 0 012-2h7l5 5v11a2 2 0 01-2 2z" /><path d="M9 9h1M9 13h6M9 17h6" /></svg>
              </span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: '.84rem', fontWeight: 800 }}>自由送信テンプレート</div>
                <div style={{ fontSize: '.6rem', color: 'var(--c-blue)', fontWeight: 700, marginTop: 4 }}>{msgFreeCount == null ? '　' : `${msgFreeCount}件登録済み`}</div>
              </div>
              <span style={{ color: 'var(--t-tertiary)', flexShrink: 0 }}>›</span>
            </a>
            <a href="/console/settings/auto-messages" className="card-hover ui-card" style={{ display: 'flex', alignItems: 'center', gap: 14, background: '#fff', border: '1px solid var(--line)', borderRadius: 14, padding: '16px 18px', textDecoration: 'none', color: 'inherit' }}>
              <span style={{ width: 40, height: 40, borderRadius: 10, background: 'var(--color-background-info, #E6F1FB)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--c-info)" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><rect x="4" y="8" width="16" height="12" rx="2" /><path d="M12 8V4M9 4h6M9 14h.01M15 14h.01M9 17h6" /></svg>
              </span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: '.84rem', fontWeight: 800 }}>自動メッセージ</div>
                <div style={{ fontSize: '.6rem', color: 'var(--c-blue)', fontWeight: 700, marginTop: 4 }}>{msgAutoCount == null ? '　' : `7イベント · ${msgAutoCount}件カスタム`}</div>
              </div>
              <span style={{ color: 'var(--t-tertiary)', flexShrink: 0 }}>›</span>
            </a>
          </div>

          {/* 支払サイクルは「月末締め翌月末払い」固定（UIは撤去） */}
          {/* BR-C2: 「管理者管理」は MBメンバー（管理者）と同一対象の二重管理だったため統合・撤去。 */}

          {/* 3. カレンダー連携（②③ MB運営カレンダー） */}
          <ConsoleCalendarCard />

          {/* QR: ダッシュボード月間目標（表示/編集モード） */}
          <SectionCard title="ダッシュボード">
            <EditBlock
              onEdit={() => setMtDraft(monthlyTarget)}
              onSave={saveMonthlyTarget}
              view={
                <RowItem label="月間目標（運営取り分）" desc="ダッシュボードに進捗バーを表示">
                  <b style={{ fontSize: '.84rem', fontFamily: 'Inter' }}>{monthlyTarget.trim() === '' ? '未設定' : `¥${Number(monthlyTarget.replace(/[,，\s]/g, '')).toLocaleString()}`}</b>
                </RowItem>
              }
              edit={
                <RowItem label="月間目標（運営取り分）" desc="ダッシュボードに進捗バーを表示">
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ color: 'var(--muted2)', fontSize: '.8rem' }}>¥</span>
                    <input
                      inputMode="numeric"
                      value={mtDraft}
                      onChange={e => setMtDraft(e.target.value)}
                      placeholder="例: 500000"
                      style={{ width: 140, border: '1.5px solid var(--line)', borderRadius: 8, padding: '8px 11px', fontFamily: 'Inter', fontSize: '.82rem', textAlign: 'right' }}
                    />
                  </div>
                </RowItem>
              }
            />
          </SectionCard>

          {/* 4. 通知設定 */}
          <SectionCard title="通知設定">
            <RowItem label="メール通知">
              <Toggle on={notifEmail} onChange={setNotifEmail} />
            </RowItem>
            <RowItem label="Slack 通知">
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
            <button onClick={saveNotif} disabled={notifSaving} className="ui-btn ui-btn--secondary ui-btn--lg" style={{ fontSize: '.74rem', padding: '9px 18px' }}>{notifSaving ? '保存中…' : '保存する'}</button>
          </SectionCard>

          {/* 段階C: あなたの通知メール（受信トグルは即保存／宛先は表示・編集モード） */}
          <SectionCard title="あなたの通知メール">
            <RowItem label="受信する" desc="運営通知をこのアドレスでも受け取る">
              <Toggle on={myMailOn} onChange={toggleMyMail} />
            </RowItem>
            <EditBlock
              onEdit={() => setMyMailDraft(myMailTo)}
              onSave={async () => {
                const ok = await patchMyMail({ email_to: myMailDraft.trim() })
                if (ok) { setMyMailTo(myMailDraft.trim()); showToast('宛先メールを保存しました') } else showToast('保存に失敗しました')
                return ok
              }}
              view={
                <RowItem label="宛先メール" desc="あなた個人の受信先（空欄で受信なし）">
                  <b style={{ fontSize: '.8rem', fontFamily: 'Inter' }}>{myMailTo.trim() === '' ? '未設定' : myMailTo}</b>
                </RowItem>
              }
              edit={
                <RowItem label="宛先メール" desc="あなた個人の受信先（空欄で受信なし）">
                  <input
                    type="email"
                    value={myMailDraft}
                    onChange={e => setMyMailDraft(e.target.value)}
                    placeholder="you@example.com"
                    style={{ width: 220, border: '1.5px solid var(--line)', borderRadius: 8, padding: '8px 11px', fontFamily: 'inherit', fontSize: '.82rem' }}
                  />
                </RowItem>
              }
            />
          </SectionCard>

          {/* 5. 監査ログ */}
          <SectionCard title="監査ログ">
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14, flexWrap: 'wrap' }}>
              <p style={{ fontSize: '.72rem', color: 'var(--muted2)', flex: 1, lineHeight: 1.6, minWidth: 160 }}>
                履歴
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
                style={{ fontSize: '.7rem', color: 'var(--c-blue)', background: 'var(--blue-bg2)', border: 'none', borderRadius: 8, padding: '7px 14px', cursor: 'pointer', fontFamily: 'inherit', fontWeight: 700 }}
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
