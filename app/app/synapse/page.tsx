import { redirect } from 'next/navigation'
import { createClient, getCachedUid } from '@/lib/supabase/server'
import SynapseClient, { type SynapseContact } from './SynapseClient'

// SYNAPSE Phase 0（P0-3）：パートナー“私的”関係資本台帳＋AIヒアリング入口。
// ★本人のみ。読取は本人セッション(anon)＋RLSで自動スコープ（他人の行は不可視）。
// ★お金・deals・frontier・/r帰属・既存ナビには一切触れない隔離ルート。
export const runtime = 'edge'

export default async function SynapsePage() {
  const uid = await getCachedUid()
  if (!uid) redirect('/login')

  // RLS（本人のみ）で自動スコープ。partner_id を渡さなくても自分の行だけが返る。
  const supabase = await createClient()
  const { data } = await supabase
    .from('synapse_contacts')
    .select('id, name, company, industry, role, relationship, needs, notes, suggested_service, suggested_angle, acted_at, source, created_at, updated_at')
    .order('created_at', { ascending: false })

  const contacts = (data ?? []) as SynapseContact[]
  const aiEnabled = !!process.env.ANTHROPIC_API_KEY

  return (
    <div className="page-anim">
      <div style={{ padding: '20px 20px 6px' }}>
        <div className="eyebrow" style={{ marginBottom: 6 }}>SYNAPSE · あなただけの台帳</div>
        <h1 style={{ fontSize: '1.12rem', fontWeight: 900, letterSpacing: '-.01em' }}>つながりの台帳</h1>
        <p style={{ fontSize: '.66rem', color: 'var(--muted2)', marginTop: 6, lineHeight: 1.7 }}>
          出会った方のことを話すと、SYNAPSEが合いそうなMBサービスと“刺さる切り口”を返します。記録した内容はあなた専用です（運営や他のパートナーには共有されません）。
        </p>
      </div>
      <SynapseClient initialContacts={contacts} aiEnabled={aiEnabled} />
    </div>
  )
}
