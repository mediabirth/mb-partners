/**
 * 商談予定＋Google Meet 作成の共通ヘルパー（段階3a：member-centric 振り分け）。
 * - 解決順は呼び元が resolveCalendarMemberId(menu→service→null) で決め、memberId として渡す。
 *   memberId 指定＆連携済み → その担当メンバーのトークンで calendars/primary に作成
 *     ＝そのメンバーが organizer＝Meetホスト。refresh は member_calendar_links の該当行へ書き戻し。
 *   未割当(memberId=null) / 担当が未連携 → 既定 owner(member_calendar_links) → さらに無ければ
 *     mb_calendar(id=1) にフォールバック（＝従来 kthk.kmbr と同一トークン・段階1で移送済＝byte互換・非破壊）。
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
  account?: string   // 'member:<uid>' | 'owner' | 'default'（どの経路で作成したかの実測用・additive）
}

type TokenSource = {
  tokens: { access_token: string; refresh_token: string; expires_at: Date }
  writeback: (refreshed: { access_token: string; expires_at: Date }) => Promise<void>
  label: string
}

/**
 * 商談をどの担当メンバーのカレンダーに入れるか解決する。
 * 解決順：menus.calendar_member_id → services.calendar_member_id → null(=既定 owner)。
 * best-effort：列未作成/参照切れ等は null（＝既定 owner）にフォールバック。
 */
export async function resolveCalendarMemberId(
  admin: AdminClient,
  opts: { menuRef?: string | null; serviceId?: string | null }
): Promise<string | null> {
  try {
    if (opts.menuRef) {
      const { data } = await admin.from('menus').select('calendar_member_id').eq('id', opts.menuRef).single()
      if (data?.calendar_member_id) return data.calendar_member_id as string
    }
    if (opts.serviceId) {
      const { data } = await admin.from('services').select('calendar_member_id').eq('id', opts.serviceId).single()
      if (data?.calendar_member_id) return data.calendar_member_id as string
    }
  } catch { /* best-effort：解決不能なら既定 owner へ */ }
  return null
}

/** member_calendar_links の指定ユーザー行のトークン源。未連携/無効/復号失敗なら null。 */
async function memberTokenSource(admin: AdminClient, userId: string): Promise<TokenSource | null> {
  try {
    const { data } = await admin.from('member_calendar_links').select('oauth_tokens, active').eq('user_id', userId).single()
    if (!data || !data.active || !data.oauth_tokens) return null
    const tokens = decryptTokens(data.oauth_tokens as StoredTokens)
    return {
      tokens,
      writeback: async (refreshed) => {
        const updated = encryptTokens({ access_token: refreshed.access_token, refresh_token: tokens.refresh_token, expires_at: refreshed.expires_at })
        await admin.from('member_calendar_links').update({ oauth_tokens: updated, updated_at: new Date().toISOString() }).eq('user_id', userId)
      },
      label: `member:${userId}`,
    }
  } catch { return null }
}

/** 既定 owner（member_calendar_links の owner 行）のトークン源。未連携なら null。 */
async function ownerTokenSource(admin: AdminClient): Promise<TokenSource | null> {
  try {
    const { data: owner } = await admin.from('profiles').select('id').eq('role', 'owner').limit(1).single()
    if (!owner?.id) return null
    const src = await memberTokenSource(admin, owner.id as string)
    return src ? { ...src, label: 'owner' } : null
  } catch { return null }
}

/** 最終フォールバック＝mb_calendar(id=1)（従来動作・byte互換）。未連携なら null。 */
async function legacyDefaultSource(admin: AdminClient): Promise<TokenSource | null> {
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
  memberId?: string | null
): Promise<CentralEventResult> {
  // 担当メンバー → 既定owner → mb_calendar(id=1)。いずれも安全側フォールバック（非破壊）。
  let source: TokenSource | null = null
  if (memberId) source = await memberTokenSource(admin, memberId)
  if (!source) source = await ownerTokenSource(admin)
  if (!source) source = await legacyDefaultSource(admin)
  if (!source) return { eventId: null, meetingUrl: null, skipped: 'カレンダー未連携' }

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
