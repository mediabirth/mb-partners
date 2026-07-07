import type { Metadata } from 'next'
import { SubShell } from '../shell'

export const metadata: Metadata = {
  title: 'はじめてガイド | MB Partners',
  description: '登録から初めてのご紹介、報酬のお支払いまで。MB Partners のはじめかたを、5ステップでご案内します。',
}

const STEPS = [
  { n: '01', t: '登録（無料）', d: 'パートナー募集ページのフォームからご応募ください。ご入力は1〜2分で完了します。' },
  { n: '02', t: '審査・ご連絡', d: 'いただいた内容を確認のうえ、担当より折り返しご連絡します。ご不明点もこの段階でお気軽に。' },
  { n: '03', t: 'はじめてのご紹介', d: '不動産・人材・制作・DXなど、お困りごとをお持ちの方を、アプリからおつなぎいただくだけです。' },
  { n: '04', t: '当社が対応', d: '商談も実務も、すべて株式会社Media Birthが担当します。あなたの手間はかかりません。' },
  { n: '05', t: '報酬のお支払い', d: '成約時に報酬をお支払いします。進捗や報酬の状況は、アプリでいつでもご確認いただけます。' },
]

export default function GuidePage() {
  return (
    <SubShell kicker="guide" title="はじめてガイド。" lead="ご登録から、初めてのご紹介、報酬のお支払いまで。迷わず進める5ステップです。">
      <div className="sp-timeline">
        {STEPS.map(s => (
          <div key={s.n} className="sp-tl sp-card">
            <span className="sp-tl-num">{s.n}</span>
            <div className="sp-tl-body">
              <h2 className="sp-tl-t">{s.t}</h2>
              <p className="sp-tl-d">{s.d}</p>
            </div>
          </div>
        ))}
      </div>
    </SubShell>
  )
}
