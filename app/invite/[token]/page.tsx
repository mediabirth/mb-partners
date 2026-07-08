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
          <g stroke="#4733E6" strokeWidth="2.2" strokeLinecap="round" opacity="0.4"><line x1="24" y1="24" x2="24" y2="7" /><line x1="24" y1="24" x2="39" y2="14" /><line x1="24" y1="24" x2="37" y2="37" /><line x1="24" y1="24" x2="10" y2="37" /><line x1="24" y1="24" x2="8" y2="21" /></g><rect x="20.5" y="4" width="7" height="7" rx="1.8" fill="#4733E6" /><circle cx="39" cy="14" r="3.6" fill="#8B5CF6" /><rect x="33.5" y="33.5" width="7.5" height="7.5" rx="2.2" stroke="#4733E6" strokeWidth="2.4" /><circle cx="10" cy="37" r="4" fill="#4733E6" /><circle cx="8" cy="21" r="2.8" stroke="#4733E6" strokeWidth="2.4" /><rect x="18.5" y="18.5" width="11" height="11" rx="3" fill="#4733E6" />
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
