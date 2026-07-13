import { redirect } from 'next/navigation'
// v5(2026-07-14): 紹介者→パートナー（MBコンソール同体裁）へ改称・移設。
export default function NetworkRedirect() { redirect('/app/s/partners') }
