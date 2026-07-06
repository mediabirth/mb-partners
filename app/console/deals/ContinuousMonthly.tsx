'use client'
import { useEffect, useState } from 'react'
import { parseAmount } from '@/lib/num'

type Row = { id: string; period_month: string; gross_input: number; confirmed_amount: number; status: string; confirmed_at: string | null }
type DealLite = {
  id: string
  reward_snapshot: { reward_value?: number; reward_base?: string; months?: number } | null
  continuous_months?: number | null
  partners?: { code?: string; profiles?: { name?: string } | null } | null
}

const ym = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
const fmtMonth = (iso: string) => { const m = iso.match(/^(\d{4})-(\d{2})/); return m ? `${m[1]}年${Number(m[2])}月` : iso }

/**
 * 継続報酬の月次入力（確定モック deal_board_continuous_monthly_input）。
 * 率は deal.reward_snapshot.reward_value（凍結）。今月の粗利を手入力→×率＝今月報酬→確定（continuous_payouts）。
 * ★将来の会計連携：gross_input の手入力を1点に集約＝ここを自動取得値へ差し替え可能。
 */
export default function ContinuousMonthly({ deal, onChanged }: { deal: DealLite; onChanged?: () => void }) {
  const rate = Number(deal.reward_snapshot?.reward_value ?? 0)
  const baseLabel = deal.reward_snapshot?.reward_base ?? '粗利'
  const months = deal.continuous_months ?? deal.reward_snapshot?.months ?? null

  const [rows, setRows] = useState<Row[]>([])
  const [loading, setLoading] = useState(true)
  const [period, setPeriod] = useState(ym(new Date()))
  const [gross, setGross] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [monthsEdit, setMonthsEdit] = useState(months != null ? String(months) : '')
  const [editingMonths, setEditingMonths] = useState(false)

  async function load() {
    setLoading(true)
    const d = await fetch(`/api/console/continuous-payouts?deal_id=${deal.id}`).then(r => r.json()).catch(() => ({ rows: [] }))
    setRows((d.rows ?? []) as Row[])
    setLoading(false)
  }
  useEffect(() => { load() /* eslint-disable-next-line */ }, [deal.id])

  const confirmedRows = rows.filter(r => r.status === 'confirmed')
  const totalReward = confirmedRows.reduce((s, r) => s + (r.confirmed_amount || 0), 0)
  const thisMonthReward = Math.round(parseAmount(gross) * rate / 100)

  async function confirmMonth() {
    setErr('')
    if (!period) { setErr('対象月を選んでください'); return }
    if (parseAmount(gross) <= 0) { setErr('今月の粗利を入力してください'); return }
    setBusy(true)
    const res = await fetch('/api/console/continuous-payouts', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ deal_id: deal.id, period_month: period, gross_input: parseAmount(gross) }) })
    const jd = await res.json().catch(() => ({}))
    setBusy(false)
    if (!res.ok) { setErr(jd?.error ?? '確定に失敗しました'); return }
    setGross('')
    await load(); onChanged?.()
  }
  async function saveMonths() {
    setBusy(true)
    await fetch('/api/console/continuous-payouts', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ deal_id: deal.id, months: parseAmount(monthsEdit) || null }) }).catch(() => {})
    setBusy(false); setEditingMonths(false); onChanged?.()
  }
  async function removeRow(id: string) {
    if (!confirm('この月の確定を取り消しますか？')) return
    await fetch(`/api/console/continuous-payouts?id=${id}`, { method: 'DELETE' }).catch(() => {})
    await load(); onChanged?.()
  }

  return (
    <div style={{ marginTop: 18, border: '1px solid var(--blue-bg)', borderRadius: 12, overflow: 'hidden' }}>
      {/* ヘッダ */}
      <div style={{ padding: '12px 16px', background: 'var(--blue-bg2)', display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <span style={{ fontSize: '.6rem', fontWeight: 500, color: '#fff', background: 'var(--ink)', borderRadius: 4, padding: '2px 9px' }}>継続報酬</span>
        <span style={{ fontSize: '.74rem', fontWeight: 500, color: 'var(--blue-dk)' }}>{baseLabel} {rate}% / 月</span>
        {deal.partners?.profiles?.name && <span style={{ fontSize: '.62rem', color: 'var(--muted2)', marginLeft: 'auto' }}>担当：{deal.partners.profiles.name}</span>}
      </div>

      {/* 進捗 ＋ 累計 */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1, background: 'var(--line)' }}>
        <div style={{ background: '#fff', padding: '12px 16px' }}>
          <p style={{ fontSize: '.58rem', color: 'var(--muted2)', fontWeight: 500 }}>進捗</p>
          <p style={{ fontSize: '.9rem', fontWeight: 500, fontFamily: 'Inter', marginTop: 3 }}>
            {confirmedRows.length}<span style={{ fontSize: '.66rem', color: 'var(--muted2)' }}> / {months ?? '—'} ヶ月</span>
          </p>
        </div>
        <div style={{ background: '#fff', padding: '12px 16px' }}>
          <p style={{ fontSize: '.58rem', color: 'var(--muted2)', fontWeight: 500 }}>累計報酬</p>
          <p className="tnum" style={{ fontSize: '.9rem', fontWeight: 500, fontFamily: 'Inter', marginTop: 3, color: 'var(--c-blue)' }}>¥{totalReward.toLocaleString()}</p>
        </div>
      </div>

      {/* 今月分を入力 */}
      <div style={{ padding: '14px 16px', borderTop: '0.5px solid var(--line)', background: '#fff' }}>
        <p style={{ fontSize: '.64rem', fontWeight: 500, marginBottom: 9 }}>今月分を入力</p>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <input type="month" value={period} onChange={e => setPeriod(e.target.value)}
            style={{ border: '1.5px solid var(--line)', borderRadius: 8, padding: '8px 10px', fontFamily: 'inherit', fontSize: '.76rem' }} />
          <input value={gross} onChange={e => setGross(e.target.value)} inputMode="numeric" placeholder={`今月の${baseLabel}（例：300000）`}
            style={{ flex: 1, minWidth: 130, border: '1.5px solid var(--line)', borderRadius: 8, padding: '8px 10px', fontFamily: 'Inter', fontSize: '.78rem', textAlign: 'right' }} />
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', margin: '10px 0', fontSize: '.72rem' }}>
          <span style={{ color: 'var(--muted2)' }}>今月のパートナー報酬（{baseLabel}×{rate}%）</span>
          <b className="tnum" style={{ fontFamily: 'Inter', color: 'var(--c-blue)' }}>{thisMonthReward > 0 ? `¥${thisMonthReward.toLocaleString()}` : '—'}</b>
        </div>
        {err && <p style={{ fontSize: '.66rem', color: 'var(--red)', marginBottom: 8 }}>{err}</p>}
        <button onClick={confirmMonth} disabled={busy} className="ui-btn ui-btn--primary" style={{ width: '100%', fontSize: '.74rem', padding: '9px 0' }}>
          {busy ? '処理中…' : '今月分を確定'}
        </button>
      </div>

      {/* 確定済みの月 */}
      <div style={{ padding: '12px 16px', borderTop: '0.5px solid var(--line)', background: '#fff' }}>
        <p style={{ fontSize: '.6rem', fontWeight: 500, color: 'var(--muted2)', marginBottom: 8 }}>確定済みの月</p>
        {loading ? <p style={{ fontSize: '.66rem', color: 'var(--muted2)' }}>読み込み中…</p>
          : confirmedRows.length === 0 ? <p style={{ fontSize: '.66rem', color: 'var(--muted2)' }}>まだありません</p>
          : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {confirmedRows.map(r => (
                <div key={r.id} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '.72rem', padding: '6px 0', borderBottom: '0.5px solid var(--line)' }}>
                  <span style={{ color: 'var(--green)', fontWeight: 500 }}>✓</span>
                  <span style={{ fontWeight: 500, minWidth: 78 }}>{fmtMonth(r.period_month)}</span>
                  <span style={{ color: 'var(--muted2)', fontSize: '.64rem' }}>{baseLabel} ¥{Number(r.gross_input).toLocaleString()}</span>
                  <b className="tnum" style={{ marginLeft: 'auto', fontFamily: 'Inter', color: 'var(--c-blue)' }}>¥{r.confirmed_amount.toLocaleString()}</b>
                  <button onClick={() => removeRow(r.id)} style={{ background: 'none', border: 'none', color: 'var(--muted)', cursor: 'pointer', fontSize: '.62rem' }}>取消</button>
                </div>
              ))}
            </div>
          )}
      </div>

      {/* 期間（この案件は何ヶ月） */}
      <div style={{ padding: '10px 16px', borderTop: '0.5px solid var(--line)', background: 'var(--bg2)', display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ fontSize: '.62rem', color: 'var(--muted2)', fontWeight: 500 }}>この案件の期間</span>
        {editingMonths ? (
          <>
            <input value={monthsEdit} onChange={e => setMonthsEdit(e.target.value)} inputMode="numeric" placeholder="12"
              style={{ width: 64, border: '1.5px solid var(--line)', borderRadius: 7, padding: '5px 8px', fontFamily: 'Inter', fontSize: '.74rem', textAlign: 'right' }} />
            <span style={{ fontSize: '.62rem', color: 'var(--muted2)' }}>ヶ月</span>
            <button onClick={saveMonths} disabled={busy} className="ui-btn ui-btn--primary" style={{ fontSize: '.64rem', padding: '5px 10px', marginLeft: 'auto' }}>保存する</button>
            <button onClick={() => { setEditingMonths(false); setMonthsEdit(months != null ? String(months) : '') }} className="ui-btn ui-btn--secondary" style={{ fontSize: '.64rem', padding: '5px 10px' }}>取消</button>
          </>
        ) : (
          <>
            <b style={{ fontSize: '.74rem', fontFamily: 'Inter' }}>{months ?? '未設定'}{months != null ? ' ヶ月' : ''}</b>
            <button onClick={() => setEditingMonths(true)} className="ui-btn ui-btn--secondary" style={{ fontSize: '.62rem', padding: '5px 10px', marginLeft: 'auto' }}>変更</button>
          </>
        )}
      </div>
    </div>
  )
}
