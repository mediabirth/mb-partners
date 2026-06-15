/**
 * Slack notification helper.
 *
 * Sends a message to the Slack Incoming Webhook configured in the
 * SLACK_WEBHOOK_URL environment variable. If the env var is not set this is a
 * safe no-op, so it can ship without breaking anything — an admin enables it by
 * adding SLACK_WEBHOOK_URL to the Vercel project env (Production).
 *
 * Edge-compatible (uses global fetch). Never throws: a Slack outage must never
 * break the primary request (deal creation, status change, payout, ...).
 */
import { createServiceRoleClient } from '@/lib/supabase/server'

export async function notifySlack(text: string): Promise<void> {
  const url = process.env.SLACK_WEBHOOK_URL
  if (!url) return
  try {
    await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text }),
    })
  } catch {
    // swallow — notifications are best-effort
  }
}

export type SlackEvent = 'new_deal' | 'status_change' | 'payout'
const EVENT_COL: Record<SlackEvent, string> = {
  new_deal: 'notify_new_deal',
  status_change: 'notify_status_change',
  payout: 'notify_payout',
}

/**
 * ⑤ Gated Slack send: only fires when notification_settings.slack_enabled is true
 * AND the per-event toggle is on. Reads the singleton settings row via service role.
 * If settings are missing/unreadable, it does NOT send (fail-closed). Never throws.
 */
export async function notifySlackEvent(event: SlackEvent, text: string): Promise<void> {
  if (!process.env.SLACK_WEBHOOK_URL) return
  try {
    const svc = await createServiceRoleClient()
    const { data } = await svc
      .from('notification_settings')
      .select('slack_enabled, notify_new_deal, notify_status_change, notify_payout')
      .eq('id', 1)
      .single()
    if (!data || !data.slack_enabled) return
    if ((data as Record<string, boolean>)[EVENT_COL[event]] === false) return
    await notifySlack(text)
  } catch {
    // swallow — never break the primary request
  }
}
