'use client'
import { useState } from 'react'

/**
 * ②③ コンソールのカレンダー設定UI。
 * - ② Googleカレンダー連携ボタン（OAuth開始）。MB運営アカウント接続で実 free/busy を使用。
 * - ③ 営業時間 / 土日祝NG / 枠間隔 / バッファ の設定UI。
 * ※ MB運営カレンダーの保存・OAuth(owner) は要DBマイグレーション＋勝彦のワンクリック認可。
 *   それまでは設定はプレビュー、空き枠は既定(平日9:00-18:00)で算出されます（レポート参照）。
 */
export default function ConsoleCalendarCard() {
  const [start, setStart]       = useState('09:00')
  const [end, setEnd]           = useState('18:00')
  const [noWeekend, setNoWeek]  = useState(true)
  const [noHoliday, setNoHol]   = useState(true)
  const [slot, setSlot]         = useState(30)
  const [buffer, setBuffer]     = useState(0)
  const [note, setNote]         = useState('')

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
          <div style={{ fontSize: '.62rem', color: 'var(--muted2)', marginTop: 2 }}>MB運営アカウントを接続し、実際の空き時間で枠を生成</div>
        </div>
        <a href="/api/auth/google" style={{ flexShrink: 0, display: 'inline-block', background: '#4285F4', color: '#fff', borderRadius: 8, padding: '9px 16px', fontSize: '.74rem', fontWeight: 700, textDecoration: 'none' }}>
          Googleと連携する
        </a>
      </div>

      {/* ③ 設定 */}
      <Row label="営業時間" desc="この時間帯の中で枠を生成">
        <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <input type="time" value={start} onChange={e => setStart(e.target.value)} style={inp} />
          <span style={{ color: 'var(--muted2)' }}>〜</span>
          <input type="time" value={end} onChange={e => setEnd(e.target.value)} style={inp} />
        </span>
      </Row>
      <Row label="土日を予約不可" desc="土曜・日曜は枠を出さない"><Tg on={noWeekend} set={setNoWeek} /></Row>
      <Row label="祝日を予約不可" desc="日本の祝日は枠を出さない"><Tg on={noHoliday} set={setNoHol} /></Row>
      <Row label="枠の間隔">
        <select value={slot} onChange={e => setSlot(Number(e.target.value))} style={inp}>
          {[15, 30, 45, 60, 90].map(v => <option key={v} value={v}>{v}分</option>)}
        </select>
      </Row>
      <Row label="前後のバッファ" desc="予定の前後に確保する余白">
        <select value={buffer} onChange={e => setBuffer(Number(e.target.value))} style={inp}>
          {[0, 10, 15, 30].map(v => <option key={v} value={v}>{v}分</option>)}
        </select>
      </Row>

      <div style={{ marginTop: 14, display: 'flex', alignItems: 'center', gap: 12 }}>
        <button onClick={() => setNote('この設定の本番保存には、MB運営カレンダーのDB適用と Google 認可が必要です（手順は連携レポート参照）。')}
          className="btn btn-p" style={{ fontSize: '.74rem', padding: '9px 18px' }}>保存する</button>
        {note && <span style={{ fontSize: '.64rem', color: 'var(--amber)' }}>{note}</span>}
      </div>
    </div>
  )
}
