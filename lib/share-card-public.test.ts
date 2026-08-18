import assert from 'node:assert/strict'
import test from 'node:test'
import { makeShareMessage, makeShareUrl, safePublicDescription, validUuid } from './share-card-public'

const MENU_ID = '123e4567-e89b-42d3-a456-426614174000'

test('share URL keeps menu and src=card in the displayed/copied URL', () => {
  const url = makeShareUrl('abcDEF_123', MENU_ID)
  assert.equal(url, `https://mb-partners.app/r/abcDEF_123?m=${MENU_ID}&src=card`)
  assert.equal(makeShareUrl('abcDEF_123'), 'https://mb-partners.app/r/abcDEF_123?src=card')
})

test('share copy is deterministic and contains the exact share URL once', () => {
  const url = makeShareUrl('token', MENU_ID)
  const message = makeShareMessage({
    serviceName: 'ブランドA',
    menuName: '事業相談',
    publicDescription: 'これからの進め方を一緒に整理します。',
    url,
  })
  assert.equal(message, `「事業相談」について、よろしければご覧ください。\nこれからの進め方を一緒に整理します。\n${url}`)
  assert.equal(message.split(url).length - 1, 1)
})

test('public copy blocks money vocabulary and numerical rates', () => {
  for (const unsafe of ['報酬があります', '手数料の説明', '30,000円です', '成果の10％です', '¥500']) {
    const output = safePublicDescription(unsafe, '事業相談')
    assert.equal(output, '事業相談についてのご相談を承ります')
    assert.doesNotMatch(output, /報酬|手数料|委託費|受注額|支払額|粗利|[¥￥$€£]|\d[\d,.]*\s*(?:円|%|％)/u)
  }
})

test('description uses at most 90 full-width characters', () => {
  const output = safePublicDescription('あ'.repeat(100), '相談')
  assert.equal(Array.from(output).length, 90)
  assert.ok(output.endsWith('…'))
})

test('menu id accepts UUID only', () => {
  assert.equal(validUuid(MENU_ID), true)
  assert.equal(validUuid('not-a-uuid'), false)
})
