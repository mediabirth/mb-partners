import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getPartnerByUserId } from '@/lib/supabase/queries'

export default async function InboxPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const partner = await getPartnerByUserId(supabase, user.id)
  if (!partner) redirect('/login')

  const [{ data: notifications }, { data: broadcasts }] = await Promise.all([
    supabase
      .from('notifications')
      .select('id, title, body, read_at, created_at, ref')
      .eq('partner_id', partner.id)
      .order('created_at', { ascending: false })
      .limit(20),
    supabase
      .from('broadcasts')
      .select('id, kind, title, body, sent_at')
      .not('sent_at', 'is', null)
      .order('sent_at', { ascending: false })
      .limit(20),
  ])

  const unreadCount = (notifications ?? []).filter(n => !n.read_at).length

  return (
    <div>
      <div style={{ padding: '22px 20px 6px' }}>
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 4 }}>
          <h2 style={{ fontSize: '.98rem', fontWeight: 700 }}>通知</h2>
          {unreadCount > 0 && (
            <span style={{ fontSize: '.62rem', color: 'var(--blue)', fontWeight: 700 }}>未読 {unreadCount}件</span>
          )}
        </div>
      </div>

      {/* あなた宛 */}
      {(notifications ?? []).length > 0 && (
        <div>
          <p style={{ padding: '0 20px 6px', fontSize: '.5rem', fontFamily: 'Inter', fontWeight: 600, letterSpacing: '.2em', color: 'var(--muted2)', textTransform: 'uppercase' }}>
            あなた宛
          </p>
          <div>
            {(notifications ?? []).map(n => (
              <div key={n.id} style={{
                display: 'flex', gap: 12, padding: '14px 20px',
                borderBottom: '1px solid var(--line)',
                background: n.read_at ? undefined : 'var(--blue-bg2)',
              }}>
                <span style={{ width: 34, height: 34, borderRadius: '50%', background: 'var(--blue-bg)', color: 'var(--blue)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9">
                    <path d="M20 6H4l8 7 8-7zM4 6v12h16V6"/>
                  </svg>
                </span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <b style={{ fontSize: '.78rem', display: 'block', marginBottom: 2 }}>{n.title}</b>
                  {n.body && <p style={{ fontSize: '.66rem', color: 'var(--muted2)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{n.body}</p>}
                </div>
                <span style={{ fontSize: '.56rem', color: 'var(--muted)', flexShrink: 0 }}>
                  {new Date(n.created_at).toLocaleDateString('ja', { month: 'numeric', day: 'numeric' })}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* お知らせ / お役立ち */}
      {(broadcasts ?? []).length > 0 && (
        <div style={{ marginTop: 8 }}>
          <p style={{ padding: '0 20px 6px', fontSize: '.5rem', fontFamily: 'Inter', fontWeight: 600, letterSpacing: '.2em', color: 'var(--muted2)', textTransform: 'uppercase' }}>
            お知らせ・お役立ち
          </p>
          <div>
            {(broadcasts ?? []).map(b => (
              <div key={b.id} style={{ display: 'flex', gap: 12, padding: '14px 20px', borderBottom: '1px solid var(--line)', alignItems: 'flex-start' }}>
                <span style={{
                  width: 34, height: 34, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                  background: b.kind === 'news' ? 'var(--bg2)' : 'var(--amber-bg)',
                  color: b.kind === 'news' ? 'var(--muted2)' : 'var(--amber)',
                }}>
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9">
                    {b.kind === 'news'
                      ? <><path d="M4 11a9 9 0 019 9M4 4a16 16 0 0116 16"/><circle cx="5" cy="19" r="1.6"/></>
                      : <path d="M12 2l2.4 7.4H22l-6.2 4.5 2.4 7.4L12 17l-6.2 4.3 2.4-7.4L2 9.4h7.6z"/>
                    }
                  </svg>
                </span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: '.5rem', fontFamily: 'Inter', fontWeight: 600, letterSpacing: '.2em', marginBottom: 4, color: b.kind === 'news' ? 'var(--muted2)' : 'var(--amber)' }}>
                    {b.kind === 'news' ? 'NEWS' : 'TIPS'}
                  </div>
                  <b style={{ fontSize: '.78rem', display: 'block', marginBottom: 2 }}>{b.title}</b>
                  <p style={{ fontSize: '.66rem', color: 'var(--muted2)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{b.body}</p>
                </div>
                <span style={{ fontSize: '.56rem', color: 'var(--muted)', flexShrink: 0 }}>
                  {b.sent_at ? new Date(b.sent_at).toLocaleDateString('ja', { month: 'numeric', day: 'numeric' }) : ''}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {(notifications ?? []).length === 0 && (broadcasts ?? []).length === 0 && (
        <p style={{ padding: '32px 20px', fontSize: '.7rem', color: 'var(--muted2)', textAlign: 'center' }}>
          通知はありません
        </p>
      )}

      <div style={{ height: 20 }} />
    </div>
  )
}
