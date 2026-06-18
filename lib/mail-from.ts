/**
 * メール差出人の単一ソース（全 Resend 送信箇所が参照）。
 * 表示名「MB Partners」付き。アドレスは verified domain の noreply@mb-partners.app のまま。
 * 既存の SPF/DKIM/DMARC には影響なし（ドメイン同一・表示名のみ）。
 */
export const MAIL_FROM = 'MB Partners <noreply@mb-partners.app>'
