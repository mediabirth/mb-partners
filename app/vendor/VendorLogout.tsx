'use client'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

export default function VendorLogout() {
  const router = useRouter()
  async function logout() {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push('/vendor/login'); router.refresh()
  }
  return (
    <button onClick={logout} className="btn btn-g" style={{ width: '100%', justifyContent: 'center' }}>
      ログアウト
    </button>
  )
}
