'use client'
/**
 * BR-C5：ダッシュボード深掘り分析（読取のみ）。期間切替・成約率分解・ファネル・受注額/粗利のセグメント分析・
 * 弱点ハイライト・各セグメント/段階クリックで該当案件一覧→案件詳細へドリル。数値の出所は既存（/api/console/analytics）。
 */
import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import StatCard from '@/components/ui/StatCard'
import { SectionHeader } from '@/components/ui/Header'
import StatusPill from '@/components/ui/StatusPill'
import { dealStatus, intakeType as intakePill } from '@/lib/status'

type Rec = {
  id: string; name: string; status: string; service_id: string; service_name: string
  intake: string; director_id: string | null; director_name: string | null
  partner_code: string | null; partner_name: string | null
  created_at: string; fixed_month: string | null; revenue: number; mbMargin: number
}
type Period = 'this' | 'last' | '3mo' | 'custom'
const WON = (s: string) => s === 'confirmed' || s === 'paid'
const yen = (n: number) => `¥${Math.round(n).toLocaleString()}`

function rangeFor(p: Period, from: string, to: string): [Date, Date] {
  const now = new Date()
  const y = now.getFullYear(), m = now.getMonth()
  if (p === 'this') return [new Date(y, m, 1), now]
  if (p === 'last') return [new Date(y, m - 1, 1), new Date(y, m, 0, 23, 59, 59)]
  if (p === '3mo') return [new Date(y, m - 2, 1), now]
  return [from ? new Date(from) : new Date(y, m, 1), to ? new Date(to + 'T23:59:59') : now]
}

export default function AnalyticsClient() {
  const [records, setRecords] = useState<Rec[] | null>(null)
  const [period, setPeriod] = useState<Period>('3mo')
  const [from, setFrom] = useState(''); const [to, setTo] = useState('')
  const [drill, setDrill] = useState<{ label: string; rows: Rec[] } | null>(null)

  useEffect(() => { fetch('/api/console/analytics').then(r => r.json()).then(d => setRecords(d.records ?? [])).catch(() => setRecords([])) }, [])

  const [start, end] = rangeFor(period, from, to)
  const periodMs = end.getTime() - start.getTime()
  const inRange = (r: Rec, a: Date, b: Date) => { const t = new Date(r.created_at).getTime(); return t >= a.getTime() && t <= b.getTime() }

  const view = useMemo(() => {
    const recs = records ?? []
    const cur = recs.filter(r => inRange(r, start, end))
    const prevStart = new Date(start.getTime() - periodMs), prevEnd = start
    const prev = recs.filter(r => inRange(r, prevStart, prevEnd))
    const calc = (arr: Rec[]) => {
      const shodan = arr.filter(r => r.intake !== 'direct')
      const won = shodan.filter(r => WON(r.status)).length
      const wonAll = arr.filter(r => WON(r.status))
      const revenue = wonAll.reduce((s, r) => s + r.revenue, 0)
      const margin = wonAll.reduce((s, r) => s + r.mbMargin, 0)
      return { total: arr.length, shodanTotal: shodan.length, won, rate: shodan.length ? Math.round(won / shodan.length * 100) : 0, revenue, margin, avg: wonAll.length ? Math.round(revenue / wonAll.length) : 0, wonCount: wonAll.length }
    }
    return { cur, prev, k: calc(cur), kp: calc(prev) }
  }, [records, period, from, to])

  // セグメント分解（成約率＋受注額）。keyFn でグルーピング。
  function segment(keyFn: (r: Rec) => string | null, labelFn: (r: Rec) => string) {
    const m = new Map<string, { label: string; total: number; won: number; revenue: number }>()
    for (const r of view.cur) {
      const k = keyFn(r); if (k == null) continue
      const e = m.get(k) ?? { label: labelFn(r), total: 0, won: 0, revenue: 0 }
      e.total++; if (WON(r.status)) { e.won++; e.revenue += r.revenue }
      m.set(k, e)
    }
    return [...m.entries()].map(([key, v]) => ({ key, ...v, rate: v.total ? Math.round(v.won / v.total * 100) : 0 }))
  }
  const byService = useMemo(() => segment(r => r.service_id, r => r.service_name).sort((a, b) => b.revenue - a.revenue), [view])
  const byPartner = useMemo(() => segment(r => r.intake === 'direct' ? null : (r.partner_code ?? null), r => r.partner_name ?? r.partner_code ?? '—').sort((a, b) => b.revenue - a.revenue), [view])
  const byDirector = useMemo(() => segment(r => r.director_id ?? '__none__', r => r.director_name ?? '未割当').sort((a, b) => b.revenue - a.revenue), [view])
  const byIntake = useMemo(() => segment(r => r.intake, r => r.intake === 'direct' ? '直営業' : '紹介・協力'), [view])
  // 弱点：成約率が最も低いサービス（サンプル3件以上）。
  const weakService = useMemo(() => byService.filter(s => s.total >= 3).sort((a, b) => a.rate - b.rate)[0] ?? null, [byService])

  // ファネル各段
  const shodanCur = view.cur.filter(r => r.intake !== 'direct')
  const funnel = [
    { key: 'received', label: '受付', n: shodanCur.filter(r => r.status === 'received').length, tone: 'warn' as const, color: 'var(--amber)' },
    { key: 'in_progress', label: '商談中', n: shodanCur.filter(r => r.status === 'in_progress').length, tone: 'progress' as const, color: 'var(--blue)' },
    { key: 'won', label: '成約', n: shodanCur.filter(r => WON(r.status)).length, tone: 'success' as const, color: 'var(--green)' },
    { key: 'lost', label: '不成立', n: shodanCur.filter(r => r.status === 'lost').length, tone: 'neutral' as const, color: 'var(--muted2)' },
  ]
  const funnelMax = Math.max(1, ...funnel.map(f => f.n))

  // 月推移（直近6ヶ月・受注額＋成約率）
  const months = useMemo(() => {
    const out: { label: string; revenue: number; rate: number; won: number; total: number }[] = []
    const now = new Date()
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
      const a = new Date(d.getFullYear(), d.getMonth(), 1), b = new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59)
      const arr = (records ?? []).filter(r => inRange(r, a, b))
      const sh = arr.filter(r => r.intake !== 'direct')
      const won = sh.filter(r => WON(r.status)).length
      out.push({ label: `${d.getMonth() + 1}月`, revenue: arr.filter(r => WON(r.status)).reduce((s, r) => s + r.revenue, 0), rate: sh.length ? Math.round(won / sh.length * 100) : 0, won, total: sh.length })
    }
    return out
  }, [records])
  const monthRevMax = Math.max(1, ...months.map(m => m.revenue))

  const openDrill = (label: string, rows: Rec[]) => setDrill({ label, rows })

  if (records === null) return <div style={{ padding: 40, color: 'var(--muted2)', fontSize: '.8rem' }}>読み込み中…</div>

  const Delta = ({ cur, prev, unit }: { cur: number; prev: number; unit?: string }) => {
    const diff = cur - prev, up = diff >= 0
    return <span style={{ fontSize: '.58rem', fontWeight: 700, color: diff === 0 ? 'var(--muted2)' : up ? 'var(--green)' : 'var(--red)' }}>{diff === 0 ? '±' : up ? '▲' : '▼'}{Math.abs(diff)}{unit ?? ''} <span style={{ color: 'var(--muted2)', fontWeight: 400 }}>前期比</span></span>
  }

  return (
    <div style={{ padding: '26px 32px 48px', maxWidth: 1120, margin: '0 auto' }}>
      {/* 期間切替 */}
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', marginBottom: 20 }}>
        <div style={{ display: 'flex', background: 'var(--bg2)', borderRadius: 9, padding: 3 }}>
          {([['this', '今月'], ['last', '先月'], ['3mo', '過去3ヶ月'], ['custom', '任意期間']] as const).map(([v, l]) => (
            <button key={v} onClick={() => setPeriod(v)} style={{ border: 'none', cursor: 'pointer', fontFamily: 'inherit', fontSize: '.74rem', fontWeight: 700, padding: '7px 14px', borderRadius: 7, color: period === v ? 'var(--txt)' : 'var(--muted2)', background: period === v ? '#fff' : 'transparent', boxShadow: period === v ? '0 1px 4px rgba(14,14,20,.1)' : 'none' }}>{l}</button>
          ))}
        </div>
        {period === 'custom' && <>
          <input type="date" value={from} onChange={e => setFrom(e.target.value)} style={{ border: '1.5px solid var(--line)', borderRadius: 8, padding: '6px 10px', fontFamily: 'inherit', fontSize: '.72rem' }} />
          <span style={{ color: 'var(--muted2)' }}>〜</span>
          <input type="date" value={to} onChange={e => setTo(e.target.value)} style={{ border: '1.5px solid var(--line)', borderRadius: 8, padding: '6px 10px', fontFamily: 'inherit', fontSize: '.72rem' }} />
        </>}
        <span style={{ fontSize: '.62rem', color: 'var(--muted2)' }}>{start.toLocaleDateString('ja')} 〜 {end.toLocaleDateString('ja')}</span>
      </div>

      {/* KPI */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14, marginBottom: 22 }}>
        <StatCard label="成約率" value={view.k.rate} unit="%" accent="green" sub={<Delta cur={view.k.rate} prev={view.kp.rate} unit="pt" />} />
        <StatCard label="受注額" value={yen(view.k.revenue)} accent="blue" sub={`成約 ${view.k.wonCount}件`} />
        <StatCard label="MB粗利" value={yen(view.k.margin)} accent="blue" sub={<Delta cur={Math.round(view.k.margin / 1000)} prev={Math.round(view.kp.margin / 1000)} unit="k" />} />
        <StatCard label="平均受注額" value={yen(view.k.avg)} accent="amber" sub={`成約 ${view.k.wonCount}件の平均`} />
      </div>

      {/* ファネル＋弱点 */}
      <div style={{ display: 'grid', gridTemplateColumns: '1.3fr 1fr', gap: 18, marginBottom: 22 }}>
        <div style={{ background: '#fff', border: '1px solid var(--line)', borderRadius: 14, padding: '16px 20px' }}>
          <SectionHeader title="ファネル" />
          <div style={{ marginTop: 12 }}>
            {funnel.map(f => {
              const w = Math.round((f.n / funnelMax) * 100)
              const rows = shodanCur.filter(r => f.key === 'won' ? WON(r.status) : r.status === f.key)
              return (
                <button key={f.key} onClick={() => openDrill(`${f.label}（${f.n}件）`, rows)} className="lift" style={{ display: 'block', width: '100%', textAlign: 'left', border: 'none', background: 'none', cursor: 'pointer', padding: '7px 0', fontFamily: 'inherit' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                    <span style={{ fontSize: '.72rem', fontWeight: 600 }}>{f.label}</span>
                    <span style={{ fontSize: '.7rem', fontWeight: 700, color: 'var(--muted2)' }}>{f.n}件 <span style={{ fontSize: '.58rem' }}>({shodanCur.length ? Math.round(f.n / shodanCur.length * 100) : 0}%)</span></span>
                  </div>
                  <div style={{ height: 8, borderRadius: 4, background: 'var(--bg2)', overflow: 'hidden' }}><div style={{ width: `${w}%`, height: '100%', background: f.color, borderRadius: 4 }} /></div>
                </button>
              )
            })}
          </div>
        </div>
        <div style={{ background: '#fff', border: '1px solid var(--line)', borderRadius: 14, padding: '16px 20px' }}>
          <SectionHeader title="要注目（弱点）" />
          {weakService ? (
            <button onClick={() => openDrill(`${weakService.label}（成約率 ${weakService.rate}%）`, view.cur.filter(r => r.service_id === weakService.key))} className="lift" style={{ display: 'block', width: '100%', textAlign: 'left', border: '1px solid var(--red-bg)', background: 'var(--red-bg)', borderRadius: 12, padding: '14px', cursor: 'pointer', marginTop: 12, fontFamily: 'inherit' }}>
              <div style={{ fontSize: '.62rem', color: 'var(--red)', fontWeight: 800, marginBottom: 4 }}>最も成約率が低いサービス</div>
              <div style={{ fontSize: '.86rem', fontWeight: 800 }}>{weakService.label}</div>
              <div style={{ fontSize: '.7rem', color: 'var(--muted2)', marginTop: 3 }}>成約率 <b style={{ color: 'var(--red)' }}>{weakService.rate}%</b>（{weakService.won}/{weakService.total}件）· 改善の起点</div>
            </button>
          ) : <p style={{ fontSize: '.7rem', color: 'var(--muted2)', marginTop: 12 }}>十分なサンプルがありません（3件以上で判定）。</p>}
        </div>
      </div>

      {/* 月推移 */}
      <div style={{ background: '#fff', border: '1px solid var(--line)', borderRadius: 14, padding: '16px 20px', marginBottom: 22 }}>
        <SectionHeader title="月推移（受注額＋成約率）" />
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 12, height: 130, marginTop: 16 }}>
          {months.map((m, i) => {
            const h = Math.max(3, Math.round((m.revenue / monthRevMax) * 100))
            return (
              <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5 }}>
                <span style={{ fontSize: '.56rem', color: 'var(--green)', fontWeight: 700 }}>{m.rate}%</span>
                <div className="bar-grow" style={{ width: '100%', maxWidth: 34, height: h, borderRadius: '6px 6px 0 0', background: i === months.length - 1 ? 'var(--blue)' : 'var(--blue-bg)' }} title={yen(m.revenue)} />
                <span style={{ fontSize: '.56rem', color: 'var(--muted2)' }}>{m.label}</span>
              </div>
            )
          })}
        </div>
      </div>

      {/* セグメント分解（成約率＋受注額・クリックでドリル・弱点は赤） */}
      {([
        { title: 'サービス別', rows: byService, kf: (r: Rec, k: string) => r.service_id === k },
        { title: 'パートナー別', rows: byPartner, kf: (r: Rec, k: string) => r.partner_code === k },
        { title: 'MB担当別', rows: byDirector, kf: (r: Rec, k: string) => (r.director_id ?? '__none__') === k },
        { title: '流入経路別', rows: byIntake, kf: (r: Rec, k: string) => r.intake === k },
      ] as const).map(seg => (
        <div key={seg.title} style={{ background: '#fff', border: '1px solid var(--line)', borderRadius: 14, padding: '16px 20px', marginBottom: 18 }}>
          <SectionHeader title={`${seg.title} 成約率・受注額`} />
          <div style={{ marginTop: 12 }}>
            {seg.rows.length === 0 ? <p style={{ fontSize: '.66rem', color: 'var(--muted2)' }}>データがありません。</p> : seg.rows.map(s => {
              const weak = s.total >= 3 && s.rate < 40
              return (
                <button key={s.key} onClick={() => openDrill(`${s.label}（${seg.title}）`, view.cur.filter(r => seg.kf(r, s.key)))} className="lift" style={{ display: 'grid', gridTemplateColumns: '1.6fr 1.2fr auto', gap: 12, alignItems: 'center', width: '100%', textAlign: 'left', border: 'none', background: 'none', cursor: 'pointer', padding: '9px 0', borderTop: '1px solid #F2F2F6', fontFamily: 'inherit' }}>
                  <span style={{ fontSize: '.74rem', fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{s.label}<span style={{ fontSize: '.58rem', color: 'var(--muted2)', fontWeight: 400, marginLeft: 5 }}>{s.won}/{s.total}件</span>{weak && <span style={{ fontSize: '.5rem', fontWeight: 800, color: '#fff', background: 'var(--red)', borderRadius: 20, padding: '1px 6px', marginLeft: 6 }}>要注目</span>}</span>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ flex: 1, height: 6, borderRadius: 4, background: 'var(--bg2)', overflow: 'hidden' }}><span style={{ display: 'block', width: `${s.rate}%`, height: '100%', background: weak ? 'var(--red)' : 'var(--green)', borderRadius: 4 }} /></span>
                    <span style={{ fontSize: '.64rem', fontWeight: 700, color: weak ? 'var(--red)' : 'var(--muted2)', width: 32, textAlign: 'right' }}>{s.rate}%</span>
                  </span>
                  <span className="tnum" style={{ fontFamily: 'Inter', fontWeight: 700, fontSize: '.78rem', textAlign: 'right' }}>{yen(s.revenue)}</span>
                </button>
              )
            })}
          </div>
        </div>
      ))}

      {/* ドリル：該当案件一覧 → 案件詳細 */}
      {drill && (
        <div onClick={() => setDrill(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(14,14,20,.4)', zIndex: 90, display: 'flex', justifyContent: 'flex-end' }}>
          <div onClick={e => e.stopPropagation()} style={{ width: 440, maxWidth: '94vw', height: '100%', background: '#fff', display: 'flex', flexDirection: 'column', boxShadow: '-18px 0 48px rgba(14,14,20,.12)' }}>
            <div style={{ padding: '18px 22px', borderBottom: '1px solid var(--line)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <b style={{ fontSize: '.86rem' }}>{drill.label} · {drill.rows.length}件</b>
              <button onClick={() => setDrill(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)', fontSize: '1.1rem' }}>✕</button>
            </div>
            <div className="cascade" style={{ flex: 1, overflowY: 'auto' }}>
              {drill.rows.length === 0 ? <p style={{ padding: 20, fontSize: '.74rem', color: 'var(--muted2)' }}>該当する案件がありません。</p> : drill.rows.map(r => (
                <Link key={r.id} href={`/console/deals?deal=${r.id}`} className="row-hover lift" style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 18px', borderBottom: '1px solid #F2F2F6', textDecoration: 'none', color: 'var(--txt)' }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: '.76rem', fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.name}</div>
                    <div style={{ fontSize: '.58rem', color: 'var(--muted2)', marginTop: 1 }}>{r.service_name}{r.revenue > 0 && ` · ${yen(r.revenue)}`}</div>
                  </div>
                  {r.intake === 'direct' ? <StatusPill size="sm" {...intakePill('direct')} /> : <StatusPill size="sm" {...dealStatus(r.status)} />}
                  <span style={{ color: 'var(--muted)', fontSize: '.72rem' }}>›</span>
                </Link>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
