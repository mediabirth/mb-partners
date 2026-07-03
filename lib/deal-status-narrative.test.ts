import { statusNarrative } from './deal-status-narrative'

let pass = 0, fail = 0
function eq(actual: unknown, expected: unknown, name: string) {
  const a = JSON.stringify(actual), e = JSON.stringify(expected)
  if (a === e) { pass++ } else { fail++; console.log(`✗ ${name}: got ${a} expected ${e}`) }
}

// 決定②: 報酬到達文言(rewardReachPrefix)は全種削除（ヘッダの報酬ピルに一本化）済み。

// statusNarrative
eq(statusNarrative('received')?.title,    'MBがお客さまへの最初のご連絡を準備しています', 'received narrative')
eq(statusNarrative('in_progress')?.title, 'MBがお客さまと商談を進めています',            'in_progress narrative')
eq(!!statusNarrative('confirmed'), true,  'confirmed narrative あり')
eq(!!statusNarrative('paid'),      true,  'paid narrative あり')
eq(statusNarrative('lost'),        null,  'lost→null')
eq(statusNarrative('unknown'),     null,  'unknown→null')

console.log(`\n単体テスト: ${pass} passed, ${fail} failed`)
if (fail > 0) process.exit(1)
