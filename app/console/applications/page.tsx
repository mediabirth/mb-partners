import { redirect } from 'next/navigation'
import PageGuide from '@/components/PageGuide'
import { GUIDE_APPLICATIONS } from '@/lib/console-guides'
import Link from 'next/link'
import { createServiceRoleClient, getCachedUid } from '@/lib/supabase/server'
import ConsoleNav from '@/components/ConsoleNav'
import ConsoleMain from '@/components/ConsolePageTransition'
import ApplicationStatusCell from './ApplicationStatusCell'

// B1：外向けLP /join の応募一覧（console専用・読み取り）。Feature E(E-3)で「承認＝仲間化」アクションを追加（非金銭）。
// ★partner_applications のみ。お金・deals・status・frontier・/r帰属には一切関与しない。3サイト分離は不変。
export const runtime = 'edge'

type Application = {
  id: string
  created_at: string
  name: string | null
  org: string | null
  expertise: string | null
  kind?: string | null
  email: string | null
  phone: string | null
  message: string | null
  consent: boolean | null
  source: string | null
  referrer_partner_id: string | null
  activated_at: string | null
  status: string | null
  interview_at: string | null
  interview_meet_url: string | null
  referrer: { code: string | null; profiles: { name: string | null } | null } | null
}

// created_at(UTC) → JST 表示。
function fmtJst(iso: string): string {
  try {
    return new Intl.DateTimeFormat('ja-JP', {
      timeZone: 'Asia/Tokyo',
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', hour12: false,
    }).format(new Date(iso))
  } catch {
    return iso
  }
}

const TH: React.CSSProperties = {
  textAlign: 'left', fontSize: '.6rem', fontWeight: 500, color: 'var(--muted2)',
  padding: '10px 12px', whiteSpace: 'nowrap', borderBottom: '0.5px solid var(--line)',
}
const TD: React.CSSProperties = {
  fontSize: '.68rem', color: 'var(--txt)', padding: '11px 12px',
  borderBottom: '0.5px solid var(--line)', verticalAlign: 'top',
}

export default async function ConsoleApplicationsPage() {
  const uid = await getCachedUid()
  if (!uid) redirect('/console/login')
  const admin = await createServiceRoleClient()

  const { data } = await admin
    .from('partner_applications')
    .select('id, created_at, name, org, expertise, email, phone, message, consent, source, kind, referrer_partner_id, activated_at, status, interview_at, interview_meet_url, referrer:partners!partner_applications_referrer_partner_id_fkey(code, profiles(name))')
    .order('created_at', { ascending: false })

  const rows = (data ?? []) as unknown as Application[]

  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: 'var(--bg2)' }}>
      <ConsoleNav />
      <ConsoleMain>
        <div className="console-topbar" style={{ background: 'rgba(255,255,255,.92)', backdropFilter: 'blur(10px)', borderBottom: '0.5px solid var(--line)', padding: '13px 28px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', position: 'sticky', top: 0, zIndex: 30 }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7 }}><h1 style={{ fontSize: '1rem', fontWeight: 500, letterSpacing: '-.01em' }}>パートナー応募</h1><PageGuide data={GUIDE_APPLICATIONS} /></span>
          <Link href="/console" className="ui-btn ui-btn--secondary ui-btn--lg" style={{ fontSize: '.7rem', fontWeight: 500, padding: '7px 14px', textDecoration: 'none' }}>← ダッシュボード</Link>
        </div>

        <div style={{ padding: '24px 28px 44px' }}>
          <p style={{ fontSize: '.7rem', color: 'var(--muted2)', lineHeight: 1.7, marginBottom: 16 }}>
            応募一覧（全{rows.length}件）
          </p>

          {rows.length === 0 ? (
            <div style={{ background: '#fff', border: '0.5px solid var(--line)', borderRadius: 14, padding: '48px 24px', textAlign: 'center', color: 'var(--muted2)', fontSize: '.78rem' }}>
              まだ応募はありません
            </div>
          ) : (
            <div style={{ background: '#fff', border: '0.5px solid var(--line)', borderRadius: 14, overflow: 'hidden' }}>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 1000 }}>
                  <thead>
                    <tr>
                      <th style={TH}>応募日時</th>
                      <th style={TH}>お名前</th>
                      <th style={TH}>事務所・法人名</th>
                      <th style={TH}>ご専門・士業区分</th>
                      <th style={TH}>メール</th>
                      <th style={TH}>電話</th>
                      <th style={{ ...TH, minWidth: 220 }}>ひとこと</th>
                      <th style={TH}>同意</th>
                      <th style={TH}>流入元</th>
                      <th style={TH}>紹介元</th>
                      <th style={{ ...TH, minWidth: 180 }}>ステータス・対応</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map(r => (
                      <tr key={r.id}>
                        <td style={{ ...TD, whiteSpace: 'nowrap', fontFamily: 'Inter', color: 'var(--muted2)' }}>{fmtJst(r.created_at)}</td>
                        <td style={{ ...TD, fontWeight: 500, whiteSpace: 'nowrap' }}>{r.name || '—'}{r.kind === 'supplier' && <span style={{ fontSize: '.54rem', fontWeight: 700, color: 'var(--c-blue)', border: '0.5px solid var(--line)', borderRadius: 20, padding: '1px 7px', marginLeft: 6 }}>出品の相談</span>}</td>
                        <td style={TD}>{r.org || '—'}</td>
                        <td style={TD}>{r.expertise || '—'}</td>
                        <td style={TD}>{r.email ? <a href={`mailto:${r.email}`} style={{ color: 'var(--c-blue)' }}>{r.email}</a> : '—'}</td>
                        <td style={{ ...TD, whiteSpace: 'nowrap' }}>{r.phone ? <a href={`tel:${r.phone}`} style={{ color: 'var(--c-blue)' }}>{r.phone}</a> : '—'}</td>
                        <td style={{ ...TD, whiteSpace: 'pre-wrap', lineHeight: 1.6 }}>{r.message || '—'}</td>
                        <td style={TD}>
                          {r.consent
                            ? <span style={{ fontSize: '.6rem', fontWeight: 500, color: 'var(--green)' }}>同意</span>
                            : <span style={{ fontSize: '.6rem', color: 'var(--muted2)' }}>—</span>}
                        </td>
                        <td style={{ ...TD, color: 'var(--muted2)', fontSize: '.62rem', whiteSpace: 'nowrap' }}>{r.source || '—'}</td>
                        {/* Feature E：紹介元（招待リンク /join?ref= 経由）。非金銭・表示のみ。 */}
                        <td style={{ ...TD, whiteSpace: 'nowrap' }}>
                          {r.referrer?.profiles?.name
                            ? <span style={{ fontSize: '.64rem', fontWeight: 500 }}>{r.referrer.profiles.name}{r.referrer.code ? <span style={{ color: 'var(--muted2)', fontWeight: 400 }}> ({r.referrer.code})</span> : ''}</span>
                            : <span style={{ color: 'var(--muted)' }}>—</span>}
                        </td>
                        {/* Feature F：ステータス制（応募→面談予約→承認で招待）。承認＝招待発行（リファラルへ）。money非接触。 */}
                        <td style={TD}>
                          <ApplicationStatusCell id={r.id} status={r.status ?? (r.activated_at ? 'approved' : 'applied')} interviewAt={r.interview_at} interviewMeetUrl={r.interview_meet_url} hasReferrer={!!r.referrer_partner_id} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </ConsoleMain>
    </div>
  )
}
