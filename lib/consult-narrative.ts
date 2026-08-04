export type ConsultNarrative = { title: string; sub: string }

/** 相談案件の既存statusを、パートナーが理解できる3段の案内へ写像する。新状態は作らない。 */
export function consultNarrative(status: string): ConsultNarrative {
  if (status === 'received') return {
    title: 'MB Partnersが一緒に考えています',
    sub: 'いただいた内容を確認し、合う進め方を整理しています。',
  }
  if (status === 'in_progress') return {
    title: 'ご提案中',
    sub: 'お客さまに合うメニューをご提案しています。',
  }
  if (status === 'confirmed' || status === 'paid') return {
    title: 'メニューが決まりました',
    sub: '決まった内容で案件が進んでいます。',
  }
  return { title: '今回は見送りとなりました', sub: 'ご相談ありがとうございました。' }
}
