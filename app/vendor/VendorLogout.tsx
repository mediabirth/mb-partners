'use client'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

export default function VendorLogout() {
  const router = useRouter()
  async function logout() {
    const supabase = createClient()
    // scope:'local'＝この面の cookie だけを消す（他面のセッションを巻き添えにしない）。
    await supabase.auth.signOut({ scope: 'local' })
    router.push('/vendor/login'); router.refresh()
  }
  return (
    <button onClick={logout} className="ui-btn ui-btn--secondary ui-btn--lg" style={{ width: '100%', justifyContent: 'center' }}>
      ログアウト
    </button>
  )
}
