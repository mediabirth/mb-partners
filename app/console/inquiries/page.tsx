'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import ConsoleNav from '@/components/ConsoleNav'

type Inquiry = {
  id: string
  category: string
  subject: string
  status: string
  created_at: string
  updated_at: string
  partners: { id: string; code: string; profiles: { name: string; color: string } | null } | null
  latest_message: { body: string; sender_role: string; created_at: string } | null
}

const CATEGORY_LABEL: Record<string, string> = {
  reward: '報酬', deal: '案件', account: 'アカウント', other: 'その他',
}
const STATUS_LABEL: Record<string, string> = {
  open: '未返信', replied: '返信済', closed: 'クローズ',
}
const STATUS_COLOR: Record<string, { color: string; bg: string; dot: string }> = {
  open:    { color: 'var(--amber)', bg: 'var(--amber-bg)', dot: 'var(--amber)' },
  replied: { color: 'var(--c-blue)',  bg: 'var(--blue-bg2)', dot: 'var(--c-blue)' },
  closed:  { color: 'var(--muted2)', bg: 'var(--bg2)', dot: 'var(--muted2)' },
}
const CATEGORY_COLOR: Record<string, { color: string; bg: string }> = {
  reward:  { color: 'var(--green)', bg: 'var(--green-bg)' },
  deal:    { color: 'var(--c-blue)',  bg: 'var(--blue-bg2)' },
  account: { color: 'var(--amber)', bg: 'var(--amber-bg)' },
  other:   { color: 'var(--muted2)', bg: 'var(--bg2)' },
}

function isOverSLA(inquiry: Inquiry) {
  if (inquiry.status !== 'open') return false
  const created = new Date(inquiry.created_at).getTime()
  const now = Date.now()
  return now - created > 24 * 60 * 60 * 1000
}

export default function ConsoleInquiriesPage() {
  const [inquiries, setInquiries] = useState<Inquiry[]>([])
  const [openCount, setOpenCount] = useState(0)
  const [loading, setLoading] = useState(true)
  const [profile, setProfile] = useState<{ name: string; color: string } | null>(null)

  useEffect(() => {
    fetch('/api/console/deals')
      .then(r => r.json())
      .then(d => { if (d.profile) setProfile(d.profile) })
    fetch('/api/console/inquiries')
      .then(r => r.json())
      .then(d => {
        setInquiries(d.inquiries ?? [])
        setOpenCount(d.openCount ?? 0)
      })
      .finally(() => setLoading(false))
  }, [])

  return (
    <div style={{ display: 'flex', minHeight: '100vh' }}>
      <ConsoleNav profileName={profile?.name ?? '管理者'} profileColor={profile?.color ?? '#4733E6'} />
      <main className="page-anim" style={{ marginLeft: 230, flex: 1, padding: '32px 32px', minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24 }}>
          <h1 style={{ fontSize: '1.25rem', fontWeight: 700 }}>問い合わせ</h1>
          {openCount > 0 && (
            <span style={{
              display: 'inline-flex', alignItems: 'center', gap: 5,
              fontSize: '.66rem', fontWeight: 700, padding: '3px 10px', borderRadius: 20,
              color: 'var(--amber)', background: 'var(--amber-bg)',
            }}>
              <span className="status-dot" style={{ background: 'var(--amber)' }} />
              未返信 {openCount}件
            </span>
          )}
        </div>

        {loading ? (
          <p style={{ color: 'var(--muted2)', fontSize: '.82rem' }}>読み込み中...</p>
        ) : inquiries.length === 0 ? (
          <div style={{
            background: '#fff', border: '1px solid var(--line)', borderRadius: 13,
            padding: '48px 20px', textAlign: 'center', color: 'var(--muted2)', fontSize: '.82rem',
          }}>
            問い合わせはありません。
            <div style={{ fontSize: '.66rem', color: 'var(--muted)', marginTop: 7, lineHeight: 1.6 }}>パートナーからの新しい問い合わせがここに表示されます。</div>
          </div>
        ) : (
          <div className="stagger" style={{ display: 'flex', flexDirection: 'column', gap: 8, maxWidth: 880 }}>
            {inquiries.map((inq) => {
              const overSLA = isOverSLA(inq)
              const isUnanswered = inq.status === 'open'
              const sc = STATUS_COLOR[inq.status] ?? STATUS_COLOR.closed
              const cc = CATEGORY_COLOR[inq.category] ?? CATEGORY_COLOR.other
              return (
                <Link
                  key={inq.id}
                  href={`/console/inquiries/${inq.id}`}
                  className="card-hover lift ui-card"
                  style={{
                    display: 'flex', alignItems: 'center', gap: 13, textDecoration: 'none',
                    background: '#fff', borderRadius: 12,
                    border: '1px solid var(--line)',
                    padding: '13px 18px',
                  }}
                >
                  {/* Partner avatar */}
                  {inq.partners?.profiles && (
                    <span style={{
                      width: 38, height: 38, borderRadius: '50%',
                      background: inq.partners.profiles.color, color: '#fff',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: '.8rem', fontWeight: 700, flexShrink: 0,
                    }}>
                      {inq.partners.profiles.name[0]}
                    </span>
                  )}

                  {/* Main */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 2 }}>
                      {isUnanswered && (
                        <span className="status-dot" style={{
                          background: overSLA ? 'var(--red)' : 'var(--amber)', flexShrink: 0,
                        }} />
                      )}
                      <span style={{
                        fontSize: '.82rem', color: 'var(--txt)', fontWeight: 700, flexShrink: 0,
                      }}>
                        {inq.partners?.profiles?.name ?? '(不明)'}
                      </span>
                      <span style={{
                        fontSize: '.74rem', color: 'var(--muted)', fontWeight: 500,
                        whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', minWidth: 0,
                      }}>
                        {inq.subject}
                      </span>
                      {overSLA && (
                        <span style={{
                          fontSize: '.58rem', fontWeight: 700, padding: '1px 7px', borderRadius: 20,
                          color: 'var(--red)', background: 'var(--red-bg)', flexShrink: 0,
                        }}>
                          SLA超過
                        </span>
                      )}
                    </div>
                    {inq.latest_message && (
                      <div style={{
                        fontSize: '.66rem', color: 'var(--muted2)',
                        whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                      }}>
                        {inq.latest_message.body}
                      </div>
                    )}
                  </div>

                  {/* Category chip */}
                  <span style={{
                    fontSize: '.62rem', fontWeight: 700, padding: '3px 9px', borderRadius: 20,
                    color: cc.color, background: cc.bg, flexShrink: 0,
                  }}>
                    {CATEGORY_LABEL[inq.category] ?? inq.category}
                  </span>

                  {/* Status chip */}
                  <span style={{
                    display: 'inline-flex', alignItems: 'center', gap: 5,
                    fontSize: '.62rem', fontWeight: 700, padding: '3px 9px', borderRadius: 20,
                    color: sc.color, background: sc.bg, flexShrink: 0,
                  }}>
                    <span className="status-dot" style={{ background: sc.dot }} />
                    {STATUS_LABEL[inq.status] ?? inq.status}
                  </span>

                  {/* Last updated */}
                  <span style={{
                    fontSize: '.64rem', color: 'var(--muted2)', flexShrink: 0,
                    minWidth: 74, textAlign: 'right',
                  }}>
                    {new Date(inq.updated_at).toLocaleString('ja', { timeZone: 'Asia/Tokyo', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                  </span>
                </Link>
              )
            })}
          </div>
        )}
      </main>
    </div>
  )
}
