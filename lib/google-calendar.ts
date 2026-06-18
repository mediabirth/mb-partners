/**
 * Google Calendar API ラッパー
 * - トークンリフレッシュ（access_token 期限切れ時の自動更新）
 * - FreeBusy クエリ（空き枠チェック）
 * - イベント作成
 */

const GCAL_BASE = 'https://www.googleapis.com/calendar/v3'
const TOKEN_URL = 'https://oauth2.googleapis.com/token'

export type GCalTokens = {
  access_token:  string
  refresh_token: string
  expires_at:    Date
}

// ── トークンリフレッシュ ──────────────────────────────────────────────────────

export async function refreshAccessToken(refresh_token: string): Promise<{
  access_token: string
  expires_at: Date
}> {
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type:    'refresh_token',
      refresh_token,
      client_id:     process.env.GOOGLE_CLIENT_ID!,
      client_secret: process.env.GOOGLE_CLIENT_SECRET!,
    }),
  })
  if (!res.ok) throw new Error(`Token refresh failed: ${await res.text()}`)
  const data = await res.json()
  return {
    access_token: data.access_token,
    expires_at:   new Date(Date.now() + data.expires_in * 1000),
  }
}

// ── アクセストークン取得（期限切れなら自動リフレッシュ） ────────────────────

export async function getValidAccessToken(
  tokens: GCalTokens,
  onRefresh?: (newTokens: { access_token: string; expires_at: Date }) => Promise<void>
): Promise<string> {
  // 60秒の余裕を持って期限チェック
  if (new Date(tokens.expires_at).getTime() - Date.now() > 60_000) {
    return tokens.access_token
  }
  const refreshed = await refreshAccessToken(tokens.refresh_token)
  await onRefresh?.(refreshed)
  return refreshed.access_token
}

// ── FreeBusy クエリ ──────────────────────────────────────────────────────────

export type BusyBlock = { start: string; end: string }

export async function getFreeBusy(
  access_token: string,
  calendarId: string,
  timeMin: Date,
  timeMax: Date
): Promise<BusyBlock[]> {
  const res = await fetch(`${GCAL_BASE}/freeBusy`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${access_token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      timeMin: timeMin.toISOString(),
      timeMax: timeMax.toISOString(),
      items: [{ id: calendarId }],
    }),
  })
  if (!res.ok) throw new Error(`FreeBusy failed: ${await res.text()}`)
  const data = await res.json()
  return data.calendars?.[calendarId]?.busy ?? []
}

// ── イベント作成 ──────────────────────────────────────────────────────────────

export type CreateEventParams = {
  summary:        string
  description?:   string
  startAt:        Date
  endAt:          Date
  partnerEmail:   string
  clientEmail:    string
  partnerName:    string
  clientName:     string
}

export async function createCalendarEvent(
  access_token: string,
  params: CreateEventParams
): Promise<{ id: string; meetingUrl: string | null }> {
  // 空メールの attendee は Google がエラーにするため除外
  const attendees = [
    params.partnerEmail ? { email: params.partnerEmail, displayName: params.partnerName } : null,
    params.clientEmail  ? { email: params.clientEmail,  displayName: params.clientName  } : null,
  ].filter(Boolean)

  // Google Meet を自動生成（conferenceData.createRequest + conferenceDataVersion=1）
  const requestId = `mb-${globalThis.crypto.randomUUID()}`
  const event = {
    summary: params.summary,
    description: params.description ?? '',
    start: { dateTime: params.startAt.toISOString(), timeZone: 'Asia/Tokyo' },
    end:   { dateTime: params.endAt.toISOString(),   timeZone: 'Asia/Tokyo' },
    attendees,
    reminders: { useDefault: true },
    conferenceData: {
      createRequest: {
        requestId,
        conferenceSolutionKey: { type: 'hangoutsMeet' },
      },
    },
  }

  const res = await fetch(`${GCAL_BASE}/calendars/primary/events?sendUpdates=all&conferenceDataVersion=1`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${access_token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(event),
  })
  if (!res.ok) throw new Error(`Create event failed: ${await res.text()}`)
  const data = await res.json()
  const meetingUrl: string | null =
    data.hangoutLink
    ?? data.conferenceData?.entryPoints?.find((e: { entryPointType?: string; uri?: string }) => e.entryPointType === 'video')?.uri
    ?? null
  return { id: data.id as string, meetingUrl }
}

// ── 空き枠算出 ──────────────────────────────────────────────────────────────

export type Availability = {
  days:           number[]  // 0=Sun…6=Sat
  start:          string    // "HH:MM"
  end:            string    // "HH:MM"
  slot_minutes:   number
  buffer_minutes: number
}

export type TimeSlot = {
  start: string  // ISO string
  end:   string  // ISO string
}

/**
 * 指定日の予約可能スロット一覧を返す
 * @param date      対象日 (YYYY-MM-DD)
 * @param avail     パートナーの受付時間帯設定
 * @param busyBlocks  Google FreeBusy の busy ブロック
 */
export function calcAvailableSlots(
  date: string,
  avail: Availability,
  busyBlocks: BusyBlock[]
): TimeSlot[] {
  const [year, month, day] = date.split('-').map(Number)
  const jstOffset = 9 * 60  // JST = UTC+9

  // その日が受付曜日かチェック (JSTで判定)
  const localDate = new Date(Date.UTC(year, month - 1, day))
  const weekday = new Date(localDate.getTime() + jstOffset * 60_000).getDay()
  if (!avail.days.includes(weekday)) return []

  // 受付開始・終了を UTC に変換
  const [sh, sm] = avail.start.split(':').map(Number)
  const [eh, em] = avail.end.split(':').map(Number)
  const dayStartUtc = new Date(Date.UTC(year, month - 1, day, sh, sm) - jstOffset * 60_000)
  const dayEndUtc   = new Date(Date.UTC(year, month - 1, day, eh, em) - jstOffset * 60_000)

  const slotMs   = avail.slot_minutes   * 60_000
  const bufferMs = avail.buffer_minutes * 60_000

  const slots: TimeSlot[] = []
  let cursor = dayStartUtc.getTime()

  while (cursor + slotMs <= dayEndUtc.getTime()) {
    const slotStart = cursor
    const slotEnd   = cursor + slotMs

    // busy ブロックと重なるか（バッファ込み）
    const blocked = busyBlocks.some(b => {
      const bs = new Date(b.start).getTime() - bufferMs
      const be = new Date(b.end).getTime()   + bufferMs
      return slotStart < be && slotEnd > bs
    })

    if (!blocked) {
      slots.push({
        start: new Date(slotStart).toISOString(),
        end:   new Date(slotEnd).toISOString(),
      })
    }
    cursor += slotMs
  }

  return slots
}
