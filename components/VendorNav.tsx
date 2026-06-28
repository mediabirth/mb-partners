'use client'
// BR-V3：単一ソースの SurfaceNav を vendor config で描画（chrome は app と同一実装）。
// 改修：ホーム / スケジュール / 〔案件・中央隆起〕 / 委託費 / 通知。経費は案件詳細に集約。
// 構成差は vendor config のみ＝ /app(パートナー)のナビは AppNav 側で不変。
import SurfaceNav, { NavFab } from '@/components/ui/SurfaceNav'

const HOME = <path d="M3 10.5L12 3l9 7.5V21a1 1 0 01-1 1h-5v-7h-6v7H4a1 1 0 01-1-1z" />
const CAL = <><rect x="3" y="4.5" width="18" height="17" rx="2" /><path d="M3 9.5h18M8 3v3M16 3v3" /></>
const REWARD = <path d="M12 2v20M17 6H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6" />
const BELL = <path d="M18 8a6 6 0 10-12 0c0 7-3 9-3 9h18s-3-2-3-9M13.7 21a2 2 0 01-3.4 0" />

export default function VendorNav() {
  return (
    <SurfaceNav
      // 並び＝ホーム / 予定(スケジュール) / 〔案件・中央隆起〕 / 委託費 / 通知
      left={[{ href: '/vendor', label: 'ホーム', icon: HOME, rootExact: true }, { href: '/vendor/schedule', label: '予定', icon: CAL }]}
      right={[{ href: '/vendor/rewards', label: '委託費', icon: REWARD }, { href: '/vendor/inbox', label: '通知', icon: BELL }]}
      fab={<NavFab href="/vendor/cases" label="案件"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2"><rect x="3" y="7.5" width="18" height="12.5" rx="2" /><path d="M8 7.5V5.5a2 2 0 012-2h4a2 2 0 012 2v2" /></svg></NavFab>}
    />
  )
}
