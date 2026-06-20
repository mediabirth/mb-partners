'use client'
// BR-V3：単一ソースの SurfaceNav を vendor config で描画（chrome は app と同一実装）。
// Step5：vendor のみ「案件着手中心」に再構成 — 中央隆起＝案件(/vendor/cases へ遷移)、経費は通常タブ化(モーダル維持)。
// 構成差は vendor config のみ＝ /app(パートナー)のナビは AppNav 側で不変。
import { useState } from 'react'
import SurfaceNav, { NavFab } from '@/components/ui/SurfaceNav'
import VendorExpenseSheet from './VendorExpenseSheet'

const HOME = <path d="M3 10.5L12 3l9 7.5V21a1 1 0 01-1 1h-5v-7h-6v7H4a1 1 0 01-1-1z" />
const EXPENSE = <><path d="M6 3h12v18l-2.5-1.6L13 21l-2.5-1.6L8 21l-2-1.4z" /><path d="M9.5 8.5h5M9.5 12.5h5" /></>
const REWARD = <path d="M12 2v20M17 6H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6" />
const BELL = <path d="M18 8a6 6 0 10-12 0c0 7-3 9-3 9h18s-3-2-3-9M13.7 21a2 2 0 01-3.4 0" />

export default function VendorNav() {
  const [sheet, setSheet] = useState(false)
  return (
    <>
      <SurfaceNav
        // 並び＝ホーム / 経費 / 〔案件・中央隆起〕 / 報酬 / 通知
        left={[{ href: '/vendor', label: 'ホーム', icon: HOME, rootExact: true }, { label: '経費', icon: EXPENSE, onClick: () => setSheet(true) }]}
        right={[{ href: '/vendor/rewards', label: '報酬', icon: REWARD }, { href: '/vendor/inbox', label: '通知', icon: BELL }]}
        fab={<NavFab href="/vendor/cases" label="案件"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2"><rect x="3" y="7.5" width="18" height="12.5" rx="2" /><path d="M8 7.5V5.5a2 2 0 012-2h4a2 2 0 012 2v2" /></svg></NavFab>}
      />
      <VendorExpenseSheet open={sheet} onClose={() => setSheet(false)} />
    </>
  )
}
