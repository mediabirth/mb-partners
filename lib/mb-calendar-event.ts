/**
 * Batch M: MB中心アカウント(mb_calendar)で商談予定を作成し Google Meet を生成する共通ヘルパー。
 * - 個々のパートナーのGoogle連携に依存せず、MB運営の1アカウントで全商談の予定を作成。
 * - attendees にパートナー＋顧客（メールがあれば）を設定、sendUpdates=all で Google が招待を送る。
 * - best-effort：未連携／失敗時は { eventId:null, meetingUrl:null, skipped|error } を返す（throw しない）。
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
  }
): Promise<CentralEventResult> {
  const mb = await getMbCalendar(admin)
  if (!mb || !mb.active || !mb.oauth_tokens) {
    return { eventId: null, meetingUrl: null, skipped: 'mb_calendar 未連携' }
  }
  try {
    const tokens = decryptTokens(mb.oauth_tokens as StoredTokens)
    const accessToken = await getValidAccessToken(tokens, async (refreshed) => {
      const updated = encryptTokens({
        access_token: refreshed.access_token,
        refresh_token: tokens.refresh_token,
        expires_at: refreshed.expires_at,
      })
      await admin.from('mb_calendar').update({ oauth_tokens: updated }).eq('id', 1)
    })
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
    return { eventId: r.id, meetingUrl: r.meetingUrl }
  } catch (e) {
    return { eventId: null, meetingUrl: null, error: e instanceof Error ? e.message : 'event failed' }
  }
}
