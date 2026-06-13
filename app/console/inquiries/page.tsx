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
const STATUS_COLOR: Record<string, { color: string; bg: string }> = {
  open:    { color: 'var(--amber)', bg: 'var(--amber-bg)' },
  replied: { color: 'var(--blue)',  bg: 'var(--blue-bg2)' },
  closed:  { color: 'var(--muted2)', bg: 'var(--bg2)' },
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
      <main style={{ marginLeft: 230, flex: 1, padding: '32px 32px', minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24 }}>
          <h1 style={{ fontSize: '1.25rem', fontWeight: 700 }}>問い合わせ</h1>
          {openCount > 0 && (
            <span style={{
              fontSize: '.66rem', fontWeight: 700, padding: '3px 9px', borderRadius: 20,
              color: 'var(--amber)', background: 'var(--amber-bg)',
            }}>
              未返信 {openCount}件
            </span>
          )}
        </div>

        {loading ? (
          <p style={{ color: 'var(--muted2)', fontSize: '.82rem' }}>読み込み中...</p>
        ) : inquiries.length === 0 ? (
          <p style={{ color: 'var(--muted2)', fontSize: '.82rem' }}>問い合わせはありません。</p>
        ) : (
          <div style={{ background: '#fff', border: '1px solid var(--line)', borderRadius: 13, overflow: 'hidden' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--line)', background: 'var(--bg2)' }}>
                  <th style={{ padding: '10px 14px', textAlign: 'left', fontSize: '.68rem', color: 'var(--muted2)', fontWeight: 700 }}>パートナー</th>
                  <th style={{ padding: '10px 14px', textAlign: 'left', fontSize: '.68rem', color: 'var(--muted2)', fontWeight: 700 }}>件名</th>
                  <th style={{ padding: '10px 14px', textAlign: 'left', fontSize: '.68rem', color: 'var(--muted2)', fontWeight: 700 }}>カテゴリ</th>
                  <th style={{ padding: '10px 14px', textAlign: 'left', fontSize: '.68rem', color: 'var(--muted2)', fontWeight: 700 }}>ステータス</th>
                  <th style={{ padding: '10px 14px', textAlign: 'left', fontSize: '.68rem', color: 'var(--muted2)', fontWeight: 700 }}>最終更新</th>
                  <th style={{ padding: '10px 14px', textAlign: 'left', fontSize: '.68rem', color: 'var(--muted2)', fontWeight: 700 }}></th>
                </tr>
              </thead>
              <tbody>
                {inquiries.map((inq, i) => {
                  const overSLA = isOverSLA(inq)
                  return (
                    <tr key={inq.id} style={{
                      borderBottom: i < inquiries.length - 1 ? '1px solid var(--line)' : 'none',
                      background: overSLA ? 'rgba(211,69,69,.04)' : 'transparent',
                    }}>
                      <td style={{ padding: '12px 14px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          {inq.partners?.profiles && (
                            <span style={{
                              width: 26, height: 26, borderRadius: '50%',
                              background: inq.partners.profiles.color, color: '#fff',
                              display: 'flex', alignItems: 'center', justifyContent: 'center',
                              fontSize: '.6rem', fontWeight: 700, flexShrink: 0,
                            }}>
                              {inq.partners.profiles.name[0]}
                            </span>
                          )}
                          <div>
                            <div style={{ fontSize: '.76rem', fontWeight: 700, color: 'var(--txt)' }}>
                              {inq.partners?.profiles?.name ?? '-'}
                            </div>
                            <div style={{ fontSize: '.62rem', color: 'var(--muted2)' }}>{inq.partners?.code}</div>
                          </div>
                        </div>
                      </td>
                      <td style={{ padding: '12px 14px' }}>
                        <div style={{ fontSize: '.78rem', color: 'var(--txt)', fontWeight: 600, maxWidth: 260, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {overSLA && <span style={{ color: 'var(--red)', marginRight: 4 }}>!</span>}
                          {inq.subject}
                        </div>
                        {inq.latest_message && (
                          <div style={{ fontSize: '.62rem', color: 'var(--muted2)', marginTop: 2, maxWidth: 260, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                            {inq.latest_message.body}
                          </div>
                        )}
                      </td>
                      <td style={{ padding: '12px 14px' }}>
                        <span style={{ fontSize: '.68rem', color: 'var(--muted2)' }}>
                          {CATEGORY_LABEL[inq.category] ?? inq.category}
                        </span>
                      </td>
                      <td style={{ padding: '12px 14px' }}>
                        <span style={{
                          fontSize: '.66rem', fontWeight: 700, padding: '3px 9px', borderRadius: 20,
                          color: STATUS_COLOR[inq.status]?.color ?? 'var(--muted2)',
                          background: STATUS_COLOR[inq.status]?.bg ?? 'var(--bg2)',
                        }}>
                          {STATUS_LABEL[inq.status] ?? inq.status}
                        </span>
                      </td>
                      <td style={{ padding: '12px 14px' }}>
                        <span style={{ fontSize: '.68rem', color: 'var(--muted2)' }}>
                          {new Date(inq.updated_at).toLocaleString('ja', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </td>
                      <td style={{ padding: '12px 14px' }}>
                        <Link href={`/console/inquiries/${inq.id}`} style={{
                          fontSize: '.7rem', color: 'var(--blue)', textDecoration: 'none', fontWeight: 600,
                        }}>
                          詳細 →
                        </Link>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </main>
    </div>
  )
}
