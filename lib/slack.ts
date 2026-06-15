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
