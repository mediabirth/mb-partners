import { redirect } from 'next/navigation'
import Link from 'next/link'
import ServiceAvatar from '@/components/ServiceAvatar'
import { loadVendorBundle } from '@/lib/vendor-data'
import VendorCaseTabs from './VendorCaseTabs'

export const runtime = 'edge'

// ベンダー語の状態チップ（パートナー語「成約」等は使わない）。
const VST: Record<string, { label: string; c: string; bg: string }> = {
  received: { label: '準備中', c: 'var(--amber)', bg: 'var(--amber-bg)' },
  in_progress: { label: '実行中', c: 'var(--c-blue)', bg: 'var(--blue-bg)' },
  confirmed: { label: '実行中', c: 'var(--c-blue)', bg: 'var(--blue-bg)' },
  paid: { label: '完了', c: 'var(--green)', bg: 'var(--green-bg)' },
  lost: { label: '終了', c: 'var(--muted2)', bg: 'var(--bg2)' },
}

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
  const expenses = b.expenses.filter(e => e.assignment_id === id)
  const brief = a.brief
  const st = VST[a.deal?.status ?? ''] ?? { label: '実行中', c: 'var(--c-blue)', bg: 'var(--blue-bg)' }

  // 進捗バー（タスク完了率・1つに統合：旧「プロジェクト管理%」＋ステップ表示は廃止）。
  const doTasks = tasks.filter(t => t.type === 'task')
  const done = doTasks.filter(t => t.status === 'done').length
  const total = doTasks.length
  const pct = total ? Math.round(done / total * 100) : 0

  return (
    <div className="page-anim">
      {/* 上部固定：戻る＋ヘッダ＋進捗バー1つ */}
      <div style={{ padding: '12px 20px 0' }}>
        <Link href="/vendor/cases" style={{ fontSize: '.7rem', color: 'var(--muted2)', textDecoration: 'none' }}>← 担当案件</Link>
      </div>
      <div style={{ padding: '10px 20px 14px', display: 'flex', gap: 13, alignItems: 'center' }}>
        {svc ? <ServiceAvatar logoPath={svc.logo_path} icon={svc.icon} color={svc.color} name={svc.name} size={46} /> : <ServiceAvatar logoPath={null} icon="" color="#9A9CA8" name="案件" size={46} />}
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <h1 style={{ fontSize: '1.12rem', fontWeight: 800, letterSpacing: '-.01em', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{brief ?? a.deal?.customer_name ?? '案件'}</h1>
            <span style={{ flexShrink: 0, fontSize: '.56rem', fontWeight: 700, color: st.c, background: st.bg, borderRadius: 20, padding: '2px 10px' }}>{st.label}</span>
          </div>
          <div style={{ fontSize: '.64rem', color: 'var(--muted)', marginTop: 2 }}>{a.deal?.customer_name ?? '顧客'} · {svc?.name ?? 'サービス'}</div>
        </div>
      </div>

      {/* 進捗バー（1つに統合） */}
      <div style={{ padding: '0 20px 4px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
          <span style={{ fontSize: '.62rem', color: 'var(--muted2)', fontWeight: 700 }}>実行の進捗</span>
          <span className="tnum" style={{ fontFamily: 'Inter', fontSize: '.72rem', fontWeight: 700, color: pct === 100 ? 'var(--green)' : 'var(--c-blue)' }}>{done}/{total} 完了</span>
        </div>
        <div style={{ height: 8, borderRadius: 99, background: 'var(--bg2)', overflow: 'hidden' }}>
          <div className="bar-grow" style={{ width: `${pct}%`, height: '100%', borderRadius: 99, background: pct === 100 ? 'var(--green)' : 'var(--c-blue)' }} />
        </div>
      </div>

      {/* 3タブ（やること / メッセージ / お金） */}
      <VendorCaseTabs assignmentId={id} customerLabel={a.deal?.customer_name ?? '案件'} baseFee={a.base_fee} tasks={tasks} deliverables={deliverables} updates={updates} expenses={expenses} />
    </div>
  )
}
