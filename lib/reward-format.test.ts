import { rewardRangeLabel } from './reward-format'

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
eq(rewardRangeLabel([{ rewards: [rt(10)] }]), '粗利(税抜)の10%〜', 'rate単独')
eq(rewardRangeLabel([{ rewards: [rt(10)] }, { rewards: [rt(20)] }]), '粗利(税抜)の10%〜20%', 'rate範囲')
eq(rewardRangeLabel([{ rewards: [ct(10)] }]), '継続 粗利(税抜)10%/月', 'continuous単独')
eq(rewardRangeLabel([{ rewards: [] }]), null, '0件→null')
eq(rewardRangeLabel([]), null, 'menu0件→null')

console.log(`\n単体テスト: ${pass} passed, ${fail} failed`)
if (fail > 0) process.exit(1)
