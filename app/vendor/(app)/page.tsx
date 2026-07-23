import { redirect } from 'next/navigation'
import Link from 'next/link'
import { loadVendorBundle } from '@/lib/vendor-data'
import ServiceAvatar from '@/components/ServiceAvatar'
import { VENDOR_OFFER_ST } from '@/lib/vendor-status'
import { customerHonorific } from '@/lib/customer'
import { BUILD_STAMP } from '@/lib/build-stamp'
import EmptyState from '@/components/ui/EmptyState'

export const runtime = 'edge'

// period（"2026-06" 等）を "6月" に。形式が違えば原文のまま（表示整形のみ）。
function fmtPeriod(p: string): string {
  const m = /^(\d{4})-(\d{2})$/.exec(p)
  return m ? `${Number(m[2])}月` : p
}


export default async function VendorHome() {
  const b = await loadVendorBundle()
  if (!b) redirect('/vendor/login')

  // 純化バッチ: home も契約とお金に純化。PM（タスク/マイルストーン/進捗%）を撤去し、割当のライフサイクルで表示。
  // 進行中＝提示中/了承済/納品済み（辞退・支払後を除く）。
  const active = b.assignments.filter(a => ['proposed', 'accepted', 'assigned', 'delivered'].includes(a.status ?? ''))

  // 今やること：承諾待ちの提示 / 納品待ち（了承済で未納品）/ 差戻し経費（すべて契約・お金の要対応）。
  const todos: { key: string; title: string; sub: string; href: string; dot: string }[] = []
  for (const a of b.assignments) {
    if (a.status === 'proposed') todos.push({ key: 'o' + a.id, title: '委託のご提案が届いています', sub: `${(a.deal && customerHonorific(a.deal)) || '案件'} ・ 委託費 ¥${a.base_fee.toLocaleString()}`, href: `/vendor/cases/${a.id}`, dot: 'var(--amber)' })
    else if (a.status === 'accepted' || a.status === 'assigned') todos.push({ key: 'd' + a.id, title: '納品済みにして経費を申請', sub: (a.deal && customerHonorific(a.deal)) || '案件', href: `/vendor/cases/${a.id}`, dot: 'var(--c-blue)' })
  }
  for (const e of b.expenses.filter(e => e.status === 'rejected'))
    todos.push({ key: 'r' + e.id, title: '差し戻された経費があります', sub: `${e.kind} ¥${e.amount.toLocaleString()}`, href: `/vendor/cases/${e.assignment_id}`, dot: 'var(--red)' })
  const todoList = todos.slice(0, 5)

  const unpaid = b.payouts.filter(p => p.status === 'unpaid').reduce((s, p) => s + p.amount, 0)
  // 納品待ち＝了承済で未納品の委託件数（納品がお金のゲート）。
  const awaitingDelivery = b.assignments.filter(a => a.status === 'accepted' || a.status === 'assigned').length

  const unpaidPayouts = b.payouts.filter(p => p.status === 'unpaid')
  const targetPeriod = (unpaidPayouts[0] ?? b.payouts[0])?.period ?? null

  // V-a：ヒーローの表示分岐（既存値・フラグのみ。新たな合計計算はしない／unpaidは既存集計をそのまま使用）。
  //  due=当月支払予定あり / done=予定0だが支払済履歴あり / none=予定0かつ履歴なし(新規)。
  const hasPaidHistory = b.payouts.some(p => p.status === 'paid')
  const payState: 'due' | 'done' | 'none' = unpaid > 0 ? 'due' : (hasPaidHistory ? 'done' : 'none')

  return (
    <div className="page-anim">
      {/* Step1：支払予定を主役にしたヒーロー。上端＝theme-color(#4733E6) と一致させ継ぎ目を消す。
          金額/件数の値・計算・クエリは無改修（既存値の再配置のみ）。
          v2.2：この塗りが「1画面1つの塗り」。回転する装飾円は撤去（装飾アニメ禁止）。 */}
      <div style={{ margin: '18px 20px 0', background: 'linear-gradient(155deg,#4733E6 0%,#3A28CE 100%)', borderRadius: 18, padding: '20px 22px 16px', color: '#fff', position: 'relative', overflow: 'hidden' }}>
        {/* ① 小キャプション「今月の委託費見込み」＋状態チップ（履歴なし新規は非表示） */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', position: 'relative', zIndex: 1 }}>
          <span style={{ fontSize: '.6rem', opacity: .9 }}>今月の委託費見込み{targetPeriod ? ` ・ ${fmtPeriod(targetPeriod)}` : ''}</span>
          {payState !== 'none' && (
            <span style={{ fontSize: '.56rem', fontWeight: 500, padding: '3px 10px', borderRadius: 999, background: 'rgba(255,255,255,.18)', color: '#fff' }}>{payState === 'due' ? '未払い' : '支払済'}</span>
          )}
        </div>
        {/* ② 状態別表示（金額は既存値のまま・再計算なし） */}
        {payState === 'due' ? (
          <Link href="/vendor/rewards" style={{ display: 'block', textDecoration: 'none', color: '#fff', marginTop: 6, position: 'relative', zIndex: 1 }}>
            <span style={{ fontFamily: 'Inter', fontWeight: 500, fontSize: '2.3rem', letterSpacing: '-.022em', lineHeight: 1.05, fontFeatureSettings: '"tnum"' }}>¥{unpaid.toLocaleString()}</span>
          </Link>
        ) : payState === 'done' ? (
          /* 予定0＋支払済履歴あり：巨大¥0をやめ安心表示。予定¥0は小さなミュート行に降格。 */
          <Link href="/vendor/rewards" style={{ display: 'block', textDecoration: 'none', color: '#fff', marginTop: 8, position: 'relative', zIndex: 1 }}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: '1.04rem', fontWeight: 500, letterSpacing: '-.01em' }}>
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
            <span style={{ fontSize: '1.0rem', fontWeight: 500, opacity: .95 }}>現在お支払い予定はありません</span>
          </div>
        )}
        {/* ③ 区切り線 ④ 3チップ（担当案件 / 未完タスク / 要対応） */}
        <div style={{ display: 'flex', gap: 18, marginTop: 14, paddingTop: 12, borderTop: '1px solid rgba(255,255,255,.28)', position: 'relative', zIndex: 1 }}>
          <div style={{ fontSize: '.6rem', opacity: .85 }}>進行中<b style={{ display: 'block', fontFamily: 'Inter', fontSize: '.88rem', fontWeight: 500, marginTop: 2 }}>{active.length}件</b></div>
          <div style={{ fontSize: '.6rem', opacity: .85 }}>やること<b style={{ display: 'block', fontFamily: 'Inter', fontSize: '.88rem', fontWeight: 500, marginTop: 2 }}>{todoList.length}件</b></div>
          <div style={{ fontSize: '.6rem', opacity: .85 }}>納品待ち<b style={{ display: 'block', fontFamily: 'Inter', fontSize: '.88rem', fontWeight: 500, marginTop: 2 }}>{awaitingDelivery}件</b></div>
        </div>
      </div>

      {/* 今やること（最優先1件のみ大カード＋「ほか○件」。3件並べない＝焦点を1つに） */}
      <div style={{ padding: '22px 20px 8px' }}>
        <h2 className="ty-h2">今やること</h2>
      </div>
      <div style={{ padding: '0 20px' }}>
        {todoList.length === 0 ? (
          <div style={{ background: '#fff', border: '0.5px solid var(--line)', borderRadius: 14, padding: '20px 16px', textAlign: 'center' }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--green)" strokeWidth="1.8" style={{ marginBottom: 6 }} aria-hidden><circle cx="12" cy="12" r="9" /><path d="M8.5 12.5l2.5 2.5 5-5" strokeLinecap="round" strokeLinejoin="round" /></svg>
            <div style={{ fontSize: '.74rem', fontWeight: 500 }}>対応が必要な項目はありません</div>
          </div>
        ) : (
          <>
            {/* v2.2：青枠+青影は中立化（0.5px罫線カード）。 */}
            <Link href={todoList[0].href} className="card-hover lift" style={{ display: 'flex', gap: 12, alignItems: 'center', background: '#fff', border: '0.5px solid var(--line)', borderRadius: 14, padding: '15px 16px', textDecoration: 'none', color: 'var(--txt)' }}>
              <span style={{ width: 40, height: 40, borderRadius: 11, flexShrink: 0, background: 'var(--bg2)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <span style={{ width: 9, height: 9, borderRadius: '50%', background: todoList[0].dot }} />
              </span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: '.84rem', fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{todoList[0].title}</div>
                <div style={{ fontSize: '.62rem', color: 'var(--muted2)', marginTop: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{todoList[0].sub}</div>
              </div>
              <span style={{ fontSize: '.66rem', fontWeight: 500, color: 'var(--c-blue)', flexShrink: 0 }}>進む ›</span>
            </Link>
            {todoList.length > 1 && (
              <Link href={todoList[1].href} style={{ display: 'block', textAlign: 'center', fontSize: '.64rem', color: 'var(--muted2)', textDecoration: 'none', padding: '11px 0 2px', fontWeight: 500 }}>ほか {todoList.length - 1} 件</Link>
            )}
          </>
        )}
      </div>

      {/* 進行中の委託（純化: 委託費＋契約状態のみ・PMなし） */}
      <div style={{ padding: '22px 20px 8px' }}>
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
          <h2 className="ty-h2">進行中の委託</h2>
          <Link href="/vendor/cases" style={{ fontSize: '.66rem', color: 'var(--c-blue)', fontWeight: 500, textDecoration: 'none' }}>すべて →</Link>
        </div>
      </div>
      <div style={{ padding: '0 20px' }}>
        {active.length === 0 ? (
          <EmptyState
            compact
            title="進行中の委託はまだありません"
            hint="案件を受けると、ここに表示されます"
            icon={<span style={{ display: 'inline-flex', width: 40, height: 40, borderRadius: 12, background: 'var(--blue-bg2)', alignItems: 'center', justifyContent: 'center' }}><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="var(--c-blue)" strokeWidth="1.6"><path d="M4 6h16M4 12h16M4 18h10" /></svg></span>}
            style={{ background: '#fff', border: '0.5px solid var(--line)', borderRadius: 14 }}
          />
        ) : active.slice(0, 4).map(a => {
          const st = VENDOR_OFFER_ST[a.status ?? ''] ?? { label: '—', c: 'var(--muted2)' }
          return (
            <Link key={a.id} href={`/vendor/cases/${a.id}`} className="card-hover lift ui-card" style={{ display: 'block', textDecoration: 'none', color: 'var(--txt)', background: '#fff', border: '0.5px solid var(--line)', borderRadius: 14, padding: '13px 15px', marginBottom: 10 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                {(() => { const svc = a.deal?.services; return svc
                  ? <ServiceAvatar logoPath={svc.logo_path} icon={svc.icon} color={svc.color} name={svc.name} size={40} />
                  : <ServiceAvatar logoPath={null} icon="" color="#9A9CA8" name="案件" size={40} /> })()}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <b style={{ fontSize: '.82rem', fontWeight: 500, display: 'block', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{(a.deal && customerHonorific(a.deal)) || '案件'}</b>
                  <span style={{ fontSize: '.58rem', color: 'var(--muted2)' }}>{a.deal?.services?.name ?? 'サービス'}</span>
                </div>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, flexShrink: 0 }}>
                  <span style={{ width: 6, height: 6, borderRadius: '50%', background: st.c, display: 'inline-block' }} />
                  <span style={{ fontSize: '.6rem', color: 'var(--muted2)' }}>{st.label}</span>
                </span>
              </div>
              <div style={{ marginTop: 10, paddingTop: 10, borderTop: '0.5px solid var(--line)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{ fontSize: '.6rem', color: 'var(--muted2)' }}>委託費</span>
                <span className="tnum" style={{ fontFamily: 'Inter', fontSize: '.86rem', fontWeight: 500 }}>¥{a.base_fee.toLocaleString()}</span>
              </div>
            </Link>
          )
        })}
      </div>

      {/* ★「最近の動き」の長いリストはホームから撤去（通知タブで見る）。 */}
      {/* BR-DIAG2：版数スタンプ（本番 vendor が新ビルドを描画しているかの決定的証拠）。 */}
      <div style={{ textAlign: 'center', fontSize: '.5rem', color: 'var(--muted)', padding: '14px 0 6px', fontFamily: 'Inter' }}>build {BUILD_STAMP}</div>
    </div>
  )
}
