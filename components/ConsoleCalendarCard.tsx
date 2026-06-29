'use client'
import { useEffect, useState } from 'react'

/**
 * ②③ コンソールのカレンダー設定UI（MB運営）。
 * - ② Google連携（OAuth開始）。接続済みならメール表示。
 * - ③ 営業時間 / 土日NG / 祝日NG / 枠間隔 / バッファ を mb_calendar に保存。
 * mb_calendar 未作成時は保存で「DB適用が必要」を表示（halt しない）。
 */
type Settings = {
  business_start: string; business_end: string
  no_weekend: boolean; no_holiday: boolean
  slot_minutes: number; buffer_minutes: number
  google_email?: string | null
}
type Account = { id: string; account_label: string; google_email: string | null; active: boolean; is_default: boolean }

export default function ConsoleCalendarCard() {
  const [s, setS] = useState<Settings>({ business_start: '09:00', business_end: '18:00', no_weekend: true, no_holiday: true, slot_minutes: 30, buffer_minutes: 0 })
  const [connected, setConnected] = useState(false)
  const [ready, setReady] = useState(true)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [note, setNote] = useState('')
  const [accounts, setAccounts] = useState<Account[]>([])
  const [addLabel, setAddLabel] = useState('')

  useEffect(() => {
    fetch('/api/console/calendar').then(r => r.json()).then(d => {
      if (d.settings) setS(v => ({ ...v, ...d.settings }))
      setConnected(!!d.connected); setReady(d.ready !== false)
      if (Array.isArray(d.accounts)) setAccounts(d.accounts)
      // 連携直後/失敗のフラッシュ
      const p = new URLSearchParams(window.location.search)
      if (p.get('calendar') === 'connected') setNote('Googleカレンダーと連携しました。')
      if (p.get('calendar') === 'added') setNote('追加のカレンダーアカウントを連携しました。')
      if (p.get('calendar_error')) setNote(`連携エラー: ${p.get('calendar_error')}`)
    }).catch(() => {}).finally(() => setLoading(false))
  }, [])

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
        営業時間と連携Googleの予定（busy）から、パートナー／顧客の予約画面に表示する空き枠を算出します。
      </p>

      {/* ② Google連携 */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, background: 'var(--bg2)', borderRadius: 10, padding: '12px 14px', marginBottom: 16 }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: '.78rem', fontWeight: 700 }}>Googleカレンダー連携</div>
          <div style={{ fontSize: '.62rem', color: connected ? 'var(--green)' : 'var(--muted2)', marginTop: 2 }}>
            {loading ? '確認中…' : connected ? `✓ 連携済み${s.google_email ? `（${s.google_email}）` : ''}` : 'MB運営アカウントを接続し、実際の空き時間で枠を生成'}
          </div>
        </div>
        <a href="/api/auth/google" style={{ flexShrink: 0, display: 'inline-block', background: '#4285F4', color: '#fff', borderRadius: 8, padding: '9px 16px', fontSize: '.74rem', fontWeight: 700, textDecoration: 'none' }}>
          {connected ? '再連携' : 'Googleと連携する'}
        </a>
      </div>

      {/* ②-2 段階A：連携アカウント一覧 ＋ 追加導線（振り分けはまだ無し＝挙動ゼロ変化） */}
      <div style={{ background: 'var(--bg2)', borderRadius: 10, padding: '12px 14px', marginBottom: 16 }}>
        <div style={{ fontSize: '.7rem', fontWeight: 700, color: 'var(--muted2)', marginBottom: 8 }}>連携中のアカウント</div>
        {accounts.length === 0 ? (
          <div style={{ fontSize: '.66rem', color: 'var(--muted2)' }}>{loading ? '確認中…' : '未連携'}</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {accounts.map(a => (
              <div key={a.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, padding: '8px 10px', background: '#fff', border: '1px solid var(--line)', borderRadius: 8 }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: '.74rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6 }}>
                    {a.account_label}
                    {a.is_default && <span style={{ fontSize: '.56rem', fontWeight: 700, color: 'var(--blue)', background: 'var(--blue-bg2,#EEEBFF)', borderRadius: 5, padding: '1px 6px' }}>既定</span>}
                  </div>
                  {a.google_email && <div style={{ fontSize: '.62rem', color: 'var(--muted2)', marginTop: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.google_email}</div>}
                </div>
                <span style={{ flexShrink: 0, fontSize: '.6rem', fontWeight: 700, color: a.active ? 'var(--green)' : 'var(--muted2)' }}>{a.active ? '✓ 有効' : '無効'}</span>
              </div>
            ))}
          </div>
        )}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 10 }}>
          <input
            value={addLabel}
            onChange={e => setAddLabel(e.target.value)}
            placeholder="表示名（例: 勝彦）"
            maxLength={60}
            style={{ flex: 1, minWidth: 0, border: '1.5px solid var(--line)', borderRadius: 8, padding: '8px 11px', fontFamily: 'inherit', fontSize: '.74rem' }}
          />
          <a
            href={`/api/auth/google?mode=mb_add${addLabel.trim() ? `&label=${encodeURIComponent(addLabel.trim())}` : ''}`}
            style={{ flexShrink: 0, display: 'inline-block', background: '#0E0E14', color: '#fff', borderRadius: 8, padding: '9px 14px', fontSize: '.72rem', fontWeight: 700, textDecoration: 'none' }}
          >
            ＋ アカウント追加
          </a>
        </div>
        <p style={{ fontSize: '.6rem', color: 'var(--muted2)', margin: '8px 2px 0', lineHeight: 1.6 }}>
          追加したアカウントは連携のみ保存されます。どのブランドの商談をどのアカウントに入れるかの割り当ては次の段階で対応します。
        </p>
      </div>

      {/* ③ 設定 */}
      <Row label="営業時間" desc="この時間帯の中で枠を生成">
        <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <input type="time" value={s.business_start} onChange={e => setS(v => ({ ...v, business_start: e.target.value }))} style={inp} />
          <span style={{ color: 'var(--muted2)' }}>〜</span>
          <input type="time" value={s.business_end} onChange={e => setS(v => ({ ...v, business_end: e.target.value }))} style={inp} />
        </span>
      </Row>
      <Row label="土日を予約不可" desc="土曜・日曜は枠を出さない"><Tg on={s.no_weekend} set={v => setS(p => ({ ...p, no_weekend: v }))} /></Row>
      <Row label="祝日を予約不可" desc="日本の祝日は枠を出さない"><Tg on={s.no_holiday} set={v => setS(p => ({ ...p, no_holiday: v }))} /></Row>
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

      <div style={{ marginTop: 14, display: 'flex', alignItems: 'center', gap: 12 }}>
        <button onClick={save} disabled={saving} className="btn btn-p" style={{ fontSize: '.74rem', padding: '9px 18px', opacity: saving ? .6 : 1 }}>{saving ? '保存中…' : '保存する'}</button>
        {note && <span style={{ fontSize: '.64rem', color: note.includes('しました') ? 'var(--green)' : 'var(--amber)' }}>{note}</span>}
      </div>
    </div>
  )
}
