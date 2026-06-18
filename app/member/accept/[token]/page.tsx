/**
 * /member/accept/[token] — MBメンバー招待の検証＋パスワード設定。
 * console ホストで開かれる（招待URLが console origin で生成されるため、サインインは console セッションに入る）。
 */
import { createServiceRoleClient } from '@/lib/supabase/server'
import MemberAcceptForm from './MemberAcceptForm'

export const runtime = 'edge'

function ErrorPage({ message }: { message: string }) {
  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg2)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
      <div style={{ width: 400, maxWidth: '100%', background: '#fff', border: '1px solid var(--line)', borderRadius: 16, padding: '32px 28px', textAlign: 'center' }}>
        <h1 style={{ fontSize: '1rem', fontWeight: 800, marginBottom: 10 }}>招待リンクエラー</h1>
        <p style={{ fontSize: '.78rem', color: 'var(--muted2)', lineHeight: 1.7 }}>{message}</p>
      </div>
    </div>
  )
}

export default async function MemberAcceptPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const service = await createServiceRoleClient()
  const { data: invite } = await service.from('invites').select('email, name, kind, expires_at, used_at').eq('token', token).maybeSingle()
  if (!invite) return <ErrorPage message="招待リンクが見つかりません。URLをご確認ください。" />
  if (invite.kind !== 'member') return <ErrorPage message="この招待はMBメンバー向けではありません。" />
  if (invite.used_at) return <ErrorPage message="この招待リンクはすでに使用済みです。ログインページからお試しください。" />
  if (new Date(invite.expires_at) < new Date()) return <ErrorPage message="招待リンクの有効期限が切れています。" />
  return <MemberAcceptForm email={invite.email} defaultName={invite.name ?? ''} token={token} />
}
