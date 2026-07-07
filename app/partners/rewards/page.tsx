import type { Metadata } from 'next'
import { SubShell } from '../shell'

export const metadata: Metadata = {
  title: '報酬について | MB Partners',
  description: '固定・成果連動・継続の3タイプ。MB Partners の報酬の仕組みと、お支払いのタイミングをご説明します。',
}

const ILLUS: Record<string, React.ReactNode> = {
  fixed: <svg viewBox="0 0 88 88" fill="none"><ellipse cx="44" cy="55" rx="22" ry="6" fill="currentColor" opacity=".12" /><g className="ri-coin"><circle cx="44" cy="40" r="21" fill="currentColor" opacity=".16" /><circle cx="44" cy="40" r="21" stroke="currentColor" strokeWidth="3" /><path d="M44 31v18M37 37l7 5 7-5M38 43h12" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" /></g></svg>,
  perf: <svg viewBox="0 0 88 88" fill="none"><rect className="ri-bar rb1" x="20" y="50" width="12" height="18" rx="3" fill="currentColor" opacity=".3" /><rect className="ri-bar rb2" x="38" y="40" width="12" height="28" rx="3" fill="currentColor" opacity=".52" /><rect className="ri-bar rb3" x="56" y="28" width="12" height="40" rx="3" fill="currentColor" /><path d="M22 40l16-10 12 6 18-16" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" /><path d="M62 20h8v8" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" /></svg>,
  recur: <svg viewBox="0 0 88 88" fill="none"><circle cx="44" cy="44" r="20" fill="currentColor" opacity=".14" /><g className="ri-cyc"><path d="M60 38a18 18 0 1 0 1.5 11" stroke="currentColor" strokeWidth="3.2" strokeLinecap="round" /><path d="M61 26v13H48" stroke="currentColor" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round" /></g><circle cx="44" cy="44" r="4.5" fill="currentColor" /></svg>,
}

const TYPES = [
  { key: 'fixed', c: '#5646e6', t: '固定報酬', d: 'メニューごとに定められた金額を、成約時にお支払いします。例：¥30,000（金額はメニューにより異なります）。' },
  { key: 'perf', c: '#15917e', t: '成果連動報酬', d: '成約の粗利など、成果に応じてお支払いします。大きな案件ほど、報酬も大きくなります。' },
  { key: 'recur', c: '#f2971b', t: '継続報酬', d: '継続的なご契約に対して、毎月つづく報酬をお支払いします。ストック型で積み上がります。' },
]

export default function RewardsPage() {
  return (
    <SubShell kicker="reward" title="報酬について。" lead="報酬は、固定・成果連動・継続の3タイプ。ご紹介の内容やメニューに応じて組み合わせます。">
      <div className="sp-rwd">
        {TYPES.map(x => (
          <div key={x.key} className="sp-card sp-rwd-item" style={{ ['--rc' as string]: x.c }}>
            <span className={`sp-rwd-badge rwd-${x.key}`} aria-hidden>{ILLUS[x.key]}</span>
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
