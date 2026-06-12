'use client'

import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

export default function LogoutButton() {
  const router = useRouter()

  async function handleLogout() {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push('/login')
    router.refresh()
  }

  return (
    <button
      onClick={handleLogout}
      style={{
        border: 'none', background: 'none', cursor: 'pointer',
        color: 'var(--muted2)', padding: '6px 10px', borderRadius: 8,
        fontSize: '.75rem', fontFamily: 'inherit',
        transition: 'color .15s, background .15s',
      }}
      onMouseEnter={e => { (e.target as HTMLButtonElement).style.color = 'var(--red)'; (e.target as HTMLButtonElement).style.background = 'var(--red-bg)' }}
      onMouseLeave={e => { (e.target as HTMLButtonElement).style.color = 'var(--muted2)'; (e.target as HTMLButtonElement).style.background = 'none' }}
    >
      ログアウト
    </button>
  )
}
