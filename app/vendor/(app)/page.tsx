import { redirect } from 'next/navigation'
import Link from 'next/link'
import ServiceAvatar from '@/components/ServiceAvatar'
import { loadVendorBundle, deriveVendorNotifs } from '@/lib/vendor-data'
import StatusPill from '@/components/ui/StatusPill'
import { dealStatus } from '@/lib/status'
import { BUILD_STAMP } from '@/lib/build-stamp'

export const runtime = 'edge'
const NOTIF_DOT: Record<string, string> = { ok: 'var(--green)', ng: 'var(--red)', pay: 'var(--green)', freeze: 'var(--blue)', assign: 'var(--blue)' }

export default async function VendorHome() {
  const b = await loadVendorBundle()
  if (!b) redirect('/vendor/login')

  const tasksOf = (aid: string) => b.tasks.filter(t => t.assignment_id === aid)
  const active = b.assignments.filter(a => ['received', 'in_progress', 'confirmed'].includes(a.deal?.status ?? ''))
  // プロジェクトごとの 未完タスク・次マイルストーン
  const projects = active.map(a => {
    const tks = tasksOf(a.id)
    const pendingTasks = tks.filter(t => t.type === 'task' && t.status !== 'done')
    const nextMs = tks.filter(t => t.type === 'milestone' && t.status !== 'done').sort((x, y) => x.sort - y.sort)[0] ?? null
    return { a, pending: pendingTasks.length, nextMs }
  })

  // 今やること：未完タスク・必要成果物の未提出・差戻し経費
  const todos: { key: string; title: string; sub: string; href: string; dot: string }[] = []
  for (const a of b.assignments) {
    const tks = tasksOf(a.id)
    for (const t of tks.filter(t => t.type === 'task' && t.status !== 'done').slice(0, 2))
      todos.push({ key: 't' + t.id, title: t.title, sub: `${a.deal?.customer_name ?? '案件'}${t.due_date ? ` · 期日 ${t.due_date.slice(5)}` : ''}`, href: `/vendor/cases/${a.id}`, dot: 'var(--blue)' })
    for (const t of tks.filter(t => t.needs_deliverable && !b.deliverables.some(d => d.task_id === t.id)).slice(0, 2))
      todos.push({ key: 'd' + t.id, title: `成果物を提出: ${t.title}`, sub: a.deal?.customer_name ?? '案件', href: `/vendor/cases/${a.id}`, dot: 'var(--amber)' })
  }
  for (const e of b.expenses.filter(e => e.status === 'rejected'))
    todos.push({ key: 'r' + e.id, title: '差し戻された経費があります', sub: `${e.kind} ¥${e.amount.toLocaleString()}`, href: `/vendor/cases/${e.assignment_id}`, dot: 'var(--red)' })
  const todoList = todos.slice(0, 5)

  const unpaid = b.payouts.filter(p => p.status === 'unpaid').reduce((s, p) => s + p.amount, 0)
  const notifs = deriveVendorNotifs(b).slice(0, 4)

  return (
    <div className="page-anim">
      {/* ヘッダ：進行中プロジェクト（プロジェクト中心・お金は控えめ） */}
      <div style={{ margin: '18px 20px 0', background: 'linear-gradient(135deg,#5240F2 0%,#4733E6 52%,#3A28CE 100%)', borderRadius: 18, padding: '22px 22px 18px', color: '#fff', position: 'relative', overflow: 'hidden' }}>
        <div style={{ position: 'absolute', right: -60, top: -60, width: 200, height: 200, pointerEvents: 'none' }}>
          <div style={{ position: 'absolute', inset: 0, border: '1.5px solid rgba(255,255,255,.14)', borderRadius: '50%', animation: 'spin 30s linear infinite' }} />
          <div style={{ position: 'absolute', inset: 28, border: '1.5px solid rgba(255,255,255,.22)', borderRadius: '50%', animation: 'spin 20s linear infinite reverse' }} />
        </div>
        <div style={{ fontSize: '.54rem', fontFamily: 'Inter', letterSpacing: '.26em', opacity: .85, marginBottom: 7, textTransform: 'uppercase' }}>進行中プロジェクト</div>
        <div style={{ fontFamily: 'Inter', fontWeight: 800, fontSize: '2.3rem', letterSpacing: '-.022em', lineHeight: 1.05 }}>{active.length}<span style={{ fontSize: '1rem', fontWeight: 600, opacity: .8, marginLeft: 4 }}>件</span></div>
        <div style={{ display: 'flex', gap: 18, marginTop: 14, paddingTop: 12, borderTop: '1px solid rgba(255,255,255,.28)', position: 'relative', zIndex: 1 }}>
          <div style={{ fontSize: '.6rem', opacity: .85 }}>未完タスク<b style={{ display: 'block', fontFamily: 'Inter', fontSize: '.88rem', fontWeight: 700, marginTop: 2 }}>{projects.reduce((s, p) => s + p.pending, 0)}件</b></div>
          <div style={{ fontSize: '.6rem', opacity: .85 }}>担当案件<b style={{ display: 'block', fontFamily: 'Inter', fontSize: '.88rem', fontWeight: 700, marginTop: 2 }}>{b.assignments.length}件</b></div>
          <Link href="/vendor/rewards" style={{ fontSize: '.6rem', opacity: .85, textDecoration: 'none', color: '#fff' }}>未払い 支払予定<b style={{ display: 'block', fontFamily: 'Inter', fontSize: '.88rem', fontWeight: 700, marginTop: 2, fontFeatureSettings: '"tnum"' }}>¥{unpaid.toLocaleString()}</b></Link>
        </div>
      </div>

      {/* 今やること */}
      {todoList.length > 0 && (
        <>
          <div style={{ padding: '20px 20px 8px' }}><h2 className="ty-h2">今やること</h2></div>
          <div style={{ margin: '0 20px', background: '#fff', border: '1px solid var(--line)', borderRadius: 13, overflow: 'hidden' }}>
            {todoList.map(t => (
              <Link key={t.key} href={t.href} className="row-hover lift" style={{ display: 'flex', gap: 11, padding: '13px 14px', borderBottom: '1px solid #F2F2F6', textDecoration: 'none', color: 'var(--txt)', alignItems: 'center' }}>
                <span style={{ width: 8, height: 8, borderRadius: '50%', background: t.dot, flexShrink: 0 }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: '.76rem', fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{t.title}</div>
                  <div style={{ fontSize: '.6rem', color: 'var(--muted2)', marginTop: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{t.sub}</div>
                </div>
                <span style={{ color: 'var(--muted)', fontSize: '.75rem' }}>›</span>
              </Link>
            ))}
          </div>
        </>
      )}

      {/* 進行中プロジェクト */}
      <div style={{ padding: '22px 20px 8px' }}>
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
          <h2 className="ty-h2">進行中プロジェクト</h2>
          <Link href="/vendor/cases" style={{ fontSize: '.66rem', color: 'var(--blue)', fontWeight: 500, textDecoration: 'none' }}>すべて →</Link>
        </div>
      </div>
      <div style={{ padding: '0 20px' }}>
        {projects.length === 0 ? (
          <p style={{ fontSize: '.7rem', color: 'var(--muted2)', padding: '4px 2px 16px' }}>進行中のプロジェクトはありません。</p>
        ) : projects.slice(0, 4).map(({ a, pending, nextMs }) => {
          const svc = a.deal?.services
          return (
            <Link key={a.id} href={`/vendor/cases/${a.id}`} className="card-hover lift" style={{ display: 'block', textDecoration: 'none', color: 'var(--txt)', background: '#fff', border: '1px solid var(--line)', borderRadius: 14, padding: '13px 15px', marginBottom: 10 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                {svc ? <ServiceAvatar logoPath={svc.logo_path} icon={svc.icon} color={svc.color} name={svc.name} size={30} /> : <ServiceAvatar logoPath={null} icon="" color="#9A9CA8" name="案件" size={30} />}
                <b style={{ flex: 1, fontSize: '.82rem', fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', minWidth: 0 }}>{a.deal?.customer_name ?? '案件'}</b>
                <StatusPill size="sm" {...dealStatus(a.deal?.status ?? '')} />
              </div>
              <div style={{ fontSize: '.62rem', color: 'var(--muted2)', marginTop: 8, display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                <span>未完タスク <b style={{ color: pending > 0 ? 'var(--blue)' : 'var(--muted2)' }}>{pending}</b></span>
                <span>次のマイルストーン: <b style={{ color: 'var(--txt)' }}>{nextMs ? nextMs.title : '—'}</b>{nextMs?.due_date ? ` (${nextMs.due_date.slice(5)})` : ''}</span>
              </div>
            </Link>
          )
        })}
      </div>

      {/* 最近の動き */}
      <div style={{ padding: '10px 20px 6px' }}>
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 4 }}>
          <h2 className="ty-h2">最近の動き</h2>
          <Link href="/vendor/inbox" style={{ fontSize: '.66rem', color: 'var(--blue)', fontWeight: 500, textDecoration: 'none' }}>通知へ →</Link>
        </div>
      </div>
      {notifs.length === 0 ? (
        <p style={{ padding: '4px 20px 20px', fontSize: '.7rem', color: 'var(--muted2)' }}>まだ動きはありません。</p>
      ) : (
        <div>
          {notifs.map(n => (
            <Link key={n.id} href={n.href ?? '/vendor/inbox'} className="row-hover lift" style={{ display: 'flex', gap: 11, padding: '12px 20px', borderBottom: '1px solid var(--line)', textDecoration: 'none', alignItems: 'center' }}>
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: NOTIF_DOT[n.icon] ?? 'var(--blue)', flexShrink: 0 }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: '.76rem', fontWeight: 600, color: 'var(--txt)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{n.title}</div>
                <div style={{ fontSize: '.6rem', color: 'var(--muted2)', marginTop: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{n.sub}</div>
              </div>
              <span style={{ color: 'var(--muted)', fontSize: '.75rem' }}>›</span>
            </Link>
          ))}
        </div>
      )}
      {/* BR-DIAG2：版数スタンプ（本番 vendor が新ビルドを描画しているかの決定的証拠）。 */}
      <div style={{ textAlign: 'center', fontSize: '.5rem', color: 'var(--muted)', padding: '14px 0 6px', fontFamily: 'Inter' }}>build {BUILD_STAMP}</div>
    </div>
  )
}
