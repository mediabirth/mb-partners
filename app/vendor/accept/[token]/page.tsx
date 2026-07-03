/**
 * /vendor/accept/[token] — vendor 招待の検証＋パスワード設定フォーム表示。
 * 招待(kind='vendor')のみ受理。partner の /invite/[token] とは別経路。
 */
import { createServiceRoleClient } from '@/lib/supabase/server'
import VendorAcceptForm from './VendorAcceptForm'

export const runtime = 'edge'

function ErrorPage({ message }: { message: string }) {
  return (
    <div style={{ minHeight: '100dvh', background: 'var(--bg2)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
      <div style={{ width: 400, maxWidth: '100%', background: '#fff', border: '0.5px solid var(--line)', borderRadius: 16, padding: '32px 28px', textAlign: 'center' }}>
        <h1 style={{ fontSize: '1rem', fontWeight: 500, marginBottom: 10 }}>招待リンクエラー</h1>
        <p style={{ fontSize: '.78rem', color: 'var(--muted2)', lineHeight: 1.7 }}>{message}</p>
      </div>
    </div>
  )
}

export default async function VendorAcceptPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const service = await createServiceRoleClient()
  const { data: invite } = await service
    .from('invites').select('email, name, kind, role, delivery_id, expires_at, used_at').eq('token', token).maybeSingle()

  if (!invite) return <ErrorPage message="招待リンクが見つかりません。URLをご確認ください。" />
  if (invite.kind !== 'vendor' || invite.role !== 'vendor') return <ErrorPage message="この招待は業務委託先向けではありません。" />
  if (invite.used_at) return <ErrorPage message="この招待リンクはすでに使用済みです。ログインページからお試しください。" />
  if (new Date(invite.expires_at) < new Date()) return <ErrorPage message="招待リンクの有効期限が切れています。担当者に再送をご依頼ください。" />

  return <VendorAcceptForm email={invite.email} defaultName={invite.name ?? ''} token={token} />
}
