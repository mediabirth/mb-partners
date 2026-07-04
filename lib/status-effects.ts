/**
 * 操縦席プログラム: ステータス翻訳レイヤーと遷移の結果予告（単一ソース・純データ/純関数）。
 *
 * 「どのカラムがパートナー/デリバリーに何と表示され、動かすと何が起きるか」をここから導出する。
 * - 各面のラベルは正典（lib/status.ts DEAL_STATUS ＝ APPの実表示 ／ lib/vendor-status.ts）から導出＝ハードコード禁止
 * - メール副作用は lib/mail-registry.ts のキー参照（テンプレ名・宛先はレジストリから解決）
 * - ここは表示・予告のみ。ステータス遷移ロジック/お金/送信の実体（app/api/console/deals/[id]）には一切関与しない。
 *   実体側の副作用を変更したら本マップも更新する（単体テストが5ステータスの網羅を強制）。
 */
import { DEAL_STATUS, partnerFacingLabel } from '@/lib/status'
import { VENDOR_DEAL_ST } from '@/lib/vendor-status'
import { MAIL_REGISTRY_BY_KEY } from '@/lib/mail-registry'

export const DEAL_STATUS_KEYS = ['received', 'in_progress', 'confirmed', 'paid', 'lost'] as const
export type DealStatusKey = typeof DEAL_STATUS_KEYS[number]

/** 3面の翻訳（正典から導出）。 */
export function statusTranslation(status: string): { ops: string; partner: string; vendor: string } {
  return {
    ops: DEAL_STATUS[status]?.label ?? status,
    partner: partnerFacingLabel(status),
    vendor: VENDOR_DEAL_ST[status]?.label ?? '—',
  }
}

/** プロジェクトレーン（project_status）は社内管理語彙＝パートナー/デリバリー面には出ない。
 *  レーン中の案件は confirmed（成約後）なので、両面には confirmed の翻訳が出続ける。 */
export function projectLaneTranslation(): { partner: string; vendor: string } {
  return { partner: partnerFacingLabel('confirmed'), vendor: VENDOR_DEAL_ST.confirmed.label }
}

/** ステータスに「入る」ときの副作用（app/api/console/deals/[id]/route.ts の実装と対）。 */
type EntryEffect = {
  mailKeys: string[]        // 送信されるメール（mail-registry キー・条件付き含む）
  mailNote?: string         // 条件の注記
  opsNotify: boolean        // 運営Slack＋運営メール
  extra?: string            // その他（報酬確定・アプリ内通知等）
}
const ENTRY_EFFECTS: Record<DealStatusKey, EntryEffect> = {
  received:    { mailKeys: [], opsNotify: true },
  in_progress: { mailKeys: ['deal-status-update'], mailNote: '受付からの遷移時のみ', opsNotify: true },
  confirmed:   { mailKeys: ['deal-won-partner', 'deal-won-customer'], mailNote: 'お客さま宛は連絡先がある場合のみ', opsNotify: true, extra: '報酬が確定（明細合算・凍結）・パートナーへアプリ内通知' },
  paid:        { mailKeys: [], opsNotify: true },
  lost:        { mailKeys: ['deal-lost-partner'], opsNotify: false, extra: '運営通知なし（静粛クローズ）' },
}

export type TransitionForecast = {
  partnerChange: { from: string; to: string } | null
  vendorChange: { from: string; to: string } | null
  mails: { key: string; name: string; audience: string }[]
  mailNote?: string
  extra?: string
  opsNotify: boolean
  /** 波及あり＝確定前確認が必要（パートナー/デリバリー表示の変化 or メール送信を伴う） */
  ripple: boolean
}

const AUDIENCE_LABEL: Record<string, string> = { partner: 'パートナー', customer: 'お客さま', vendor: 'デリバリー', invitee: '招待先' }

/** 遷移 from→to の結果予告。ボードのドロップ確認・詳細CTAの予告文の共通ソース。 */
export function transitionForecast(from: string, to: string): TransitionForecast {
  const f = statusTranslation(from)
  const t = statusTranslation(to)
  const eff = ENTRY_EFFECTS[(to as DealStatusKey)] ?? { mailKeys: [], opsNotify: false }
  // 実体仕様: deal-status-update は received→in_progress の遷移時のみ／deal-won は confirmed への遷移時のみ
  const mailKeys = eff.mailKeys.filter(k => {
    if (k === 'deal-status-update') return from !== 'in_progress'
    if (k === 'deal-won-partner' || k === 'deal-won-customer') return from !== 'confirmed'
    return true
  })
  const mails = mailKeys.map(key => {
    const def = MAIL_REGISTRY_BY_KEY[key]
    return { key, name: def?.name ?? key, audience: AUDIENCE_LABEL[def?.audience ?? ''] ?? def?.audience ?? '' }
  })
  const partnerChange = f.partner !== t.partner ? { from: f.partner, to: t.partner } : null
  const vendorChange = f.vendor !== t.vendor ? { from: f.vendor, to: t.vendor } : null
  return {
    partnerChange, vendorChange, mails, mailNote: eff.mailNote, extra: eff.extra, opsNotify: eff.opsNotify,
    ripple: mails.length > 0 || !!partnerChange || !!vendorChange || !!eff.extra,
  }
}

/** 結果予告の1行文（CTA直下・確認ダイアログ共通の文言生成）。 */
export function forecastLine(from: string, to: string): string {
  const fc = transitionForecast(from, to)
  const parts: string[] = []
  if (fc.partnerChange) parts.push(`パートナーには「${fc.partnerChange.to}」と表示`)
  if (fc.vendorChange) parts.push(`デリバリーには「${fc.vendorChange.to}」と表示`)
  for (const m of fc.mails) parts.push(`${m.audience}へ「${m.name}」メールを送信${fc.mailNote ? `（${fc.mailNote}）` : ''}`)
  if (fc.extra) parts.push(fc.extra)
  if (parts.length === 0) parts.push('パートナー・デリバリーへの表示変化やメール送信はありません')
  return parts.join('・')
}

/** ステータスマトリクスⓘ用: そのステータスに入るとき送られ得るメール一覧＋運営通知。 */
export function statusEntryEffects(status: string): { mails: { key: string; name: string; audience: string }[]; mailNote?: string; opsNotify: boolean; extra?: string } {
  const eff = ENTRY_EFFECTS[(status as DealStatusKey)] ?? { mailKeys: [], opsNotify: false }
  return {
    mails: eff.mailKeys.map(key => {
      const def = MAIL_REGISTRY_BY_KEY[key]
      return { key, name: def?.name ?? key, audience: AUDIENCE_LABEL[def?.audience ?? ''] ?? def?.audience ?? '' }
    }),
    mailNote: eff.mailNote,
    opsNotify: eff.opsNotify,
    extra: eff.extra,
  }
}

/** コンソール案件詳細「次にやること」: ステータス→運営アクション定義（データ分離＝将来編集可能）。 */
export type OpsAction = {
  cta: string
  to: DealStatusKey
  /** 実行前に満たすべき条件の説明（ガードは実体側に既存: 明細0/base未入力） */
  precondition?: string
}
export const OPS_NEXT_ACTION: Record<DealStatusKey, OpsAction | null> = {
  received:    { cta: 'お客さまへ連絡済みにして商談中へ', to: 'in_progress' },
  in_progress: { cta: '成約にする', to: 'confirmed', precondition: '明細1件以上（率・継続・直営は成約時に受注額を入力）' },
  confirmed:   { cta: '支払済にする', to: 'paid', precondition: '通常は月次締め（cron）が実施' },
  paid:        null,
  lost:        null,  // 復活は既存の reopenDeal 導線（90日以内）
}
