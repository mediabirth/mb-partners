import { redirect } from 'next/navigation'
import Link from 'next/link'
import { loadVendorBundle, deriveVendorNotifs } from '@/lib/vendor-data'
import StatusPill from '@/components/ui/StatusPill'
import ServiceAvatar from '@/components/ServiceAvatar'
import { dealStatus } from '@/lib/status'
import { BUILD_STAMP } from '@/lib/build-stamp'

export const runtime = 'edge'
const NOTIF_DOT: Record<string, string> = { ok: 'var(--green)', ng: 'var(--red)', pay: 'var(--green)', freeze: 'var(--blue)', assign: 'var(--blue)' }

// period（"2026-06" 等）を "6月" に。形式が違えば原文のまま（表示整形のみ）。
function fmtPeriod(p: string): string {
  const m = /^(\d{4})-(\d{2})$/.exec(p)
  return m ? `${Number(m[2])}月` : p
}

// Step3：取得済みタイムスタンプ(n.at)を相対表記に整形（新規取得なし・表示のみ）。
function relTime(at: string): string {
  const t = new Date(at).getTime()
  if (!t || Number.isNaN(t)) return ''
  const diff = Date.now() - t
  if (diff < 0) return ''
  const d = Math.floor(diff / 86400000)
  if (d >= 1) return `${d}日前`
  const h = Math.floor(diff / 3600000)
  if (h >= 1) return `${h}時間前`
  const m = Math.floor(diff / 60000)
  if (m >= 1) return `${m}分前`
  return 'たった今'
}

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

  // Step1 表示用の再配置のみ（新規取得なし／金額の値・計算・クエリは無改修）。
  // 対象月＝未払いがあればその直近期、無ければ直近期。pendingTotal は既存ヒーローと同一集計。
  const unpaidPayouts = b.payouts.filter(p => p.status === 'unpaid')
  const targetPeriod = (unpaidPayouts[0] ?? b.payouts[0])?.period ?? null
  const pendingTotal = projects.reduce((s, p) => s + p.pending, 0)

  // V-a：ヒーローの表示分岐（既存値・フラグのみ。新たな合計計算はしない／unpaidは既存集計をそのまま使用）。
  //  due=当月支払予定あり / done=予定0だが支払済履歴あり / none=予定0かつ履歴なし(新規)。
  const hasPaidHistory = b.payouts.some(p => p.status === 'paid')
  const payState: 'due' | 'done' | 'none' = unpaid > 0 ? 'due' : (hasPaidHistory ? 'done' : 'none')

  return (
    <div className="page-anim">
      {/* Step1：支払予定を主役にしたヒーロー。上端＝theme-color(#4733E6) と一致させ継ぎ目を消す。
          金額/件数の値・計算・クエリは無改修（既存値の再配置のみ）。装飾円は overflow:hidden 内に収容。 */}
      <div style={{ margin: '18px 20px 0', background: 'linear-gradient(155deg,#4733E6 0%,#3A28CE 100%)', borderRadius: 18, padding: '20px 22px 16px', color: '#fff', position: 'relative', overflow: 'hidden' }}>
        <div style={{ position: 'absolute', right: -60, top: -60, width: 200, height: 200, pointerEvents: 'none' }}>
          <div style={{ position: 'absolute', inset: 0, border: '1.5px solid rgba(255,255,255,.14)', borderRadius: '50%', animation: 'spin 30s linear infinite' }} />
          <div style={{ position: 'absolute', inset: 28, border: '1.5px solid rgba(255,255,255,.22)', borderRadius: '50%', animation: 'spin 20s linear infinite reverse' }} />
        </div>
        {/* ① 小キャプション「支払予定 · 対象月」＋状態チップ（履歴なし新規は非表示） */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', position: 'relative', zIndex: 1 }}>
          <span style={{ fontSize: '.6rem', opacity: .9 }}>支払予定{targetPeriod ? ` · ${fmtPeriod(targetPeriod)}` : ''}</span>
          {payState !== 'none' && (
            <span style={{ fontSize: '.56rem', fontWeight: 700, padding: '3px 10px', borderRadius: 999, background: 'rgba(255,255,255,.18)', color: '#fff' }}>{payState === 'due' ? '未払い' : '支払済'}</span>
          )}
        </div>
        {/* ② 状態別表示（金額は既存値のまま・再計算なし） */}
        {payState === 'due' ? (
          <Link href="/vendor/rewards" style={{ display: 'block', textDecoration: 'none', color: '#fff', marginTop: 6, position: 'relative', zIndex: 1 }}>
            <span style={{ fontFamily: 'Inter', fontWeight: 800, fontSize: '2.3rem', letterSpacing: '-.022em', lineHeight: 1.05, fontFeatureSettings: '"tnum"' }}>¥{unpaid.toLocaleString()}</span>
          </Link>
        ) : payState === 'done' ? (
          /* 予定0＋支払済履歴あり：巨大¥0をやめ安心表示。予定¥0は小さなミュート行に降格。 */
          <Link href="/vendor/rewards" style={{ display: 'block', textDecoration: 'none', color: '#fff', marginTop: 8, position: 'relative', zIndex: 1 }}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: '1.04rem', fontWeight: 800, letterSpacing: '-.01em' }}>
              <span style={{ width: 22, height: 22, borderRadius: '50%', background: 'rgba(255,255,255,.22)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3"><path d="M5 12.5l4.5 4.5L19 7" strokeLinecap="round" strokeLinejoin="round" /></svg>
              </span>
              今月の支払いは完了しています
            </span>
            <span style={{ display: 'block', fontSize: '.58rem', opacity: .72, marginTop: 6 }}>支払予定 ¥{unpaid.toLocaleString()}</span>
          </Link>
        ) : (
          /* 予定0＋履歴なし（新規）：中立表示。 */
          <div style={{ marginTop: 8, position: 'relative', zIndex: 1 }}>
            <span style={{ fontSize: '1.0rem', fontWeight: 700, opacity: .95 }}>現在お支払い予定はありません</span>
          </div>
        )}
        {/* ③ 区切り線 ④ 3チップ（担当案件 / 未完タスク / 要対応） */}
        <div style={{ display: 'flex', gap: 18, marginTop: 14, paddingTop: 12, borderTop: '1px solid rgba(255,255,255,.28)', position: 'relative', zIndex: 1 }}>
          <div style={{ fontSize: '.6rem', opacity: .85 }}>担当案件<b style={{ display: 'block', fontFamily: 'Inter', fontSize: '.88rem', fontWeight: 700, marginTop: 2 }}>{b.assignments.length}件</b></div>
          <div style={{ fontSize: '.6rem', opacity: .85 }}>未完タスク<b style={{ display: 'block', fontFamily: 'Inter', fontSize: '.88rem', fontWeight: 700, marginTop: 2 }}>{pendingTotal}件</b></div>
          <div style={{ fontSize: '.6rem', opacity: .85 }}>要対応<b style={{ display: 'block', fontFamily: 'Inter', fontSize: '.88rem', fontWeight: 700, marginTop: 2 }}>{todoList.length}件</b></div>
        </div>
      </div>

      {/* 今やること（Step4：空でもセクションは消さず静かな空状態カードを表示。判定は既存配列lengthのみ） */}
      <div style={{ padding: '20px 20px 8px', display: 'flex', alignItems: 'center', gap: 8 }}>
        <h2 className="ty-h2">今やること</h2>
        {todoList.length > 1 && (
          <span style={{ fontSize: '.55rem', fontWeight: 700, minWidth: 18, height: 18, padding: '0 5px', borderRadius: 999, background: 'var(--blue-bg)', color: 'var(--blue)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>{todoList.length}</span>
        )}
      </div>
      {todoList.length === 0 ? (
        <div style={{ margin: '0 20px', background: '#fff', border: '1px solid var(--line)', borderRadius: 13, padding: '18px 16px', textAlign: 'center', fontSize: '.7rem', color: 'var(--muted2)' }}>対応が必要な項目はありません</div>
      ) : (
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
          return (
            <Link key={a.id} href={`/vendor/cases/${a.id}`} className="card-hover lift" style={{ display: 'block', textDecoration: 'none', color: 'var(--txt)', background: '#fff', border: '1px solid var(--line)', borderRadius: 14, padding: '13px 15px', marginBottom: 10 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                {/* V-b：担当案件リストと同じサービスバッジ（ServiceAvatar）に統一。タイトル先頭文字（【）表示をやめる。 */}
                {(() => { const svc = a.deal?.services; return svc
                  ? <ServiceAvatar logoPath={svc.logo_path} icon={svc.icon} color={svc.color} name={svc.name} size={40} />
                  : <ServiceAvatar logoPath={null} icon="" color="#9A9CA8" name="案件" size={40} /> })()}
                <b style={{ flex: 1, fontSize: '.82rem', fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', minWidth: 0 }}>{a.deal?.customer_name ?? '案件'}</b>
                <StatusPill size="sm" {...dealStatus(a.deal?.status ?? '')} />
              </div>
              <div style={{ fontSize: '.62rem', color: 'var(--muted2)', marginTop: 8, display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                <span>未完タスク <b style={{ color: pending > 0 ? 'var(--blue)' : 'var(--muted2)' }}>{pending}</b></span>
                {/* Step2：未設定は裸の「—」をやめ tertiary 色で「マイルストーン未設定」 */}
                {nextMs
                  ? <span>次のマイルストーン: <b style={{ color: 'var(--txt)' }}>{nextMs.title}</b>{nextMs.due_date ? ` (${nextMs.due_date.slice(5)})` : ''}</span>
                  : <span style={{ color: 'var(--muted)' }}>マイルストーン未設定</span>}
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
          {notifs.map(n => {
            const rel = relTime(n.at)
            return (
            <Link key={n.id} href={n.href ?? '/vendor/inbox'} className="row-hover lift" style={{ display: 'flex', gap: 11, padding: '12px 20px', borderBottom: '1px solid var(--line)', textDecoration: 'none', alignItems: 'center' }}>
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: NOTIF_DOT[n.icon] ?? 'var(--blue)', flexShrink: 0 }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: '.76rem', fontWeight: 600, color: 'var(--txt)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{n.title}</div>
                <div style={{ fontSize: '.6rem', color: 'var(--muted2)', marginTop: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{n.sub}</div>
              </div>
              {/* Step3：取得済みなら相対時刻を右に。チェブロンは位置統一 */}
              {rel && <span style={{ fontSize: '.58rem', color: 'var(--muted)', flexShrink: 0 }}>{rel}</span>}
              <span style={{ color: 'var(--muted)', fontSize: '.75rem', flexShrink: 0 }}>›</span>
            </Link>
            )
          })}
        </div>
      )}
      {/* BR-DIAG2：版数スタンプ（本番 vendor が新ビルドを描画しているかの決定的証拠）。 */}
      <div style={{ textAlign: 'center', fontSize: '.5rem', color: 'var(--muted)', padding: '14px 0 6px', fontFamily: 'Inter' }}>build {BUILD_STAMP}</div>
    </div>
  )
}
