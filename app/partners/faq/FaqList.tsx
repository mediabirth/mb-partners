'use client'
import { useState } from 'react'

const FAQ = [
  { q: 'どんな方に向いていますか？', a: '人とのつながりが多い方に向いています。士業・経営者・営業職など、ご紹介の機会が多い方におすすめです。' },
  { q: '費用はかかりますか？', a: '登録は無料です。審査のうえ、ご案内します。' },
  { q: '何を紹介すればいいですか？', a: '不動産・人材・制作・DXなど、お困りごとをお持ちの方をおつなぎいただくだけです。' },
  { q: '手間はかかりますか？', a: 'ご紹介いただくだけ。商談も実務も、すべて当社が対応します。' },
  { q: '報酬はどう決まりますか？', a: '固定・成果連動・継続の3タイプがあります。内容はメニューにより異なります。' },
  { q: '報酬はいつ受け取れますか？', a: '成約月の翌月末にお支払いします。継続報酬は、ご契約が続くかぎり毎月お支払いします。' },
  { q: '紹介した後の進捗はわかりますか？', a: 'アプリで、進捗や報酬の状況をいつでもご確認いただけます。' },
  { q: 'ノルマはありますか？', a: 'ノルマはありません。ご紹介いただけるときに、無理なくご参加ください。' },
  { q: '審査の基準は？', a: 'サービスの品質を保つため、内容を確認のうえご案内しています。詳しくはご登録後、担当よりご説明します。' },
  { q: '個人情報はどう扱われますか？', a: 'いただいた情報は、ご案内のためだけに使用します。詳しくはプライバシーポリシーをご確認ください。' },
]

export default function FaqList() {
  const [open, setOpen] = useState<number | null>(0)
  return (
    <div className="sp-faq">
      {FAQ.map((f, i) => (
        <div key={i} className={`sp-faq-item${open === i ? ' open' : ''}`}>
          <button className="sp-faq-q" onClick={() => setOpen(open === i ? null : i)} aria-expanded={open === i}>
            <span>{f.q}</span><span className="sp-faq-chev" aria-hidden />
          </button>
          <div className="sp-faq-a"><p>{f.a}</p></div>
        </div>
      ))}
    </div>
  )
}
