'use client'
// BR-V3：単一ソースの SurfaceNav を app config で描画（chrome は共通実装＝乖離不能）。
import SurfaceNav, { NavFab } from '@/components/ui/SurfaceNav'

const HOME = <path d="M3 10.5L12 3l9 7.5V21a1 1 0 01-1 1h-5v-7h-6v7H4a1 1 0 01-1-1z" />
const CASES = <path d="M4 6h16M4 12h16M4 18h10" />
const REWARD = <path d="M12 2v20M17 6H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6" />
const BELL = <path d="M18 8a6 6 0 10-12 0c0 7-3 9-3 9h18s-3-2-3-9M13.7 21a2 2 0 01-3.4 0" />
const COMPANY = <path d="M3 21h18M5 21V5a1 1 0 011-1h8a1 1 0 011 1v16M9 8h2M9 12h2M9 16h2M15 8v13h4a1 1 0 001-1V11a1 1 0 00-1-1h-4" />

/** ペルソナ・ホーム（2026-07-13）: サプライヤーは「会社」タブ（商品・お金・委託・変更申請）。
 *  報酬タブは会社内「案件とお金」に集約（FAB=紹介は全ペルソナ不変＝リファラル獲得最優先）。 */
export default function AppNav({ supplier = false }: { supplier?: boolean }) {
  return (
    <SurfaceNav
      left={[{ href: '/app', label: 'ホーム', icon: HOME, rootExact: true }, { href: '/app/cases', label: '案件', icon: CASES }]}
      right={supplier
        ? [{ href: '/app/company', label: '会社', icon: COMPANY }, { href: '/app/inbox', label: '通知', icon: BELL }]
        : [{ href: '/app/rewards', label: '報酬', icon: REWARD }, { href: '/app/inbox', label: '通知', icon: BELL }]}
      unreadHref="/app/inbox"
      fab={<NavFab href="/app/refer"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2"><path d="M12 5v14M5 12h14" /></svg></NavFab>}
    />
  )
}
