import { DEAL_STATUS_KEYS, statusTranslation, transitionForecast, forecastLine, projectLaneTranslation, OPS_NEXT_ACTION } from './status-effects'
import { DEAL_STATUS } from './status'
import { VENDOR_DEAL_ST } from './vendor-status'

let pass = 0, fail = 0
function eq(actual: unknown, expected: unknown, name: string) {
  const a = JSON.stringify(actual), e = JSON.stringify(expected)
  if (a === e) { pass++ } else { fail++; console.log(`✗ ${name}: got ${a} expected ${e}`) }
}
function ok(cond: boolean, name: string) { if (cond) pass++; else { fail++; console.log(`✗ ${name}`) } }

// 写像がハードコードでないこと＝正典と完全一致（正典を変えればここも変わる）
for (const k of DEAL_STATUS_KEYS) {
  const t = statusTranslation(k)
  eq(t.ops, DEAL_STATUS[k].label, `${k}: ops=正典DEAL_STATUS`)
  eq(t.partner, DEAL_STATUS[k].label, `${k}: partner=APP実表示（DEAL_STATUS導出）`)
  eq(t.vendor, VENDOR_DEAL_ST[k].label, `${k}: vendor=正典VENDOR_DEAL_ST`)
}
eq(projectLaneTranslation(), { partner: DEAL_STATUS.confirmed.label, vendor: VENDOR_DEAL_ST.confirmed.label }, 'projectレーン=confirmedの翻訳')

// 遷移予告（実体 route.ts の副作用と対）
{
  const f = transitionForecast('received', 'in_progress')
  ok(f.ripple, 'received→in_progress: 波及あり')
  eq(f.mails.map(m => m.key), ['deal-status-update'], 'received→in_progress: 状況更新メール')
  ok(f.vendorChange?.to === '実行中', 'received→in_progress: デリバリー表示 実行中へ')
}
{
  const f = transitionForecast('in_progress', 'confirmed')
  ok(f.ripple, '→confirmed: 波及あり')
  eq(f.mails.map(m => m.key), ['deal-won-partner', 'deal-won-customer'], '→confirmed: 成約メール2種')
  ok(!!f.extra && f.extra.includes('報酬が確定'), '→confirmed: 報酬確定の予告')
  ok(f.vendorChange === null, 'in_progress→confirmed: デリバリー表示は実行中のまま（変化なし）')
}
{
  const f = transitionForecast('in_progress', 'received')
  eq(f.mails, [], '戻し received: メールなし')
  ok(f.ripple, '戻し received: 表示変化ありのため波及あり')
}
{
  const f = transitionForecast('in_progress', 'lost')
  eq(f.mails.map(m => m.key), ['deal-lost-partner'], '→lost: 不成立メール')
  eq(f.opsNotify, false, '→lost: 運営通知なし（静粛）')
}
{
  const f = transitionForecast('confirmed', 'paid')
  eq(f.mails, [], '→paid: メールなし')
  ok(f.ripple, '→paid: パートナー/デリバリー表示が変わるため波及あり')
  ok(f.partnerChange?.to === '支払済' && f.vendorChange?.to === '完了', '→paid: 支払済/完了へ')
}
{
  // 同一ステータス間（レーン内移動など）は波及なし
  const f = transitionForecast('confirmed', 'confirmed')
  ok(!f.partnerChange && !f.vendorChange && f.mails.length === 0, 'confirmed→confirmed: 変化なし')
}

// forecastLine が空にならない（全遷移で予告文が生成される）
for (const from of DEAL_STATUS_KEYS) for (const to of DEAL_STATUS_KEYS) {
  ok(forecastLine(from, to).length > 0, `forecastLine ${from}→${to}`)
}

// OPS_NEXT_ACTION の網羅（5ステータス全てに定義がある: nullも明示）
for (const k of DEAL_STATUS_KEYS) ok(k in OPS_NEXT_ACTION, `OPS_NEXT_ACTION[${k}] 定義済み`)

console.log(`\n単体テスト: ${pass} passed, ${fail} failed`)
if (fail > 0) process.exit(1)
