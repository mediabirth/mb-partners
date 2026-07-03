import { rewardReachPrefix, statusNarrative } from './deal-status-narrative'

let pass = 0, fail = 0
function eq(actual: unknown, expected: unknown, name: string) {
  const a = JSON.stringify(actual), e = JSON.stringify(expected)
  if (a === e) pass++; else { fail++; console.log(`✗ ${name}: got ${a} expected ${e}`) }
}

// ⑥ 報酬到達文言プレフィックス（4状態網羅）
eq(rewardReachPrefix('received'),    '成約すると',        'received→成約すると')
eq(rewardReachPrefix('in_progress'), '成約すると',        'in_progress→成約すると')
eq(rewardReachPrefix('confirmed'),   '報酬が確定しました', 'confirmed→確定')
eq(rewardReachPrefix('paid'),        'お支払い済み',      'paid→支払済')
eq(rewardReachPrefix('lost'),        null,               'lost→null')

// ⑦ いまの状況ナラティブ（4状態網羅）
eq(statusNarrative('received').title,    'MBがお客さまへの最初のご連絡を準備しています', 'received title')
eq(statusNarrative('received').sub,      'ご連絡がつき次第、状況がここに更新されます。',   'received sub')
eq(statusNarrative('in_progress').title, 'MBがお客さまと商談を進めています',            'in_progress title')
eq(statusNarrative('confirmed').title,   '成約となりました。お支払い手続きを進めています', 'confirmed title')
eq(statusNarrative('confirmed').sub,     '',                                        'confirmed sub空')
eq(statusNarrative('paid').title,        'お支払いが完了しました。ご紹介ありがとうございました', 'paid title')
eq(statusNarrative('lost'),              null,                                      'lost→null')

console.log(`\ndeal-status-narrative 単体テスト: ${pass} passed, ${fail} failed`)
if (fail > 0) process.exit(1)
