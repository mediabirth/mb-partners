import { redirect } from 'next/navigation'
import Link from 'next/link'
import ServiceAvatar from '@/components/ServiceAvatar'
import VendorStatusSteps from '@/components/VendorStatusSteps'
import { loadVendorBundle } from '@/lib/vendor-data'
import VendorWorkspace from './VendorWorkspace'
import VendorCaseExpense from './VendorCaseExpense'
import StatusPill from '@/components/ui/StatusPill'
import { dealStatus } from '@/lib/status'

export const runtime = 'edge'

export default async function VendorCaseDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const b = await loadVendorBundle()
  if (!b) redirect('/vendor/login')
  const a = b.assignments.find(x => x.id === id)
  if (!a) redirect('/vendor/cases')   // 自分の割当以外は不可（隔離）
  const svc = a.deal?.services
  const tasks = b.tasks.filter(t => t.assignment_id === id)
  const deliverables = b.deliverables.filter(d => d.assignment_id === id)
  const updates = b.updates.filter(u => u.assignment_id === id)
  const milestones = tasks.filter(t => t.type === 'milestone').sort((x, y) => x.sort - y.sort)
  const myExpenses = b.expenses.filter(e => e.assignment_id === id)
  const brief = a.brief

  return (
    <div className="page-anim">
      <div style={{ padding: '12px 20px 0' }}>
        <Link href="/vendor/cases" style={{ fontSize: '.7rem', color: 'var(--muted2)', textDecoration: 'none' }}>← 担当案件</Link>
      </div>
      {/* Header */}
      <div style={{ padding: '10px 20px 16px', borderBottom: '1px solid var(--line)', display: 'flex', gap: 13, alignItems: 'center' }}>
        {svc ? <ServiceAvatar logoPath={svc.logo_path} icon={svc.icon} color={svc.color} name={svc.name} size={46} /> : <ServiceAvatar logoPath={null} icon="" color="#9A9CA8" name="案件" size={46} />}
        <div style={{ minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <h1 style={{ fontSize: '1.18rem', fontWeight: 800, letterSpacing: '-.01em', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{a.deal?.customer_name ?? '案件'}</h1>
            <StatusPill size="sm" {...dealStatus(a.deal?.status ?? '')} />
          </div>
          <div style={{ fontSize: '.64rem', color: 'var(--muted)', marginTop: 2 }}>{svc?.name ?? 'サービス'}</div>
        </div>
      </div>

      {/* BR-V2：vendor固有＝プロジェクト管理ワークスペースの主役フレーミング＋全体進捗％。 */}
      {(() => {
        const items = tasks
        const done = items.filter(t => t.status === 'done').length
        const pct = items.length ? Math.round((done / items.length) * 100) : 0
        return (
          <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--line)', background: 'var(--blue-bg2)' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
              <span className="eyebrow" style={{ color: 'var(--blue)' }}>プロジェクト管理</span>
              <span style={{ fontFamily: 'Inter', fontSize: '1.05rem', fontWeight: 800, color: 'var(--blue)' }}>{pct}<span style={{ fontSize: '.66rem', fontWeight: 600, color: 'var(--muted2)' }}>%</span></span>
            </div>
            <div style={{ height: 8, borderRadius: 5, background: '#fff', overflow: 'hidden', border: '1px solid var(--blue-bg)' }}><div className="bar-grow" style={{ width: `${pct}%`, height: '100%', background: 'var(--blue)', borderRadius: 5 }} /></div>
            <div style={{ fontSize: '.6rem', color: 'var(--muted2)', marginTop: 6 }}>タスク・マイルストーン {done}/{items.length} 完了 · 実行を進めると報酬につながります</div>
          </div>
        )
      })()}

      {/* 進行フロー（マイルストーン） */}
      <div style={{ padding: '18px 20px 8px', borderBottom: '1px solid var(--line)' }}>
        <VendorStatusSteps status={a.deal?.status ?? 'received'} />
        {milestones.length > 0 && (
          <div style={{ marginTop: 14 }}>
            <div style={{ fontSize: '.58rem', color: 'var(--muted2)', fontWeight: 700, marginBottom: 6 }}>マイルストーン</div>
            {milestones.map(m => (
              <div key={m.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 0', fontSize: '.72rem' }}>
                <span style={{ width: 8, height: 8, borderRadius: '50%', background: m.status === 'done' ? 'var(--green)' : 'var(--line)', flexShrink: 0 }} />
                <span style={{ flex: 1, fontWeight: 600, color: m.status === 'done' ? 'var(--muted2)' : 'var(--txt)' }}>{m.title}</span>
                {m.due_date && <span style={{ fontSize: '.56rem', color: 'var(--muted2)' }}>{m.due_date.slice(5)}</span>}
                <span style={{ fontSize: '.52rem', fontWeight: 700, color: m.status === 'done' ? 'var(--green)' : 'var(--muted2)' }}>{m.status === 'done' ? '達成' : '未'}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 概要/スコープ（read-only） */}
      {brief && (
        <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--line)' }}>
          <div style={{ fontSize: '.58rem', color: 'var(--muted2)', fontWeight: 700, marginBottom: 5 }}>プロジェクト概要 / スコープ</div>
          <p style={{ fontSize: '.74rem', lineHeight: 1.7, whiteSpace: 'pre-wrap' }}>{brief}</p>
        </div>
      )}

      {/* ワークスペース：タスク完了・成果物・進捗メモ/フラグ */}
      <VendorWorkspace assignmentId={id} tasks={tasks} deliverables={deliverables} updates={updates} />

      {/* このプロジェクトのお金（結果として下流） */}
      <div style={{ padding: '8px 20px 0' }}>
        <h2 style={{ fontSize: '.78rem', fontWeight: 700, color: 'var(--muted2)', margin: '18px 0 8px' }}>このプロジェクトのお金</h2>
        <div style={{ background: '#fff', border: '1px solid var(--line)', borderRadius: 12, padding: '12px 14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: '.72rem', color: 'var(--muted2)' }}>委託費</span>
          <span className="tnum" style={{ fontFamily: 'Inter', fontSize: '.9rem', fontWeight: 800 }}>¥{a.base_fee.toLocaleString()}</span>
        </div>
        <p style={{ fontSize: '.58rem', color: 'var(--muted)', margin: '6px 2px 0' }}>支払（委託費＋承認済経費）は「報酬」タブで確認できます。</p>
      </div>
      {/* 経費申請（既存・案件内から） */}
      <VendorCaseExpense assignmentId={id} label={a.deal?.customer_name ?? '案件'} initial={myExpenses} />
    </div>
  )
}
