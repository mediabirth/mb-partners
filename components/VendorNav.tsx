'use client'
// BR-V3：単一ソースの SurfaceNav を vendor config で描画（chrome は app と同一実装）。中央 FAB＝経費申請。
import { useState } from 'react'
import SurfaceNav, { NavFab } from '@/components/ui/SurfaceNav'
import VendorExpenseSheet from './VendorExpenseSheet'

const HOME = <path d="M3 10.5L12 3l9 7.5V21a1 1 0 01-1 1h-5v-7h-6v7H4a1 1 0 01-1-1z" />
const CASES = <path d="M4 6h16M4 12h16M4 18h10" />
const REWARD = <path d="M12 2v20M17 6H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6" />
const BELL = <path d="M18 8a6 6 0 10-12 0c0 7-3 9-3 9h18s-3-2-3-9M13.7 21a2 2 0 01-3.4 0" />

export default function VendorNav() {
  const [sheet, setSheet] = useState(false)
  return (
    <>
      <SurfaceNav
        left={[{ href: '/vendor', label: 'ホーム', icon: HOME, rootExact: true }, { href: '/vendor/cases', label: '案件', icon: CASES }]}
        right={[{ href: '/vendor/rewards', label: '報酬', icon: REWARD }, { href: '/vendor/inbox', label: '通知', icon: BELL }]}
        fab={<NavFab onClick={() => setSheet(true)} label="経費"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2"><path d="M12 5v14M5 12h14" /></svg></NavFab>}
      />
      <VendorExpenseSheet open={sheet} onClose={() => setSheet(false)} />
    </>
  )
}
