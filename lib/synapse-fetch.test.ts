// 単体テスト（決定性担保）：extractAddress 5ケース＋extractAddressLinks 優先度＋safeUrl SSRF。
// 実行：node lib/synapse-fetch.test.ts （Node 25 type-stripping）。route.ts と同一の lib を直接検証。
import { extractAddress, extractAddressLinks, safeUrl } from './synapse-fetch.ts'

let pass = 0, fail = 0
function ok(name: string, cond: boolean, got?: unknown) {
  if (cond) { pass++; console.log(`  ✓ ${name}`) }
  else { fail++; console.log(`  ✗ ${name}  got=${JSON.stringify(got)}`) }
}

console.log('=== extractAddress ===')
// ① 〒＋都道府県
{
  const r = extractAddress('お問い合わせ 〒107-0061 東京都港区北青山1-2-3 青山ビル5F TEL 03-1234-5678')
  ok('① 〒+都道府県', r === '東京都港区北青山1-2-3 青山ビル5F', r)
}
// ② 都道府県起点（〒なし）
{
  const r = extractAddress('所在地 大阪府大阪市北区梅田2-2-2 グランフロント12F／営業時間 9-18')
  ok('② 都道府県起点', r === '大阪府大阪市北区梅田2-2-2 グランフロント12F', r)
}
// ③ 多拠点（先頭1件のみ・2件目の住所を含めない）
{
  const r = extractAddress('本社 〒107-0061 東京都港区北青山1-2-3　大阪支店 〒530-0001 大阪府大阪市北区梅田1-1')
  ok('③ 多拠点→先頭1件のみ', !!r && r.startsWith('東京都港区北青山1-2-3') && !r.includes('大阪府') && !r.includes('530'), r)
}
// ④ 住所なし→null
{
  const r = extractAddress('当社はITサービスとマーケティング支援を提供しています。実績多数。')
  ok('④ 住所なし→null', r === null, r)
}
// ⑤ フッター末尾に住所（連結後に拾える）
{
  const body = 'トップの説明文がここに長く続きます。'.repeat(20)
  const r = extractAddress(`${body}\n\n[フッター]\n会社情報 〒150-0001 東京都渋谷区神宮前1-1-1 渋谷ビル`)
  ok('⑤ フッター末尾の住所', r === '東京都渋谷区神宮前1-1-1 渋谷ビル', r)
}

console.log('=== extractAddressLinks 優先度（会社概要>その他） ===')
{
  const base = new URL('https://ex.co.jp/')
  const html = `
    <a href="/news/2026/">ニュース</a>
    <a href="/about/frway/">私たちの理念</a>
    <a href="/about/company/">会社概要</a>
    <a href="/recruit/">採用</a>`
  const links = extractAddressLinks(html, base).map(u => u.pathname)
  ok('高優先(会社概要)を先頭に', links[0] === '/about/company/', links)
  ok('最大2件', links.length <= 2, links)
}

console.log('=== safeUrl (SSRF) ===')
const allow = ['https://example.com', 'http://sub.example.co.jp/path']
const block = [
  'ftp://example.com', 'http://localhost', 'http://127.0.0.1', 'http://10.1.2.3',
  'http://192.168.0.1', 'http://172.20.0.1', 'http://169.254.169.254', 'http://[::1]',
  'http://foo.local', 'http://bar.internal', 'http://0.0.0.0', 'http://224.0.0.1', 'http://300.1.1.1',
]
let ssrfPass = 0
for (const u of allow) { const r = safeUrl(u) !== null; if (r) ssrfPass++; else console.log(`  ✗ allow ${u}`) }
for (const u of block) { const r = safeUrl(u) === null; if (r) ssrfPass++; else console.log(`  ✗ block ${u}`) }
const ssrfTotal = allow.length + block.length
ok(`SSRF ${ssrfPass}/${ssrfTotal}`, ssrfPass === ssrfTotal, `${ssrfPass}/${ssrfTotal}`)

console.log(`\n=== RESULT: ${pass} pass / ${fail} fail (SSRF ${ssrfPass}/${ssrfTotal}) ===`)
if (fail > 0) process.exit(1)
