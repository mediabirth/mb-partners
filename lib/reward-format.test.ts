import { rewardRangeLabel, effortBadge, menuEffortKinds, brandHasTsunaguOnly, CONNECT_ONLY_LABEL } from './reward-format'

let pass = 0, fail = 0
function eq(actual: unknown, expected: unknown, name: string) {
  const a = JSON.stringify(actual), e = JSON.stringify(expected)
  if (a === e) { pass++ } else { fail++; console.log(`✗ ${name}: got ${a} expected ${e}`) }
}
const fx = (v: number) => ({ reward_type: 'fixed' as const, reward_value: v })
const rt = (v: number) => ({ reward_type: 'rate' as const, reward_value: v })
const ct = (v: number) => ({ reward_type: 'continuous' as const, reward_value: v })

// rewardRangeLabel
eq(rewardRangeLabel([{ rewards: [fx(30000)] }]), '¥30,000', 'fixed単独')
eq(rewardRangeLabel([{ rewards: [fx(30000)] }, { rewards: [fx(100000)] }]), '¥30,000〜¥100,000', 'fixed範囲')
eq(rewardRangeLabel([{ rewards: [fx(30000)] }, { rewards: [rt(10)] }]), '¥30,000〜', 'fixed+可変')
eq(rewardRangeLabel([{ rewards: [rt(10)] }]), '粗利の10%〜', 'rate単独')
eq(rewardRangeLabel([{ rewards: [rt(10)] }, { rewards: [rt(20)] }]), '粗利の10%〜20%', 'rate範囲')
eq(rewardRangeLabel([{ rewards: [ct(10)] }]), '継続 粗利10%/月', 'continuous単独')
eq(rewardRangeLabel([{ rewards: [] }]), null, '0件→null')
eq(rewardRangeLabel([]), null, 'menu0件→null')

// effortBadge
eq(effortBadge([]), null, 'badge 0件→null')
eq(effortBadge(['auto']), CONNECT_ONLY_LABEL, 'badge auto単独→つなぐだけ')
eq(effortBadge(['auto', 'auto']), CONNECT_ONLY_LABEL, 'badge auto-only→つなぐだけ')
eq(effortBadge(['auto', 'manual']), 'タスク 2', 'badge manual混在→タスク2')
eq(effortBadge(['auto', 'auto', 'manual', 'manual']), 'タスク 4', 'badge 4件manual混在→タスク4')
eq(effortBadge(['manual']), 'タスク 1', 'badge manual単独→タスク1')

// menuEffortKinds（reward_type別）
eq(menuEffortKinds('fixed', ['auto', 'auto', 'manual', 'manual']), ['auto', 'auto'], 'fixed→autoのみ')
eq(menuEffortKinds('rate', ['auto', 'auto', 'manual', 'manual']), ['auto', 'auto', 'manual', 'manual'], 'rate→全kind')
eq(menuEffortKinds('continuous', ['auto', 'manual']), ['auto', 'manual'], 'continuous→全kind')

// 統合：メニュー→バッジ
const svcKinds = ['auto', 'auto', 'manual', 'manual']
eq(effortBadge(menuEffortKinds('fixed', svcKinds)), CONNECT_ONLY_LABEL, '統合 fixed→つなぐだけ')
eq(effortBadge(menuEffortKinds('rate', svcKinds)), 'タスク 4', '統合 rate→タスク4')
eq(effortBadge(menuEffortKinds('rate', ['auto'])), CONNECT_ONLY_LABEL, '統合 rate+auto-only→つなぐだけ')

// brandHasTsunaguOnly
eq(brandHasTsunaguOnly([{ rewards: [fx(30000)], effort_task_kinds: svcKinds }]), true, 'ブランド fixed含む→true')
eq(brandHasTsunaguOnly([{ rewards: [rt(10)], effort_task_kinds: svcKinds }]), false, 'ブランド rateのみmanual→false')
eq(brandHasTsunaguOnly([{ rewards: [rt(10)], effort_task_kinds: ['auto'] }]), true, 'ブランド auto-onlyサービス→true')

console.log(`\n単体テスト: ${pass} passed, ${fail} failed`)
if (fail > 0) process.exit(1)
