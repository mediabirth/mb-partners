/**
 * 通知メール体系（整合性プログラムD）— イベント×宛先マトリクスの不足分テンプレ集。
 *
 * 設計原則（テンプレ0号 = lib/email.ts sendReceiptEmail の思想を踏襲）:
 *   - 件名は「【MB Partners】＋受動・完了トーン」（〜しました／〜のご案内）
 *   - 本文は宛名「◯◯ 様」→リード1文→明細行→補足→リンク、敬体で静かに
 *   - HTML は lib/notify.ts brandedEmailHtml（ロゴバー・#F6F6F8カード・署名「— MB Partners 運営事務局」）
 *   - 金額の表示はすべて税抜（決定①）。成約通知は金額を載せず実績画面へ誘導（既存deal-won方針を踏襲）
 *   - 送信は lib/notify.ts sendEmail / sendOpsEmail（RESEND_API_KEY 未設定環境では自動 no-op ＝ ローカル安全）
 *
 * ここは「文面の純関数」のみ。送信・発火制御は各イベントサイトが行う。
 * プレビューは scripts/preview-emails.mjs（ドライラン・実送信なし）。
 */
import { brandedEmailHtml } from '@/lib/notify'

export type MailContent = { subject: string; text: string; html: string }

const APP = 'https://mb-partners.app'

/** お客さま宛: 紹介受付の確認（従来はパートナー/運営のみで、お客さま本人への受付通知が無かった） */
export function customerReceiptEmail(p: { customerName: string; partnerName?: string | null; serviceLine?: string | null }): MailContent {
  const intro = p.partnerName ? `${p.partnerName} 様よりご紹介をいただき、` : ''
  const lead = `${intro}ご相談を受け付けました。担当者より順次ご連絡いたします。`
  return {
    subject: '【MB Partners】ご相談を受け付けました',
    text: [
      `${p.customerName} 様`,
      '',
      lead,
      ...(p.serviceLine ? ['', `・ご相談内容：${p.serviceLine}`] : []),
      '',
      '通常1〜2営業日以内に、担当者よりメールまたはお電話でご連絡いたします。',
      'お心当たりのない場合は、お手数ですが本メールへの返信にてお知らせください。',
    ].join('\n'),
    html: brandedEmailHtml({
      lead: `${p.customerName} 様　${lead}`,
      rows: p.serviceLine ? [['ご相談内容', p.serviceLine]] : undefined,
      note: '通常1〜2営業日以内に、担当者よりご連絡いたします。お心当たりのない場合は本メールへご返信ください。',
    }),
  }
}

/** パートナー宛: 状況更新（受付→対応中）。中間経過が「両端しか届かない」欠落への回答。 */
export function dealStatusUpdateEmail(p: { partnerName: string; customerLabel: string; dealId: string }): MailContent {
  const caseUrl = `${APP}/app/cases/${p.dealId}`
  return {
    subject: '【MB Partners】ご紹介案件の対応を開始しました',
    text: [
      `${p.partnerName} 様`,
      '',
      `${p.customerLabel}の案件について、MBがお客さまとのやり取りを開始しました。`,
      '',
      '進捗は案件ページでいつでもご確認いただけます。',
      `▼ 案件ページ`,
      caseUrl,
    ].join('\n'),
    html: brandedEmailHtml({
      lead: `${p.partnerName} 様　${p.customerLabel}の案件について、MBがお客さまとのやり取りを開始しました。`,
      note: '進捗は案件ページでいつでもご確認いただけます。',
      buttons: [{ label: '案件ページを見る', url: caseUrl }],
    }),
  }
}

/** パートナー宛: 成約（お金に直結する最重要イベントのメールが無かった）。金額は載せず実績画面へ（既存方針）。 */
export function dealWonPartnerEmail(p: { partnerName: string; customerLabel: string }): MailContent {
  const url = `${APP}/app/rewards`
  return {
    subject: '【MB Partners】ご紹介が成約しました',
    text: [
      `${p.partnerName} 様`,
      '',
      `${p.customerLabel}のご紹介が成約に至りました。ありがとうございます。`,
      '',
      '報酬の内訳（税抜）は実績画面でご確認いただけます。月末締め・翌月末払いです。',
      `▼ 実績・報酬`,
      url,
    ].join('\n'),
    html: brandedEmailHtml({
      lead: `${p.partnerName} 様　${p.customerLabel}のご紹介が成約に至りました。ありがとうございます。`,
      note: '報酬の内訳（税抜）は実績画面でご確認いただけます。月末締め・翌月末払いです。',
      buttons: [{ label: '実績・報酬を見る', url }],
    }),
  }
}

/** お客さま宛: 成約の御礼（今後の流れ）。 */
export function dealWonCustomerEmail(p: { customerName: string; serviceLine?: string | null }): MailContent {
  return {
    subject: '【MB Partners】ご契約ありがとうございます',
    text: [
      `${p.customerName} 様`,
      '',
      'このたびはご契約いただき、誠にありがとうございます。',
      ...(p.serviceLine ? ['', `・ご契約内容：${p.serviceLine}`] : []),
      '',
      '今後の進行は担当者よりご案内いたします。ご不明な点はいつでもご連絡ください。',
    ].join('\n'),
    html: brandedEmailHtml({
      lead: `${p.customerName} 様　このたびはご契約いただき、誠にありがとうございます。`,
      rows: p.serviceLine ? [['ご契約内容', p.serviceLine]] : undefined,
      note: '今後の進行は担当者よりご案内いたします。ご不明な点はいつでもご連絡ください。',
    }),
  }
}

/** フロンティア宛: 配下パートナーの参加（招待受諾）。 */
export function frontierJoinedEmail(p: { frontierName: string; newPartnerName: string }): MailContent {
  const url = `${APP}/app/frontier`
  return {
    subject: '【MB Partners】ご招待のパートナーが参加しました',
    text: [
      `${p.frontierName} 様`,
      '',
      `ご招待いただいた ${p.newPartnerName} 様の登録が完了し、あなたのチームに加わりました。`,
      '',
      'チームの状況はフロンティア ダッシュボードでご確認いただけます。',
      `▼ フロンティア ダッシュボード`,
      url,
    ].join('\n'),
    html: brandedEmailHtml({
      lead: `${p.frontierName} 様　ご招待いただいた ${p.newPartnerName} 様の登録が完了し、あなたのチームに加わりました。`,
      note: 'チームの状況はフロンティア ダッシュボードでご確認いただけます。',
      buttons: [{ label: 'ダッシュボードを見る', url }],
    }),
  }
}

/** パートナー宛: 紹介した仲間の参加（recognition。従来はアプリ内通知のみ）。 */
export function recognitionEmail(p: { partnerName: string; newPartnerName: string }): MailContent {
  return {
    subject: '【MB Partners】ご紹介の仲間が参加しました',
    text: [
      `${p.partnerName} 様`,
      '',
      `ご紹介いただいた ${p.newPartnerName} 様が MB Partners に参加しました。ありがとうございます。`,
      '',
      'あなたの輪が、確かなご縁につながっています。',
    ].join('\n'),
    html: brandedEmailHtml({
      lead: `${p.partnerName} 様　ご紹介いただいた ${p.newPartnerName} 様が MB Partners に参加しました。ありがとうございます。`,
      note: 'あなたの輪が、確かなご縁につながっています。',
    }),
  }
}
