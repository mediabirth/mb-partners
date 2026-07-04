'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

export default function MagicCallbackPage() {
  const router = useRouter()

  useEffect(() => {
    const hash = window.location.hash.slice(1)
    const params = new URLSearchParams(hash)
    const access_token = params.get('access_token')
    const refresh_token = params.get('refresh_token')

    if (!access_token || !refresh_token) {
      router.replace('/login?error=missing_tokens')
      return
    }

    // ★以前は生の createBrowserClient（cookieOptions.name 無し）でデフォルト cookie に書いており、
    //   surface 分離をバイパスしていた（再発の温床）。surface-aware factory 経由へ統一。
    const supabase = createClient()

    supabase.auth.setSession({ access_token, refresh_token }).then(({ error }: { error: unknown }) => {
      if (error) {
        router.replace('/login?error=session_failed')
      } else {
        router.replace('/') // root page routes to /app or /console based on role
      }
    })
  }, [router])

  return (
    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh' }}>
      <p>ログイン中…</p>
    </div>
  )
}
