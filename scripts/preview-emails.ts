/**
 * 通知メールのドライラン・プレビュー生成（磨きプログラム①・レジストリ準拠）。
 * 実送信は一切しない。lib/mail-registry.ts の全テンプレ既定文面をサンプル変数で描画し、
 * docs/reports/email_previews/*.html へ書き出す（件名・text版はコメントで埋め込み）。
 * 実行: npx tsx scripts/preview-emails.ts
 */
import { mkdirSync, writeFileSync } from 'fs'
import { resolve } from 'path'
import { MAIL_REGISTRY, fillVars, sampleVars } from '../lib/mail-registry'
import { bodyToBrandedHtml } from '../lib/mail-send'

const outDir = resolve(__dirname, '../docs/reports/email_previews')
mkdirSync(outDir, { recursive: true })

const index: string[] = []
for (const def of MAIL_REGISTRY) {
  const vars = sampleVars(def)
  const subject = fillVars(def.defaultSubject, vars)
  const text = fillVars(def.defaultBody, vars)
  const buttons = (def.buttons ?? []).map(b => ({ label: b.label, url: String(vars[b.urlVar] ?? 'https://mb-partners.app') }))
  const html = bodyToBrandedHtml(text, buttons)
  const doc = `<!doctype html><meta charset="utf-8"><title>${subject}</title>
<!-- key: ${def.key} / audience: ${def.audience} / event: ${def.event} -->
<!-- subject: ${subject} -->
<body style="margin:0;padding:24px;background:#EDEDF1">${html}</body>`
  writeFileSync(resolve(outDir, `${def.key}.html`), doc)
  index.push(`<li><a href="./${def.key}.html">${def.key}</a> — ${def.name}｜${subject}</li>`)
  console.log(`✓ ${def.key} — ${subject}`)
}
writeFileSync(resolve(outDir, 'index.html'), `<!doctype html><meta charset="utf-8"><title>メールテンプレ プレビュー</title><h1 style="font-family:sans-serif;font-size:16px">通知メール プレビュー（レジストリ既定文面・ドライラン生成・実送信なし）</h1><ul style="font-family:sans-serif;line-height:2">${index.join('')}</ul>`)
console.log(`\n${MAIL_REGISTRY.length}件のプレビューを ${outDir} に生成（実送信なし）`)
