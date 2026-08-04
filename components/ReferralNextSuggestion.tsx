import { createClient } from '@/lib/supabase/server'
import { computeNudges, type NudgeContact } from '@/lib/synapse-nudge'
import { topSuggestion, type MatchContact } from '@/lib/synapse-match'
import ReferralNextSuggestionCard from './ReferralNextSuggestionCard'

type Contact = NudgeContact & MatchContact & { phone: string | null }

function titleOf(contact: Contact): string {
  const corporate = contact.entity_type === 'corporate' || (contact.entity_type !== 'individual' && !!contact.company)
  return (corporate ? (contact.company || contact.name) : (contact.name || contact.company)) || '名称未設定'
}

function referHref(contact: Contact, memo = ''): string {
  const p = new URLSearchParams()
  p.set('ct', contact.entity_type === 'individual' ? 'individual' : 'corporate')
  if (contact.company) p.set('co', contact.company)
  if (contact.name) p.set('nm', contact.name)
  if (contact.phone) p.set('phone', contact.phone)
  if (memo) p.set('memo', memo.slice(0, 200))
  return `/app/refer?${p.toString()}`
}

// 紹介完了後の1枚だけの提案。本人RLSの台帳＋公開目録を読むだけで、案件・報酬には書き込まない。
export default async function ReferralNextSuggestion({ contextKey, excludeNames = [] }: { contextKey: string; excludeNames?: string[] }) {
  const supabase = await createClient()
  const [contactsRes, servicesRes] = await Promise.all([
    supabase.from('synapse_contacts')
      .select('id,name,company,industry,entity_type,url,phone,updated_at,demand_summary,demand_tags,recommended_services')
      .order('updated_at', { ascending: false }),
    supabase.from('services').select('name').eq('active', true).order('sort'),
  ])
  const excluded = new Set(excludeNames.map(name => name.trim()).filter(Boolean))
  const contacts = ((contactsRes.data ?? []) as Contact[]).filter(contact => !excluded.has(contact.name ?? '') && !excluded.has(contact.company ?? ''))
  if (contacts.length === 0) return null

  const catalog = ((servicesRes.data ?? []) as Array<{ name: string }>).map(row => row.name).filter(Boolean)
  // 目録の全件を「新着」と誤認させない。新着日時を持たないため、既存の休眠ナッジだけを使う。
  const nudge = computeNudges(contacts, { nowMs: Date.now(), dormantDays: 90, max: 1 })[0]
  const byId = new Map(contacts.map(contact => [contact.id, contact]))
  if (nudge) {
    const contact = byId.get(nudge.contactId)
    if (contact) {
      return <ReferralNextSuggestionCard contextKey={contextKey} suggestion={{
        id: contact.id,
        title: titleOf(contact),
        reason: nudge.reason,
        href: nudge.action === 'refer' ? referHref(contact, nudge.serviceName ?? '') : `/app/synapse/${contact.id}`,
        actionLabel: nudge.action === 'refer' ? 'この方を紹介する' : '詳しく見る',
      }} />
    }
  }

  const matched = topSuggestion(contacts, catalog)
  if (matched) {
    const contact = byId.get(matched.focusId)
    if (contact) {
      return <ReferralNextSuggestionCard contextKey={contextKey} suggestion={{
        id: contact.id,
        title: titleOf(contact),
        reason: matched.candidate.kind === 'service' ? `「${matched.candidate.title}」が合いそうです。` : matched.candidate.reason,
        href: referHref(contact, matched.candidate.kind === 'service' ? matched.candidate.title : matched.candidate.reason),
        actionLabel: 'この方を紹介する',
      }} />
    }
  }

  const contact = contacts[0]
  return <ReferralNextSuggestionCard contextKey={contextKey} suggestion={{
    id: contact.id,
    title: titleOf(contact),
    reason: 'つながりにメモしている方です。必要なときに紹介へ進めます。',
    href: referHref(contact),
    actionLabel: 'この方を紹介する',
  }} />
}
