import { createServiceRoleClient } from '@/lib/supabase/server'
import InviteForm from './InviteForm'

function ErrorPage({ message }: { message: string }) {
  return (
    <div style={{ background: '#E9E9ED', minHeight: '100vh', display: 'flex', justifyContent: 'center' }}>
      <div style={{
        width: '100%', maxWidth: 430, background: '#fff', minHeight: '100vh',
        boxShadow: '0 0 48px rgba(14,14,20,.12)', display: 'flex', flexDirection: 'column',
        justifyContent: 'center', padding: '40px 28px',
      }}>
        <svg width="50" height="50" viewBox="0 0 48 48" fill="none" style={{ marginBottom: 24 }}>
          <rect x="6"  y="6"  width="14" height="14" rx="3"  stroke="#4733E6" strokeWidth="2.6"/>
          <rect x="28" y="6"  width="14" height="14" rx="7"  stroke="#4733E6" strokeWidth="2.6"/>
          <rect x="6"  y="28" width="14" height="14" rx="7"  stroke="#0E0E14" strokeWidth="2.6"/>
          <rect x="28" y="28" width="14" height="14" rx="3"  fill="#4733E6"/>
        </svg>
        <h1 style={{ fontSize: '1.2rem', fontWeight: 500, marginBottom: 12 }}>招待リンクエラー</h1>
        <p style={{ fontSize: '.8rem', color: 'var(--muted2)', lineHeight: 1.7 }}>{message}</p>
        <a href="/login" style={{ marginTop: 24, fontSize: '.75rem', color: 'var(--c-blue)' }}>
          ← ログインページへ
        </a>
      </div>
    </div>
  )
}

export default async function InvitePage({
  params,
}: {
  params: Promise<{ token: string }>
}) {
  const { token } = await params
  const service = await createServiceRoleClient()

  const { data: invite } = await service
    .from('invites')
    .select('email, name, expires_at, used_at')
    .eq('token', token)
    .single()

  if (!invite) {
    return <ErrorPage message="招待リンクが見つかりません。URLをご確認ください。" />
  }
  if (invite.used_at) {
    return <ErrorPage message="この招待リンクはすでに使用済みです。ログインページからお試しください。" />
  }
  if (new Date(invite.expires_at) < new Date()) {
    return <ErrorPage message="招待リンクの有効期限が切れています。管理者に再送をご依頼ください。" />
  }

  return (
    <InviteForm
      email={invite.email}
      defaultName={invite.name ?? ''}
      token={token}
    />
  )
}
