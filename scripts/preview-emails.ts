/**
 * 通知メールのドライラン・プレビュー生成（整合性プログラムD）。
 * 実送信は一切しない。lib/mail-templates.ts の全テンプレをサンプルデータで描画し、
 * docs/reports/email_previews/*.html へ書き出す（件名・text版はコメントで埋め込み）。
 * 実行: npx tsx scripts/preview-emails.ts
 */
import { mkdirSync, writeFileSync } from 'fs'
import { resolve } from 'path'
import {
  customerReceiptEmail, dealStatusUpdateEmail, dealWonPartnerEmail,
  dealWonCustomerEmail, frontierJoinedEmail, recognitionEmail,
} from '../lib/mail-templates'
import { brandedEmailHtml } from '../lib/notify'

const outDir = resolve(__dirname, '../docs/reports/email_previews')
mkdirSync(outDir, { recursive: true })

const samples: [string, { subject: string; text: string; html: string }][] = [
  ['customer_receipt', customerReceiptEmail({ customerName: '株式会社サンプル 様', partnerName: '神原 勝彦', serviceLine: 'MOOM ─ お部屋探しサポート' })],
  ['deal_status_update', dealStatusUpdateEmail({ partnerName: '神原 勝彦', customerLabel: '株式会社サンプル 様', dealId: '00000000-0000-0000-0000-000000000000' })],
  ['deal_won_partner', dealWonPartnerEmail({ partnerName: '神原 勝彦', customerLabel: '株式会社サンプル 様' })],
  ['deal_won_customer', dealWonCustomerEmail({ customerName: '株式会社サンプル 様', serviceLine: 'MOOM ─ お部屋探しサポート' })],
  ['frontier_joined', frontierJoinedEmail({ frontierName: '神原 勝彦', newPartnerName: '山田 太郎' })],
  ['recognition', recognitionEmail({ partnerName: '神原 勝彦', newPartnerName: '山田 太郎' })],
  ['bank_change', {
    subject: '【MB Partners】振込口座の変更を受け付けました',
    text: '(app/api/mypage/bank/route.ts 参照)',
    html: brandedEmailHtml({
      lead: '神原 勝彦 様　振込口座の変更を受け付けました。',
      rows: [['銀行', 'みずほ銀行 渋谷支店'], ['口座', '普通 ***4567'], ['名義', 'カンバラ カツヒコ']],
      note: '心当たりのない変更の場合は、すぐにサポートまでご連絡ください。',
    }),
  }],
]

const index: string[] = []
for (const [name, m] of samples) {
  const doc = `<!doctype html><meta charset="utf-8"><title>${m.subject}</title>
<!-- subject: ${m.subject} -->
<!-- text:\n${m.text.replace(/--/g, '−−')}\n-->
<body style="margin:0;padding:24px;background:#EDEDF1">${m.html}</body>`
  writeFileSync(resolve(outDir, `${name}.html`), doc)
  index.push(`<li><a href="./${name}.html">${name}</a> — ${m.subject}</li>`)
  console.log(`✓ ${name} — ${m.subject}`)
}
writeFileSync(resolve(outDir, 'index.html'), `<!doctype html><meta charset="utf-8"><title>メールテンプレ プレビュー</title><h1 style="font-family:sans-serif;font-size:16px">通知メール プレビュー（ドライラン生成・実送信なし）</h1><ul style="font-family:sans-serif;line-height:2">${index.join('')}</ul>`)
console.log(`\n${samples.length}件のプレビューを ${outDir} に生成（実送信なし）`)
