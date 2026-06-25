import { redirect } from 'next/navigation'
import { createClient, createServiceRoleClient, getCachedUid } from '@/lib/supabase/server'
import ConsoleNav from '@/components/ConsoleNav'
import MessagesClient, { type ThreadRow, type Msg } from './MessagesClient'

// メッセージセンター Phase1：相手リスト（LINE連携パートナー＋顧客メール）＋スレッド＋送信ボックス。
// ★読取は service_role（owner gate）。messages 隔離表のみ。money/deals/帰属 非接触。
export const runtime = 'edge'

export default async function ConsoleMessagesPage() {
  const uid = await getCachedUid()
  if (!uid) redirect('/console/login')
  const supabase = await createClient()
  const { data: prof } = await supabase.from('profiles').select('role').eq('id', uid).single()
  if (prof?.role !== 'owner') redirect('/console')

  const admin = await createServiceRoleClient()
  const [linksRes, msgsRes, tplRes] = await Promise.all([
    admin.from('partner_line_links').select('partner_id, line_user_id'),
    admin.from('messages').select('id, created_at, partner_id, customer_email, direction, channel, subject, body, status, error, thread_key, attachments').order('created_at', { ascending: true }).limit(2000),
    admin.from('message_templates').select('id, title, body, subject, category, channel, attachments, buttons, sort_order').eq('is_active', true).order('sort_order', { ascending: true }).order('created_at', { ascending: true }),
  ])
  const links = (linksRes.data ?? []) as Array<{ partner_id: string; line_user_id: string }>
  const messages = (msgsRes.data ?? []) as Msg[]
  const templates = (tplRes.data ?? []) as import('./MessagesClient').Template[]

  // 受信画像＋テンプレ画像：private バケットの署名URLを path→url で解決（console表示のみ・公開URLは発行しない）。
  const signedUrls: Record<string, string> = {}
  const imgPaths = [...new Set([
    ...messages.flatMap(m => (m.attachments ?? []).filter(a => a?.type === 'image' && a?.path).map(a => a.path)),
    ...templates.flatMap(t => (t.attachments ?? []).filter(a => a?.type === 'image' && a?.path).map(a => a.path)),
  ])]
  if (imgPaths.length) {
    const { data: signed } = await admin.storage.from('message-attachments').createSignedUrls(imgPaths, 3600)
    for (const s of signed ?? []) { if (s.signedUrl && s.path) signedUrls[s.path] = s.signedUrl }
  }

  // パートナー名解決（service_role・partners→profiles）。
  const partnerIds = [...new Set(links.map(l => l.partner_id))]
  const nameById = new Map<string, string>()
  if (partnerIds.length) {
    const { data: pdata } = await admin.from('partners').select('id, code, profiles(name)').in('id', partnerIds)
    for (const p of (pdata ?? []) as Array<{ id: string; code: string | null; profiles: { name: string | null }[] | { name: string | null } | null }>) {
      const nm = Array.isArray(p.profiles) ? p.profiles[0]?.name : p.profiles?.name
      nameById.set(p.id, nm || p.code || 'パートナー')
    }
  }

  // スレッド一覧：LINE連携パートナー ＋ messages に出現する customer_email。
  const lastOf = (key: string) => { const m = messages.filter(x => x.thread_key === key); return m[m.length - 1] ?? null }
  const threads: ThreadRow[] = []
  for (const l of links) {
    const key = `partner:${l.partner_id}`; const last = lastOf(key)
    threads.push({ key, label: nameById.get(l.partner_id) ?? 'パートナー', kind: 'partner', partnerId: l.partner_id, hasLine: true, lastBody: last?.body ?? null, lastAt: last?.created_at ?? null })
  }
  const seenEmail = new Set<string>()
  for (const m of messages) {
    if (m.partner_id || !m.customer_email) continue
    const addr = m.customer_email.toLowerCase()
    if (seenEmail.has(addr)) continue
    seenEmail.add(addr)
    const key = `email:${addr}`; const last = lastOf(key)
    threads.push({ key, label: m.customer_email, kind: 'customer', customerEmail: m.customer_email, hasLine: false, lastBody: last?.body ?? null, lastAt: last?.created_at ?? null })
  }
  // 未連携LINE送信者（partner_id=null・thread_key='line:'+userId）も可視化（受信のみ・送信不可）。
  const seenLine = new Set<string>()
  for (const m of messages) {
    if (!m.thread_key.startsWith('line:') || seenLine.has(m.thread_key)) continue
    seenLine.add(m.thread_key)
    const last = lastOf(m.thread_key)
    threads.push({ key: m.thread_key, label: `未連携 LINE (${m.thread_key.slice(5, 13)}…)`, kind: 'unknown', hasLine: true, lastBody: last?.body ?? null, lastAt: last?.created_at ?? null })
  }
  threads.sort((a, b) => (b.lastAt ?? '').localeCompare(a.lastAt ?? ''))

  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: 'var(--bg2)' }}>
      <ConsoleNav />
      <div style={{ flex: 1, marginLeft: 230 }}>
        <MessagesClient threads={threads} messages={messages} signedUrls={signedUrls} templates={templates} />
      </div>
    </div>
  )
}
