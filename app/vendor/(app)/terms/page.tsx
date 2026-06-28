import Link from 'next/link'

export const runtime = 'edge'

const SECTIONS: { h: string; b: string }[] = [
  { h: '業務委託の関係', b: 'デリバリー（実行者）は、MB Partners からの委託に基づき、案件ごとに定めた成果物・業務を遂行します。雇用関係ではなく、独立した業務委託契約に基づきます。' },
  { h: '委託費の確定と支払', b: '委託費は案件ごとに事前提示され、納品・検収の完了をもって確定します。承認済みの経費を加えた金額を、MB が確定した時点で「委託費」に反映し、所定の振込日にお支払いします。' },
  { h: '成果物と権利', b: '納品物の取り扱い・著作権の帰属は、各案件で合意した条件に従います。再利用・公開の可否は事前にご確認ください。' },
  { h: '経費の精算', b: '案件に必要な経費は、領収書（任意）を添えて申請してください。MB の承認後、委託費とあわせてお支払いします。' },
  { h: '守秘義務', b: '案件を通じて知り得た顧客・MB の情報は、許可なく第三者に開示しないでください。' },
]
const FAQ: { q: string; a: string }[] = [
  { q: '委託費はいつ振り込まれますか？', a: 'MB が委託費を確定した月の締め後、所定の振込日にお支払いします。状況は「委託費」タブで確認できます。' },
  { q: '経費はどこから申請しますか？', a: '案件詳細の「お金」タブ →「経費を申請」から、種別・金額・領収書（任意）を添えて申請できます。' },
  { q: '日程はどう調整しますか？', a: '「予定」タブで MB から届いた候補日を選んで確定できます。確定後は予定として表示されます。' },
]

export default function VendorTerms() {
  return (
    <div className="page-anim">
      <div style={{ padding: '12px 20px 0' }}>
        <Link href="/vendor/settings" style={{ fontSize: '.7rem', color: 'var(--muted2)', textDecoration: 'none' }}>← 設定</Link>
      </div>
      <div style={{ padding: '10px 20px 6px' }}>
        <h1 style={{ fontSize: '1.06rem', fontWeight: 700, letterSpacing: '-.01em' }}>業務委託規約・ヘルプ</h1>
        <p style={{ fontSize: '.64rem', color: 'var(--muted2)', marginTop: 5, lineHeight: 1.6 }}>デリバリー（実行者）として案件を進めるうえでの基本ルールとよくある質問です。</p>
      </div>

      <div style={{ padding: '2px 24px 8px', fontSize: '.68rem', color: 'var(--muted)', fontWeight: 600 }}>規約</div>
      <div style={{ margin: '0 20px 16px', background: '#fff', border: '1px solid var(--line)', borderRadius: 14, overflow: 'hidden' }}>
        {SECTIONS.map((s, i) => (
          <div key={s.h} style={{ padding: '14px 16px', borderBottom: i < SECTIONS.length - 1 ? '1px solid #F2F2F6' : 'none' }}>
            <div style={{ fontSize: '.77rem', fontWeight: 700, marginBottom: 4 }}>{s.h}</div>
            <p style={{ fontSize: '.68rem', color: 'var(--muted2)', lineHeight: 1.7, margin: 0 }}>{s.b}</p>
          </div>
        ))}
      </div>

      <div style={{ padding: '2px 24px 8px', fontSize: '.68rem', color: 'var(--muted)', fontWeight: 600 }}>よくある質問</div>
      <div style={{ margin: '0 20px 16px', background: '#fff', border: '1px solid var(--line)', borderRadius: 14, overflow: 'hidden' }}>
        {FAQ.map((f, i) => (
          <div key={f.q} style={{ padding: '14px 16px', borderBottom: i < FAQ.length - 1 ? '1px solid #F2F2F6' : 'none' }}>
            <div style={{ fontSize: '.74rem', fontWeight: 700, marginBottom: 4 }}>Q. {f.q}</div>
            <p style={{ fontSize: '.68rem', color: 'var(--muted2)', lineHeight: 1.7, margin: 0 }}>{f.a}</p>
          </div>
        ))}
      </div>

      <div style={{ padding: '0 20px 28px' }}>
        <Link href="/vendor/support" className="ui-btn ui-btn--secondary ui-btn--lg" style={{ width: '100%', justifyContent: 'center', textDecoration: 'none' }}>解決しないときは お問い合わせ</Link>
      </div>
    </div>
  )
}
