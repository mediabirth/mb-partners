import type { Metadata } from 'next'
import { SubShell } from '../shell'

export const metadata: Metadata = {
  title: '報酬について | MB Partners',
  description: '固定・成果連動・継続の3タイプ。MB Partners の報酬の仕組みと、お支払いのタイミングをご説明します。',
}

const TYPES = [
  { badge: '固定', c: '#5646e6', t: '固定報酬', d: 'メニューごとに定められた金額を、成約時にお支払いします。例：¥30,000（金額はメニューにより異なります）。' },
  { badge: '成果', c: '#15917e', t: '成果連動報酬', d: '成約の粗利など、成果に応じてお支払いします。大きな案件ほど、報酬も大きくなります。' },
  { badge: '継続', c: '#f2971b', t: '継続報酬', d: '継続的なご契約に対して、毎月つづく報酬をお支払いします。ストック型で積み上がります。' },
]

export default function RewardsPage() {
  return (
    <SubShell kicker="fee type" title="報酬について。" lead="報酬は、固定・成果連動・継続の3タイプ。ご紹介の内容やメニューに応じて組み合わせます。">
      <div className="sp-rwd">
        {TYPES.map(x => (
          <div key={x.t} className="sp-card sp-rwd-item" style={{ ['--rc' as string]: x.c }}>
            <span className="sp-rwd-badge">{x.badge}</span>
            <div>
              <h2 className="sp-rwd-t"><b>{x.t}</b></h2>
              <p className="sp-rwd-d">{x.d}</p>
            </div>
          </div>
        ))}
      </div>

      <h2 className="sp-h2">お支払いのタイミング</h2>
      <div className="sp-card">
        <p className="sp-rwd-d"><strong>成約月の翌月末</strong>にお支払いします。進捗・報酬の状況は、アプリでいつでもご確認いただけます。</p>
      </div>

      <p className="sp-note">※本ページの金額（例：¥30,000 等）は一例です。実際の報酬はメニュー・成約内容により異なり、収入を保証するものではありません。</p>
    </SubShell>
  )
}
