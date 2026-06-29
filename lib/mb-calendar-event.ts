/**
 * Batch M / 段階B: MB中心アカウントで商談予定を作成し Google Meet を生成する共通ヘルパー。
 * - 段階A までは mb_calendar(id=1) 単一。段階B で「指定アカウント(mb_calendars)」での作成に対応。
 * - 解決順は呼び元が resolveCalendarAccountId(menu→service→null) で決め、accountId として渡す。
 *   accountId=null（未割当）→ 従来どおり mb_calendar(id=1=kthk.kmbr) で作成（byte互換）。
 *   accountId 指定 → そのアカウントのトークンで calendars/primary に作成＝そのアカウントが organizer＝Meetホスト。
 * - best-effort：未連携／失敗時は { eventId:null, meetingUrl:null, skipped|error }（throw しない）。
 * node ランタイム専用（google-token が node crypto を使用）。
 */
import { getMbCalendar } from '@/lib/mb-calendar'
import { decryptTokens, encryptTokens, type StoredTokens } from '@/lib/google-token'
import { getValidAccessToken, createCalendarEvent } from '@/lib/google-calendar'

type AdminClient = { from: (t: string) => any }

export type CentralEventResult = {
  eventId: string | null
  meetingUrl: string | null
  skipped?: string
  error?: string
  account?: string   // 'default' | mb_calendars.id（どのアカウントで作成したかの実測用・additive）
}

type TokenSource = {
  tokens: { access_token: string; refresh_token: string; expires_at: Date }
  writeback: (refreshed: { access_token: string; expires_at: Date }) => Promise<void>
  label: string
}

/**
 * 商談をどのカレンダーアカウントに入れるか解決する。
 * 解決順：menus.calendar_account_id → services.calendar_account_id → null(=既定 mb_calendar id=1)。
 * best-effort：列未作成/参照切れ等は null（＝従来どおり id=1）にフォールバック。
 */
export async function resolveCalendarAccountId(
  admin: AdminClient,
  opts: { menuRef?: string | null; serviceId?: string | null }
): Promise<string | null> {
  try {
    if (opts.menuRef) {
      const { data } = await admin.from('menus').select('calendar_account_id').eq('id', opts.menuRef).single()
      if (data?.calendar_account_id) return data.calendar_account_id as string
    }
    if (opts.serviceId) {
      const { data } = await admin.from('services').select('calendar_account_id').eq('id', opts.serviceId).single()
      if (data?.calendar_account_id) return data.calendar_account_id as string
    }
  } catch { /* best-effort：解決不能なら既定へ */ }
  return null
}

/** mb_calendars 指定行のトークン源。使えない（無効/未連携/復号失敗）なら null。 */
async function accountTokenSource(admin: AdminClient, accountId: string): Promise<TokenSource | null> {
  try {
    const { data } = await admin.from('mb_calendars').select('oauth_tokens, active').eq('id', accountId).single()
    if (!data || !data.active || !data.oauth_tokens) return null
    const tokens = decryptTokens(data.oauth_tokens as StoredTokens)
    return {
      tokens,
      writeback: async (refreshed) => {
        const updated = encryptTokens({ access_token: refreshed.access_token, refresh_token: tokens.refresh_token, expires_at: refreshed.expires_at })
        await admin.from('mb_calendars').update({ oauth_tokens: updated, updated_at: new Date().toISOString() }).eq('id', accountId)
      },
      label: accountId,
    }
  } catch { return null }
}

/** 既定 mb_calendar(id=1) のトークン源（従来動作・byte互換）。未連携なら null。 */
async function defaultTokenSource(admin: AdminClient): Promise<TokenSource | null> {
  const mb = await getMbCalendar(admin)
  if (!mb || !mb.active || !mb.oauth_tokens) return null
  const tokens = decryptTokens(mb.oauth_tokens as StoredTokens)
  return {
    tokens,
    writeback: async (refreshed) => {
      const updated = encryptTokens({ access_token: refreshed.access_token, refresh_token: tokens.refresh_token, expires_at: refreshed.expires_at })
      await admin.from('mb_calendar').update({ oauth_tokens: updated }).eq('id', 1)
    },
    label: 'default',
  }
}

export async function createCentralMeetEvent(
  admin: AdminClient,
  params: {
    summary: string
    description?: string
    startAt: Date
    endAt: Date
    partnerEmail?: string | null
    partnerName?: string | null
    clientEmail?: string | null
    clientName?: string | null
  },
  accountId?: string | null
): Promise<CentralEventResult> {
  // 指定アカウント → 使えなければ既定へフォールバック（非破壊）。
  let source: TokenSource | null = null
  if (accountId) source = await accountTokenSource(admin, accountId)
  if (!source) source = await defaultTokenSource(admin)
  if (!source) return { eventId: null, meetingUrl: null, skipped: 'mb_calendar 未連携' }

  try {
    const accessToken = await getValidAccessToken(source.tokens, source.writeback)
    const r = await createCalendarEvent(accessToken, {
      summary: params.summary,
      description: params.description ?? '',
      startAt: params.startAt,
      endAt: params.endAt,
      partnerEmail: params.partnerEmail ?? '',
      partnerName: params.partnerName ?? '',
      clientEmail: params.clientEmail ?? '',
      clientName: params.clientName ?? '',
    })
    return { eventId: r.id, meetingUrl: r.meetingUrl, account: source.label }
  } catch (e) {
    return { eventId: null, meetingUrl: null, error: e instanceof Error ? e.message : 'event failed' }
  }
}
