'use client'
import { useState } from 'react'
import MenuDetailSheet, { type SheetService, type SheetReward } from '@/components/MenuDetailSheet'
import type { CoopTaskItem } from '@/lib/coop-task-display'

/**
 * 案件詳細（server component）ヘッダのメニューⓘ。
 * タップで共有 MenuDetailSheet（メニュー版）を開く小さな client component。
 * 必要データ（メニュー名・報酬・説明・協力タスク）はサーバ側で取得して props で受け取る。
 * ⓘ＝var(--muted) の16px円形アイコン（SVG）。
 */
export default function MenuInfoButton({ svc, menuName, menuDescription, reward, tasks }: {
  svc: SheetService
  menuName: string
  menuDescription?: string | null
  reward?: SheetReward | null
  tasks?: CoopTaskItem[]
}) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} aria-label="メニューの詳細"
        style={{ width: 16, height: 16, background: 'none', border: 'none', padding: 0, color: 'var(--muted)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flexShrink: 0 }}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><circle cx="12" cy="12" r="9" /><path d="M12 11v5M12 8h.01" strokeLinecap="round" /></svg>
      </button>
      {open && (
        <MenuDetailSheet
          svc={svc}
          menuName={menuName}
          menuDescription={menuDescription ?? null}
          reward={reward ?? null}
          tasks={tasks ?? []}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  )
}
