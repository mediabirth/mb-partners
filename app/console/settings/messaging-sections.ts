import type { Template } from '../messages/MessagesClient'

// Phase3-D②：純データ（'use client' を付けない＝サーバー/クライアント両方から import 可能）。
// ★UI専用の定数。CRUD/resolve/送信ロジックには触れない。

export const EXAMPLE: Record<string, string> = {
  name: '勝田 勝彦', customer: '田中商事', month: '2026年6月', amount: '¥50,000',
  thanks: 'これまでのご紹介、ありがとうございます。', kind: 'ご紹介の登録',
  service: 'Webサイト制作', meeting: '2026年6月25日 14:00', when: '2026年6月25日 14:00',
  meetingUrl: 'https://meet.google.com/xxx-xxxx-xxx',
}
export const VARDESC: Record<string, string> = {
  name: 'パートナー/宛先のお名前', customer: 'お客さま（紹介先）の名前', month: '対象月', amount: '手取り金額（自動・編集不可）',
  thanks: '過去成約があれば感謝の一言（自動）', kind: '受付の種別', service: 'サービス名', meeting: '商談日時', when: '予約日時', meetingUrl: 'オンライン会議URL',
}
export function fillExample(body: string): string { return body.replace(/\$\{(\w+)\}/g, (whole, k: string) => EXAMPLE[k] ?? whole) }

export type Section = { key: string; label: string; desc: string; channel: Template['channel']; vars: string[]; defaultText: string; sample: string }
export const SECTIONS: Section[] = [
  { key: 'greeting', label: 'あいさつ（友だち追加時）', desc: 'LINEで友だち追加された直後に自動返信します。', channel: 'line', vars: [],
    defaultText: '（未設定。設定しない場合は LINE公式アカウント Manager 側のあいさつメッセージに委ねます）',
    sample: '友だち追加ありがとうございます！MB Partners です。ご紹介のご相談はこのトークからお気軽にどうぞ。' },
  { key: 'deal-won', label: '成約（勝ち通知）', desc: '担当紹介が成約した時に、パートナー本人へ通知します。', channel: 'line', vars: ['customer'],
    defaultText: '${customer} のご紹介が成約に至りました。報酬の詳細は実績画面でご確認いただけます。',
    sample: '🎉 ${customer} のご紹介が成約しました！あなたの一歩が実を結びました。報酬は実績画面でご確認いただけます。' },
  { key: 'recognition', label: '賞賛（仲間が増えた）', desc: '紹介した相手が参加した時に、紹介元のパートナーへ。', channel: 'line', vars: ['name'],
    defaultText: 'あなたの紹介に、心から感謝します。信頼の輪が、あなたから確かに広がっています。これからもどうぞよろしくお願いします。— MB Partners',
    sample: '${name}さんが仲間入りしました。あなたの紹介が、新しいつながりを生んでいます。心から感謝します。— MB Partners' },
  { key: 'nudge', label: '再活性化ナッジ', desc: '休眠中のパートナーへ手動で送るお声がけの本文。', channel: 'line', vars: ['name', 'thanks'],
    defaultText: '${name}さん、お久しぶりです。最近、MB Partnersでご紹介できそうな方はいませんか？\n${thanks}',
    sample: '${name}さん、お久しぶりです！最近お変わりないですか？ご紹介できそうな方がいれば、いつでもご連絡ください。${thanks}' },
  { key: 'receipt', label: '受付確認メール', desc: '紹介/協力/商談予約の受付完了時にパートナー本人へ送るメール本文。', channel: 'email', vars: ['name', 'kind', 'customer', 'service', 'meeting'],
    defaultText: '${name} 様\n\n${kind}を受け付けました。内容は以下のとおりです。\n・お客さま：${customer}\n（この後の流れ：MB確認 → 商談・提案 → 成約で報酬）',
    sample: '${name} 様\n\nこの度はご紹介ありがとうございます。${customer} 様の${kind}を受け付けました。担当より順次ご連絡します。引き続きよろしくお願いいたします。' },
  { key: 'booking', label: '予約完了メール（顧客）', desc: 'お客さまへ送る予約完了メールの本文。', channel: 'email', vars: ['name', 'when', 'meetingUrl'],
    defaultText: '${name} 様\n\nご予約を承りました。当日はどうぞよろしくお願いいたします。\n▼ 日時\n${when}',
    sample: '${name} 様\n\nご予約ありがとうございます。下記日時で承りました。当日お会いできるのを楽しみにしております。\n▼ 日時\n${when}\n▼ 会議URL\n${meetingUrl}' },
  { key: 'payout-confirmed', label: '報酬確定メール', desc: '月末締めの確定時にパートナー本人へ。金額は自動算出で固定です。', channel: 'email', vars: ['name', 'month', 'amount'],
    defaultText: '${name} 様\n${month} 分の報酬が確定しました。\n・手取り：${amount}\n明細はアプリの「報酬」からご確認いただけます。',
    sample: '${name} 様\n\nお疲れさまです。${month} 分の報酬が確定しました。\n・手取り：${amount}\nいつもご紹介ありがとうございます。明細はアプリの「報酬」からどうぞ。' },
]
export const SECTION_KEYS = new Set(SECTIONS.map(s => s.key))
