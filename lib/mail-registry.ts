/**
 * メールテンプレ・レジストリ（磨きプログラム①・単一ソース）。
 * 「どのイベントで・誰に・どのテンプレが・どんな変数で」飛ぶかの全体像をここで定義する。
 * - key = message_templates.category（DB上書きの照合キー）
 * - defaultSubject / defaultBody はコード側フォールバック（配信不能時も必ず送れる）
 * - 変数構文は既存の resolveTemplate と同じ ${key}（未定義キーは置換されず残る）
 * - 運営(ops)宛の内部通知はテンプレ管理対象外（送信履歴 mail_log には記録される）
 * クライアント（コンソール管理画面）からも import される純データ。副作用なし。
 */

export type MailAudience = 'partner' | 'customer' | 'vendor' | 'invitee'

export type MailVar = { key: string; label: string; sample: string }

export type MailTemplateDef = {
  key: string            // message_templates.category
  name: string           // 管理画面での表示名
  audience: MailAudience
  event: string          // 発火イベント（マトリクスの行）
  trigger: string        // いつ送られるかの説明
  vars: MailVar[]
  defaultSubject: string // ${var} 可
  defaultBody: string    // ${var} 可（text版。HTMLは brandedEmailHtml で生成）
  buttons?: { label: string; urlVar: string }[]  // URLは送信時に動的注入（編集対象外）
}

const V = {
  name: (label = 'パートナー名') => ({ key: 'name', label, sample: '山田 太郎' }),
  customer: { key: 'customer', label: 'お客さま名（敬称付き）', sample: '田中商事 様' },
  service: { key: 'service', label: 'サービス（ブランド ─ メニュー）', sample: 'MOOM ─ お部屋探し' },
  link: { key: 'link', label: '案件ページURL', sample: 'https://mb-partners.app/app/cases/xxxx' },
  when: { key: 'when', label: '日時', sample: '2026年7月10日 14:00' },
  meetingUrl: { key: 'meetingUrl', label: 'オンライン会議URL', sample: 'https://meet.google.com/xxx-xxxx-xxx' },
  url: { key: 'url', label: '登録リンク', sample: 'https://mb-partners.app/invite/xxxx' },
  expires: { key: 'expires', label: '有効期限', sample: '2026年7月11日 12:00' },
  month: { key: 'month', label: '対象月', sample: '2026年6月' },
  amount: { key: 'amount', label: '金額（税抜・自動算出）', sample: '¥50,000' },
}

export const MAIL_REGISTRY: MailTemplateDef[] = [
  // ── 紹介・相談 ─────────────────────────────────────────────
  {
    key: 'receipt', name: '受付確認（パートナー）', audience: 'partner',
    event: '紹介受付', trigger: '紹介・商談予約を受け付けたとき',
    vars: [V.name(), { key: 'kind', label: '種別', sample: 'ご紹介' }, V.customer, V.service, { key: 'meeting', label: '商談日時（あれば）', sample: '' }, V.link],
    defaultSubject: '【MB Partners】${kind}を受け付けました',
    defaultBody: '${name} 様\n\n${kind}を受け付けました。\n\n・お客さま：${customer}\n・メニュー：${service}\n\nこのあとはMBがお客さまへご連絡します。進捗は案件ページでご確認いただけます。\n▼ 案件ページ\n${link}\n※ 本プログラムは成功報酬制です。報酬は成約時のみ発生します（税抜表示・消費税はインボイス登録の有無に応じて支払時に別途）。',
  },
  {
    key: 'customer-receipt', name: '受付確認（お客さま）', audience: 'customer',
    event: '紹介受付', trigger: 'お客さまの連絡先が入力された紹介を受け付けたとき',
    vars: [V.customer, { key: 'partner', label: '紹介者名', sample: '山田 太郎' }, V.service],
    defaultSubject: '【MB Partners】ご相談を受け付けました',
    defaultBody: '${customer}\n\nご相談を受け付けました。担当者より順次ご連絡いたします。\n\n・ご相談内容：${service}\n\n通常1〜2営業日以内に、担当者よりメールまたはお電話でご連絡いたします。\nお心当たりのない場合は、お手数ですが本メールへの返信にてお知らせください。',
  },
  // ── 商談 ───────────────────────────────────────────────────
  {
    key: 'booking', name: '予約確認（お客さま）', audience: 'customer',
    event: '商談予約', trigger: '商談の予約が確定したとき',
    vars: [V.name('お客さま名'), V.when, V.meetingUrl],
    defaultSubject: '【MB Partners】ご予約を承りました',
    defaultBody: '${name} 様\n\nご予約を承りました。\n\n・日時：${when}\n・参加方法：${meetingUrl}\n\n当日はどうぞよろしくお願いいたします。',
  },
  {
    key: 'booking-partner', name: '予約通知（パートナー）', audience: 'partner',
    event: '商談予約', trigger: '担当案件に商談予約が入ったとき',
    vars: [V.name(), V.customer, V.when, V.meetingUrl],
    defaultSubject: '【MB Partners】商談予約が入りました',
    defaultBody: '${name} 様\n\n商談予約が入りました。\n\n・お客さま：${customer}\n・日時：${when}\n・URL：${meetingUrl}',
  },
  {
    key: 'reminder-partner', name: '商談リマインド（パートナー）', audience: 'partner',
    event: '商談リマインド', trigger: '商談の前日18時と開始1時間前',
    vars: [V.name(), V.customer, V.when, { key: 'stage', label: 'タイミング', sample: '明日' }, V.meetingUrl],
    defaultSubject: '【MB Partners】${stage}の商談のご案内',
    defaultBody: '${name} 様\n\n${customer}との商談が${stage}に迫っています。\n\n・日時：${when}\n・URL：${meetingUrl}',
  },
  {
    key: 'reminder-customer', name: '商談リマインド（お客さま）', audience: 'customer',
    event: '商談リマインド', trigger: '商談の前日18時と開始1時間前',
    vars: [V.customer, V.when, { key: 'stage', label: 'タイミング', sample: '明日' }, V.meetingUrl],
    defaultSubject: '【MB Partners】ご商談${stage}のご案内',
    defaultBody: '${customer}\n\nご商談が${stage}に迫っています。\n\n・日時：${when}\n・参加方法：${meetingUrl}\n\n当日はどうぞよろしくお願いいたします。',
  },
  // ── 案件の進捗 ─────────────────────────────────────────────
  {
    key: 'deal-status-update', name: '状況更新（パートナー）', audience: 'partner',
    event: '状況更新', trigger: '案件が「対応中」になったとき',
    vars: [V.name(), V.customer, V.link],
    defaultSubject: '【MB Partners】ご紹介案件の対応を開始しました',
    defaultBody: '${name} 様\n\n${customer}の案件について、MBがお客さまとのやり取りを開始しました。\n\n進捗は案件ページでいつでもご確認いただけます。\n▼ 案件ページ\n${link}',
    buttons: [{ label: '案件ページを見る', urlVar: 'link' }],
  },
  {
    key: 'deal-won-partner', name: '成約通知（パートナー）', audience: 'partner',
    event: '成約', trigger: '案件が成約になったとき',
    vars: [V.name(), V.customer],
    defaultSubject: '【MB Partners】ご紹介が成約しました',
    defaultBody: '${name} 様\n\n${customer}のご紹介が成約に至りました。ありがとうございます。\n\n報酬の内訳（税抜）は実績画面でご確認いただけます。月末締め・翌月末払いです。',
    buttons: [{ label: '実績・報酬を見る', urlVar: 'link' }],
  },
  {
    key: 'deal-won-customer', name: '成約の御礼（お客さま）', audience: 'customer',
    event: '成約', trigger: '案件が成約になったとき（連絡先がある場合）',
    vars: [V.customer, V.service],
    defaultSubject: '【MB Partners】ご契約ありがとうございます',
    defaultBody: '${customer}\n\nこのたびはご契約いただき、誠にありがとうございます。\n\n・ご契約内容：${service}\n\n今後の進行は担当者よりご案内いたします。ご不明な点はいつでもご連絡ください。',
  },
  {
    key: 'deal-lost-partner', name: '不成立のご連絡（パートナー）', audience: 'partner',
    event: '不成立', trigger: '案件が不成立になったとき',
    vars: [V.name()],
    defaultSubject: '【MB Partners】案件の進捗について',
    defaultBody: '${name} 様\n\n今回は成約に至りませんでした。ご紹介ありがとうございました。\n\n引き続き、別の機会でのご紹介をお待ちしております。\n（本プログラムは成功報酬制です。報酬は成約時のみ発生します。紹介の有効期間は90日です。）',
  },
  // ── 報酬・口座 ─────────────────────────────────────────────
  {
    key: 'payout-confirmed', name: '報酬確定（パートナー）', audience: 'partner',
    event: '支払確定', trigger: '月末締めで報酬が確定したとき',
    vars: [V.name(), V.month, V.amount],
    defaultSubject: '【MB Partners】今月の報酬が確定しました',
    defaultBody: '${name} 様\n\n${month} 分の報酬が確定しました。\n\n・お振込金額：${amount}\n\n翌月末にご登録の口座へお振り込みします。明細は報酬タブからご確認いただけます。',
  },
  {
    key: 'bank-change', name: '振込口座の変更通知（パートナー）', audience: 'partner',
    event: '口座変更', trigger: '本人が振込口座を変更したとき',
    vars: [V.name(), { key: 'bank', label: '銀行・支店', sample: 'みずほ銀行 渋谷支店' }, { key: 'account', label: '口座（下4桁）', sample: '普通 ***4567' }, { key: 'holder', label: '名義', sample: 'ヤマダ タロウ' }],
    defaultSubject: '【MB Partners】振込口座の変更を受け付けました',
    defaultBody: '${name} 様\n\n振込口座の変更を受け付けました。\n\n・銀行：${bank}\n・口座：${account}\n・名義：${holder}\n\n心当たりのない変更の場合は、すぐに support@mb-partners.app までご連絡ください。',
  },
  // ── 仲間・チーム ───────────────────────────────────────────
  {
    key: 'frontier-joined', name: '配下パートナー参加（フロンティア）', audience: 'partner',
    event: '招待受諾', trigger: '招待したパートナーの登録が完了したとき',
    vars: [V.name('フロンティア名'), { key: 'partner', label: '新パートナー名', sample: '佐藤 花子' }],
    defaultSubject: '【MB Partners】ご招待のパートナーが参加しました',
    defaultBody: '${name} 様\n\nご招待いただいた ${partner} 様の登録が完了し、あなたのチームに加わりました。\n\nチームの状況はフロンティア ダッシュボードでご確認いただけます。',
    buttons: [{ label: 'ダッシュボードを見る', urlVar: 'link' }],
  },
  {
    key: 'recognition-mail', name: '紹介の仲間が参加（パートナー）', audience: 'partner',
    event: '仲間の参加', trigger: '紹介した方の登録が有効化されたとき',
    vars: [V.name(), { key: 'partner', label: '新パートナー名', sample: '佐藤 花子' }],
    defaultSubject: '【MB Partners】ご紹介の仲間が参加しました',
    defaultBody: '${name} 様\n\nご紹介いただいた ${partner} 様が MB Partners に参加しました。ありがとうございます。\n\nあなたの輪が、確かなご縁につながっています。',
  },
  // ── 招待 ───────────────────────────────────────────────────
  {
    key: 'invite-partner', name: '招待（パートナー）', audience: 'invitee',
    event: '招待発行', trigger: 'コンソールからパートナーを招待したとき',
    vars: [V.name(), V.url, V.expires],
    defaultSubject: '【MB Partners】アカウント登録のご案内',
    defaultBody: '${name} 様\n\nMB Partners パートナーアカウントの登録のご案内です。下記のリンクからパスワードを設定し、登録を完了してください。\n\n${url}\n\n有効期限：${expires}',
    buttons: [{ label: 'パスワードを設定する', urlVar: 'url' }],
  },
  {
    key: 'invite-frontier', name: '招待（フロンティア経由）', audience: 'invitee',
    event: '招待発行', trigger: 'フロンティア招待・フロンティアからの招待のとき',
    vars: [V.name(), V.url, V.expires],
    defaultSubject: '【MB Partners】パートナー招待のご案内',
    defaultBody: '${name} 様\n\nMB Partners のパートナーとしてご招待します。下記のリンクからパスワードを設定し、登録を完了してください。\n\n${url}\n\n有効期限：${expires}',
    buttons: [{ label: 'パスワードを設定する', urlVar: 'url' }],
  },
  {
    key: 'invite-member', name: '招待（運営メンバー）', audience: 'invitee',
    event: '招待発行', trigger: '運営メンバーを招待したとき',
    vars: [V.name('担当者名'), V.url, V.expires],
    defaultSubject: '【MB Partners】運営メンバー招待のご案内',
    defaultBody: '${name} 様\n\nMB Partners の運営メンバーとしてご招待します。下記のリンクからパスワードを設定し、登録を完了してください。\n\n${url}\n\n有効期限：${expires}',
    buttons: [{ label: 'パスワードを設定する', urlVar: 'url' }],
  },
  {
    key: 'invite-vendor', name: '招待（業務委託先）', audience: 'invitee',
    event: '招待発行', trigger: '業務委託先（デリバリー）を招待したとき',
    vars: [V.name('ご担当者名'), V.url, V.expires],
    defaultSubject: '【MB Partners】お取引のご案内',
    defaultBody: '${name} 様\n\nMB Partners の業務委託先（デリバリー）としてご登録のご案内です。下記のリンクからパスワードを設定し、登録を完了してください。\n\n${url}\n\n有効期限：${expires}',
    buttons: [{ label: 'パスワードを設定する', urlVar: 'url' }],
  },
  // ── 業務委託 ───────────────────────────────────────────────
  {
    key: 'delivery-payout', name: '委託費確定（業務委託先）', audience: 'vendor',
    event: '委託費確定', trigger: '月次の委託費が確定したとき',
    vars: [V.name('委託先名'), V.month, V.amount],
    defaultSubject: '【MB Partners】${month}の委託費が確定しました',
    defaultBody: '${name} 様\n\n${month}分の委託費が確定しました。\n\n・金額：${amount}\n\n明細はポータルの「委託費」からご確認いただけます。',
    buttons: [{ label: '委託費を確認する', urlVar: 'link' }],
  },
]

export const MAIL_REGISTRY_BY_KEY: Record<string, MailTemplateDef> =
  Object.fromEntries(MAIL_REGISTRY.map(d => [d.key, d]))

/** ${key} 差し込み（resolveTemplate と同一仕様: 未定義キーは残す） */
export function fillVars(text: string, vars: Record<string, string | number | null | undefined>): string {
  return text.replace(/\$\{(\w+)\}/g, (m, k) => {
    const v = vars[k]
    return v === undefined || v === null ? m : String(v)
  })
}

/** プレビュー用サンプル変数（実データ風） */
export function sampleVars(def: MailTemplateDef): Record<string, string> {
  return Object.fromEntries(def.vars.map(v => [v.key, v.sample]))
}

/** イベント×宛先マトリクス（管理画面の全体像ビュー用） */
export function mailMatrix(): { event: string; partner: string[]; customer: string[]; vendor: string[]; invitee: string[] }[] {
  const events = [...new Set(MAIL_REGISTRY.map(d => d.event))]
  return events.map(event => ({
    event,
    partner: MAIL_REGISTRY.filter(d => d.event === event && d.audience === 'partner').map(d => d.key),
    customer: MAIL_REGISTRY.filter(d => d.event === event && d.audience === 'customer').map(d => d.key),
    vendor: MAIL_REGISTRY.filter(d => d.event === event && d.audience === 'vendor').map(d => d.key),
    invitee: MAIL_REGISTRY.filter(d => d.event === event && d.audience === 'invitee').map(d => d.key),
  }))
}
