import type { Metadata } from 'next'
import {
  PUBLIC_REWARD_DISCLAIMER,
  PUBLIC_REWARD_PAYMENT,
  PUBLIC_REWARD_TYPES,
} from '@/lib/public-partner-content'
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

export default function RewardsPage() {
  return (
    <SubShell kicker="reward" title="報酬について。" lead="報酬は、固定・成果連動・継続の3タイプ。ご紹介の内容やメニューに応じて組み合わせます。">
      <div className="sp-rwd">
        {PUBLIC_REWARD_TYPES.map(x => (
          <div key={x.key} className="sp-card sp-rwd-item" style={{ ['--rc' as string]: x.color }}>
            <span className={`sp-rwd-badge rwd-${x.key}`} aria-hidden>{ILLUS[x.key]}</span>
            <div>
              <h2 className="sp-rwd-t"><b>{x.title}</b></h2>
              <p className="sp-rwd-d">{x.description}<br /><strong>{x.example}</strong></p>
            </div>
          </div>
        ))}
      </div>

      <h2 className="sp-h2">お支払いのタイミング</h2>
      <div className="sp-card">
        <p className="sp-rwd-d"><strong>{PUBLIC_REWARD_PAYMENT}</strong> 進捗・報酬の状況は、アプリでいつでもご確認いただけます。</p>
      </div>

      <p className="sp-note">{PUBLIC_REWARD_DISCLAIMER}</p>
    </SubShell>
  )
}
