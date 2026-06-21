/**
 * Wave1-④b：inbox チャネル（既存 lib/notifications.ts を additive 利用）。
 * notify() を inbox + push の fan-out に統一するための土台。既存の notifications 書込ロジックは不変。
 * 全 partner に inbox があるため enabledFor は常に true。お金・案件状態には非接触。
 */
import type { Channel } from './types'
import { createNotification } from '@/lib/notifications'

export const inboxChannel: Channel = {
  name: 'inbox',
  enabledFor: async () => true,
  deliver: async (admin, partnerId, payload) => {
    try {
      await createNotification(admin, partnerId, payload.title, payload.body ?? null, payload.ref ?? null)
      return { sent: 1, failed: 0 }
    } catch {
      return { sent: 0, failed: 1 }
    }
  },
}
