'use client'
import { useEffect, useRef, useState } from 'react'
import EditBlock from '@/components/ui/EditBlock'
import Avatar from '@/components/ui/Avatar'

/**
 * ②③ コンソールのカレンダー設定UI（member-centric・段階2）。
 * - ② MBメンバー（owner/manager）×各自のカレンダー連携状況。本人のみ「連携/解除」。
 * - ③ 営業時間 / 土日NG / 祝日NG / 枠間隔 / バッファ を mb_calendar に保存（org 予約ポリシー）。
 */
type Settings = {
  business_start: string; business_end: string
  no_weekend: boolean; no_holiday: boolean
  slot_minutes: number; buffer_minutes: number
  google_email?: string | null
}
type Member = { user_id: string; name: string | null; role: string; color: string | null; avatar_url: string | null; connected: boolean; google_email: string | null; is_self: boolean }
const ROLE_JP: Record<string, string> = { owner: 'オーナー', manager: 'マネージャー', admin: '管理者', staff: 'スタッフ' }

export default function ConsoleCalendarCard() {
  const [s, setS] = useState<Settings>({ business_start: '09:00', business_end: '18:00', no_weekend: true, no_holiday: true, slot_minutes: 30, buffer_minutes: 0 })
  const [ready, setReady] = useState(true)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [note, setNote] = useState('')
  const [members, setMembers] = useState<Member[]>([])
  const [unlinking, setUnlinking] = useState(false)
  const snapRef = useRef<Settings | null>(null)   // 営業時間/枠/バッファ 編集のキャンセル用スナップショット

  function loadMembers() {
    return fetch('/api/console/calendar').then(r => r.json()).then(d => {
      if (d.settings) setS(v => ({ ...v, ...d.settings }))
      setReady(d.ready !== false)
      if (Array.isArray(d.members)) setMembers(d.members)
    })
  }

  useEffect(() => {
    loadMembers().catch(() => {}).finally(() => setLoading(false))
    const p = new URLSearchParams(window.location.search)
    if (p.get('calendar') === 'member_connected') setNote('あなたのGoogleカレンダーを連携しました。')
    else if (p.get('calendar') === 'connected') setNote('Googleカレンダーと連携しました。')
    if (p.get('calendar_error')) setNote(`連携エラー: ${p.get('calendar_error')}`)
  }, [])

  async function unlinkMine() {
    if (!confirm('あなたのカレンダー連携を解除しますか？')) return
    setUnlinking(true); setNote('')
    try {
      const r = await fetch('/api/console/calendar/link', { method: 'DELETE' })
      if (r.ok) { await loadMembers(); setNote('カレンダー連携を解除しました。') }
      else setNote('解除に失敗しました。')
    } catch { setNote('解除に失敗しました。') } finally { setUnlinking(false) }
  }

  async function save() {
    setSaving(true); setNote('')
    try {
      const r = await fetch('/api/console/calendar', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(s) })
      const d = await r.json()
      if (d.ok) setNote('保存しました。')
      else if (d.needsMigration) setNote('保存には mb_calendar テーブルのDB適用が必要です（連携レポートのSQL）。')
      else setNote('保存に失敗しました。')
    } catch { setNote('保存に失敗しました。') } finally { setSaving(false) }
  }

  const Row = ({ label, desc, children }: { label: string; desc?: string; children: React.ReactNode }) => (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, padding: '12px 0', borderBottom: '1px solid #F2F2F6' }}>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: '.8rem', fontWeight: 600 }}>{label}</div>
        {desc && <div style={{ fontSize: '.64rem', color: 'var(--muted2)', marginTop: 2 }}>{desc}</div>}
      </div>
      <div style={{ flexShrink: 0 }}>{children}</div>
    </div>
  )
  const Tg = ({ on, set }: { on: boolean; set: (v: boolean) => void }) => (
    <div onClick={() => set(!on)} style={{ width: 42, height: 24, borderRadius: 14, background: on ? 'var(--blue)' : '#D9D9E2', position: 'relative', cursor: 'pointer', transition: 'background .2s' }}>
      <span style={{ position: 'absolute', top: 3, left: on ? 21 : 3, width: 18, height: 18, borderRadius: '50%', background: '#fff', transition: 'left .2s' }} />
    </div>
  )
  const inp: React.CSSProperties = { border: '1.5px solid var(--line)', borderRadius: 8, padding: '7px 10px', fontFamily: 'inherit', fontSize: '.8rem' }

  return (
    <div style={{ background: '#fff', border: '1px solid var(--line)', borderRadius: 14, padding: '18px 20px', marginBottom: 18 }}>
      <b style={{ fontSize: '.86rem', display: 'block', marginBottom: 4 }}>商談カレンダー（MB運営）</b>
      <p style={{ fontSize: '.66rem', color: 'var(--muted2)', margin: '0 0 14px', lineHeight: 1.6 }}>
        営業時間と連携Googleの予定（busy）から、パートナー／お客さまの予約画面に表示する空き枠を算出します。
      </p>

      {/* ② 連携中のアカウント＝MBメンバー×各自のカレンダー連携状況。本人のみ「連携/解除」。 */}
      <div style={{ background: 'var(--bg2)', borderRadius: 10, padding: '12px 14px', marginBottom: 16 }}>
        <div style={{ fontSize: '.7rem', fontWeight: 700, color: 'var(--muted2)', marginBottom: 8 }}>連携中のアカウント</div>
        {members.length === 0 ? (
          <div style={{ fontSize: '.66rem', color: 'var(--muted2)' }}>{loading ? '確認中…' : 'メンバーがいません'}</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {members.map(m => (
              <div key={m.user_id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 11px', background: '#fff', border: '1px solid var(--line)', borderRadius: 8 }}>
                <Avatar name={m.name ?? '?'} color={m.color} src={m.avatar_url} size={30} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: '.76rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.name ?? '—'}</span>
                    <span style={{ fontSize: '.56rem', fontWeight: 700, color: 'var(--muted2)', flexShrink: 0 }}>{ROLE_JP[m.role] ?? m.role}{m.is_self ? '・あなた' : ''}</span>
                  </div>
                  <div style={{ fontSize: '.62rem', marginTop: 1, color: m.connected ? 'var(--green)' : 'var(--muted2)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {m.connected ? `✓ 連携済み（${m.google_email}）` : '未連携'}
                  </div>
                </div>
                <div style={{ flexShrink: 0 }}>
                  {m.is_self ? (
                    m.connected ? (
                      <button onClick={unlinkMine} disabled={unlinking} style={{ fontSize: '.7rem', fontWeight: 700, color: 'var(--muted2)', background: 'var(--bg2)', border: '1px solid var(--line)', borderRadius: 8, padding: '7px 13px', cursor: 'pointer', fontFamily: 'inherit', opacity: unlinking ? .6 : 1 }}>解除</button>
                    ) : (
                      <a href="/api/auth/google?mode=member" style={{ display: 'inline-block', background: '#4285F4', color: '#fff', borderRadius: 8, padding: '7px 13px', fontSize: '.7rem', fontWeight: 700, textDecoration: 'none' }}>連携する</a>
                    )
                  ) : (
                    <span style={{ fontSize: '.58rem', color: 'var(--muted2)', fontWeight: 600 }}>本人のみ連携可</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
        <p style={{ fontSize: '.6rem', color: 'var(--muted2)', margin: '8px 2px 0', lineHeight: 1.6 }}>
          各メンバーが自分のログインで自分のGoogleカレンダーを連携します。連携の操作は本人のみ可能です。
        </p>
      </div>

      {/* ③ 設定：営業時間/枠/バッファ＝表示/編集モード。土日/祝日トグルは現状のまま（即編集）。 */}
      <div style={{ borderTop: '1px solid #F2F2F6', paddingTop: 6, marginTop: 4 }}>
        <EditBlock
          onEdit={() => { snapRef.current = s }}
          onCancel={() => { if (snapRef.current) setS(snapRef.current) }}
          onSave={async () => { await save() }}
          view={
            <div>
              <Row label="営業時間" desc="この時間帯の中で枠を生成"><b style={{ fontSize: '.82rem' }}>{s.business_start} 〜 {s.business_end}</b></Row>
              <Row label="枠の間隔"><b style={{ fontSize: '.82rem' }}>{s.slot_minutes}分</b></Row>
              <Row label="前後のバッファ" desc="予定の前後に確保する余白"><b style={{ fontSize: '.82rem' }}>{s.buffer_minutes}分</b></Row>
            </div>
          }
          edit={
            <div>
              <Row label="営業時間" desc="この時間帯の中で枠を生成">
                <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <input type="time" value={s.business_start} onChange={e => setS(v => ({ ...v, business_start: e.target.value }))} style={inp} />
                  <span style={{ color: 'var(--muted2)' }}>〜</span>
                  <input type="time" value={s.business_end} onChange={e => setS(v => ({ ...v, business_end: e.target.value }))} style={inp} />
                </span>
              </Row>
              <Row label="枠の間隔">
                <select value={s.slot_minutes} onChange={e => setS(v => ({ ...v, slot_minutes: Number(e.target.value) }))} style={inp}>
                  {[15, 30, 45, 60, 90].map(v => <option key={v} value={v}>{v}分</option>)}
                </select>
              </Row>
              <Row label="前後のバッファ" desc="予定の前後に確保する余白">
                <select value={s.buffer_minutes} onChange={e => setS(v => ({ ...v, buffer_minutes: Number(e.target.value) }))} style={inp}>
                  {[0, 10, 15, 30].map(v => <option key={v} value={v}>{v}分</option>)}
                </select>
              </Row>
            </div>
          }
        />
      </div>

      {/* 土日/祝日トグル（即編集・現状維持）。変更後は下の「保存する」で確定。 */}
      <Row label="土日を予約不可" desc="土曜・日曜は枠を出さない"><Tg on={s.no_weekend} set={v => setS(p => ({ ...p, no_weekend: v }))} /></Row>
      <Row label="祝日を予約不可" desc="日本の祝日は枠を出さない"><Tg on={s.no_holiday} set={v => setS(p => ({ ...p, no_holiday: v }))} /></Row>

      <div style={{ marginTop: 14, display: 'flex', alignItems: 'center', gap: 12 }}>
        <button onClick={save} disabled={saving} className="btn btn-p" style={{ fontSize: '.74rem', padding: '9px 18px', opacity: saving ? .6 : 1 }}>{saving ? '保存中…' : '土日・祝日を保存'}</button>
        {note && <span style={{ fontSize: '.64rem', color: note.includes('しました') ? 'var(--green)' : 'var(--amber)' }}>{note}</span>}
      </div>
    </div>
  )
}
