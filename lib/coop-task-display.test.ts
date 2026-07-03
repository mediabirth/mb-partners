import { resolveMenuCoopTasks } from './coop-task-display'

let pass = 0, fail = 0
function eq(actual: unknown, expected: unknown, name: string) {
  const a = JSON.stringify(actual), e = JSON.stringify(expected)
  if (a === e) pass++; else { fail++; console.log(`✗ ${name}: got ${a} expected ${e}`) }
}
const T = (label: string) => ({ label, description: null })
const full = [T('つなぐ'), T('アポイント'), T('ヒヤリング'), T('アシスト/フォロー')]

// rate/continuous → 全件・ヒヤリング最下部
eq(resolveMenuCoopTasks(full, 'rate').map(t => t.label), ['つなぐ', 'アポイント', 'アシスト/フォロー', 'ヒヤリング'], 'rate→全件ヒヤリング最下部')
eq(resolveMenuCoopTasks(full, 'continuous').map(t => t.label), ['つなぐ', 'アポイント', 'アシスト/フォロー', 'ヒヤリング'], 'continuous→全件')
// fixed → 先頭1件
eq(resolveMenuCoopTasks(full, 'fixed').map(t => t.label), ['つなぐ'], 'fixed→先頭1件')
// dedupe
eq(resolveMenuCoopTasks([T('つなぐ'), T('つなぐ'), T('アポイント')], 'rate').map(t => t.label), ['つなぐ', 'アポイント'], 'dedupe')
// 0件
eq(resolveMenuCoopTasks([], 'rate'), [], '0件→空')
eq(resolveMenuCoopTasks(null, 'rate'), [], 'null→空')
// ★一覧↔登録 同一性：同じ入力・同じ rewardType なら常に同じ集合
const listSet = resolveMenuCoopTasks(full, 'rate').map(t => t.label)
const formSet = resolveMenuCoopTasks(full, 'rate').map(t => t.label)
eq(listSet, formSet, '一覧=登録 同一集合')

console.log(`\ncoop-task 単体テスト: ${pass} passed, ${fail} failed`)
if (fail > 0) process.exit(1)
