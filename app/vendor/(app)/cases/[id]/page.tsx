import { redirect } from 'next/navigation'
import Link from 'next/link'
import ServiceAvatar from '@/components/ServiceAvatar'
import { loadVendorBundle } from '@/lib/vendor-data'
import { VENDOR_CASE_ST, VENDOR_OFFER_ST } from '@/lib/vendor-status'
import { customerHonorific } from '@/lib/customer'
import VendorCaseTabs from './VendorCaseTabs'
import VendorOfferActions from './VendorOfferActions'

export const runtime = 'edge'

// 状態語はベンダー語の単一ソース lib/vendor-status.ts から輸入（パートナー語「成約」等は使わない）。

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
  // 提示中/辞退は割当自身の状態が案件状態より優先（承諾前は「実行中」ではない）。
  const offerSt = a.status === 'proposed' || a.status === 'declined' ? VENDOR_OFFER_ST[a.status] : null
  const st = offerSt ?? VENDOR_CASE_ST[a.deal?.status ?? ''] ?? { label: '実行中', c: 'var(--c-blue)', bg: 'var(--blue-bg)' }
  const cust = (a.deal && customerHonorific(a.deal)) || ''

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
            <h1 style={{ fontSize: '1.12rem', fontWeight: 500, letterSpacing: '-.01em', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{brief ?? (cust || '案件')}</h1>
            {/* 状態＝ベンダー語・6pxドット+テキスト（塗りピル廃止＝案件詳細の塗りゼロ） */}
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, flexShrink: 0 }}>
              <span style={{ width: 6, height: 6, borderRadius: '50%', background: st.c, display: 'inline-block' }} />
              <span style={{ fontSize: '.6rem', color: 'var(--muted2)' }}>{st.label}</span>
            </span>
          </div>
          <div style={{ fontSize: '.64rem', color: 'var(--muted)', marginTop: 2 }}>{cust || 'お客さま'} ・ {svc?.name ?? 'サービス'}</div>
        </div>
      </div>

      {/* 委託提示への応答（提示中のみ）／辞退済は静かな注記 */}
      {a.status === 'proposed' && <VendorOfferActions assignmentId={a.id} baseFee={a.base_fee} />}
      {a.status === 'declined' && (
        <p style={{ margin: '10px 20px 0', fontSize: '.68rem', color: 'var(--muted2)' }}>この委託提示は辞退しました。</p>
      )}

      {/* 進捗バー（1つに統合） */}
      <div style={{ padding: '0 20px 4px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
          <span style={{ fontSize: '.62rem', color: 'var(--muted2)', fontWeight: 500 }}>実行の進捗</span>
          <span className="tnum" style={{ fontFamily: 'Inter', fontSize: '.72rem', fontWeight: 500, color: 'var(--muted2)' }}>{done}/{total} 完了</span>
        </div>
        <div style={{ height: 3, borderRadius: 99, background: 'var(--bg2)', overflow: 'hidden' }}>
          <div className="bar-grow" style={{ width: `${pct}%`, height: '100%', borderRadius: 99, background: 'var(--txt)' }} />
        </div>
      </div>

      {/* 3タブ（やること / メッセージ / お金） */}
      <VendorCaseTabs assignmentId={id} customerLabel={cust || '案件'} baseFee={a.base_fee} tasks={tasks} deliverables={deliverables} updates={updates} expenses={expenses} />
    </div>
  )
}
