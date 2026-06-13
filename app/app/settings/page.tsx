'use client'
import Link from 'next/link'
import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'

export default function SettingsPage() {
  const router = useRouter()
  const [push, setPush] = useState(true)
  const [email, setEmail] = useState(true)
  const [line, setLine] = useState(false)

  async function logout() {
    const sb = createClient()
    await sb.auth.signOut()
    router.push('/login')
  }

  return (
    <div>
      <div style={{ padding: '22px 20px 6px' }}>
        <div style={{ display: 'flex', alignItems: 'baseline', marginBottom: 12 }}>
          <h2 style={{ fontSize: '.98rem', fontWeight: 700 }}>設定</h2>
        </div>
      </div>

      {/* Links group */}
      <div style={{ margin: '0 20px 14px', background: '#fff', border: '1px solid var(--line)', borderRadius: 13, overflow: 'hidden' }}>
        <SRow as={Link} href="/app/mypage">マイページ</SRow>
        <SRow as={Link} href="/app/guide">サービスガイド</SRow>
        <SRow as={Link} href="/app/terms">パートナー規約・ヘルプ</SRow>
      </div>

      {/* Notification toggles */}
      <div style={{ margin: '0 20px 14px', background: '#fff', border: '1px solid var(--line)', borderRadius: 13, overflow: 'hidden' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '15px', borderBottom: '1px solid #F2F2F6', fontSize: '.77rem' }}>
          <span>プッシュ通知</span>
          <Toggle on={push} onChange={setPush} />
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '15px', borderBottom: '1px solid #F2F2F6', fontSize: '.77rem' }}>
          <span>メール通知</span>
          <Toggle on={email} onChange={setEmail} />
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '15px', fontSize: '.77rem' }}>
          <span>LINE通知</span>
          <Toggle on={line} onChange={setLine} />
        </div>
      </div>

      <div style={{ margin: '4px 20px' }}>
        <button onClick={logout} className="btn btn-g" style={{ width: '100%', marginTop: 0 }}>
          ログアウト
        </button>
      </div>

      <div style={{ height: 32 }} />
    </div>
  )
}

function SRow({ children, href, as: Comp = 'div' }: { children: React.ReactNode; href?: string; as?: any }) {
  return (
    <Comp href={href} style={{
      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
      padding: '15px', borderBottom: '1px solid #F2F2F6',
      fontSize: '.77rem', textDecoration: 'none', color: 'var(--txt)',
      cursor: 'pointer',
    }}>
      <div>{children}</div>
      <span style={{ color: 'var(--muted)' }}>→</span>
    </Comp>
  )
}

function Toggle({ on, onChange }: { on: boolean; onChange: (v: boolean) => void }) {
  return (
    <div
      onClick={() => onChange(!on)}
      style={{
        width: 42, height: 24, borderRadius: 14,
        background: on ? 'var(--blue)' : '#D9D9E2',
        position: 'relative', cursor: 'pointer', flexShrink: 0,
        transition: 'background .22s cubic-bezier(.2,.8,.2,1)',
      }}
    >
      <span style={{
        position: 'absolute', top: 3, left: on ? 21 : 3,
        width: 18, height: 18, borderRadius: '50%', background: '#fff',
        boxShadow: '0 1px 3px rgba(0,0,0,.2)',
        transition: 'left .22s cubic-bezier(.2,.8,.2,1)',
      }}/>
    </div>
  )
}
