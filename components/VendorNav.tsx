'use client'
// BR-V3：単一ソースの SurfaceNav を vendor config で描画（chrome は app と同一実装）。
// ベンダー純化P1：3機能（承諾/明細閲覧/経費エビデンス）に整列。
//   並び＝ホーム / 案件 / 〔経費申請・中央隆起=主動作〕 / 委託費 / 通知（予定=スケジュールは撤去）。
//   FAB は NavFab の onClick 拡張（vendor=アクション）＝共通経費シートを開く。
// 構成差は vendor config のみ＝ /app(パートナー)のナビは AppNav 側で不変。
import { useState } from 'react'
import dynamic from 'next/dynamic'
import SurfaceNav, { NavFab } from '@/components/ui/SurfaceNav'
const VendorExpenseSheet = dynamic(() => import('@/components/VendorExpenseSheet'), { ssr: false })

const HOME = <path d="M3 10.5L12 3l9 7.5V21a1 1 0 01-1 1h-5v-7h-6v7H4a1 1 0 01-1-1z" />
const CASES = <><rect x="3" y="7.5" width="18" height="12.5" rx="2" /><path d="M8 7.5V5.5a2 2 0 012-2h4a2 2 0 012 2v2" /></>
const REWARD = <path d="M12 2v20M17 6H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6" />
const BELL = <path d="M18 8a6 6 0 10-12 0c0 7-3 9-3 9h18s-3-2-3-9M13.7 21a2 2 0 01-3.4 0" />

export default function VendorNav() {
  const [expenseOpen, setExpenseOpen] = useState(false)
  return (
    <>
      <SurfaceNav
        // 純化(E): 「案件」ラベル削除＝整合のため全項目アイコンのみ（名称は aria-label で保持・タップ領域不変）。
        iconOnly
        left={[{ href: '/vendor', label: 'ホーム', icon: HOME, rootExact: true }, { href: '/vendor/cases', label: '案件', icon: CASES }]}
        right={[{ href: '/vendor/rewards', label: '委託費', icon: REWARD }, { href: '/vendor/inbox', label: '通知', icon: BELL }]}
        fab={<NavFab onClick={() => setExpenseOpen(true)} label="経費を申請" iconOnly><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2"><path d="M12 5v14M5 12h14" /></svg></NavFab>}
      />
      {expenseOpen && <VendorExpenseSheet open onClose={() => setExpenseOpen(false)} />}
    </>
  )
}
