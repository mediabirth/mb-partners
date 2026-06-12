import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getServicesWithMenus } from '@/lib/supabase/queries'
import ConsoleNav from '@/components/ConsoleNav'
import ServiceIcon from '@/components/ServiceIcon'

export default async function ServicesPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/console/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('name, role, color')
    .eq('id', user.id)
    .single()

  if (profile?.role === 'partner' || !profile) redirect('/console')

  const services = await getServicesWithMenus(supabase)

  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: 'var(--bg2)' }}>
      <ConsoleNav profileName={profile?.name ?? '管理者'} profileColor={profile?.color ?? '#0E0E14'} />

      <div style={{ flex: 1, marginLeft: 230 }}>
        {/* Top bar */}
        <div style={{ background: 'rgba(255,255,255,.92)', backdropFilter: 'blur(10px)', borderBottom: '1px solid var(--line)', padding: '13px 28px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', position: 'sticky', top: 0, zIndex: 30 }}>
          <h1 style={{ fontSize: '1rem', fontWeight: 900 }}>サービス・報酬ルール</h1>
          <span style={{ fontSize: '.72rem', color: 'var(--muted2)' }}>{services.length}サービス</span>
        </div>

        <div style={{ padding: '24px 28px', maxWidth: 860 }}>
          {services.length === 0 && (
            <p style={{ fontSize: '.8rem', color: 'var(--muted2)' }}>サービスがありません</p>
          )}
          {services.map(svc => (
            <div key={svc.id} style={{ background: '#fff', border: '1px solid var(--line)', borderRadius: 14, marginBottom: 14, overflow: 'hidden' }}>
              {/* Service header */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '16px 20px', borderBottom: '1px solid var(--line)' }}>
                <ServiceIcon icon={svc.icon} color={svc.color} size={44} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <b style={{ fontSize: '.9rem' }}>{svc.name}</b>
                    <span style={{ fontSize: '.6rem', fontWeight: 700, padding: '2px 8px', borderRadius: 20, background: svc.active ? '#E5F3F1' : '#F4F4F7', color: svc.active ? '#15917E' : 'var(--muted2)' }}>
                      {svc.active ? '有効' : '無効'}
                    </span>
                  </div>
                  {svc.subtitle && (
                    <div style={{ fontSize: '.66rem', color: 'var(--muted2)', marginTop: 3 }}>{svc.subtitle}</div>
                  )}
                </div>
              </div>

              {/* Menus */}
              {svc.service_menus.length > 0 && (
                <div>
                  <div style={{ padding: '10px 20px 6px', fontSize: '.62rem', fontWeight: 700, color: 'var(--muted2)', letterSpacing: '.04em' }}>
                    報酬メニュー
                  </div>
                  {svc.service_menus.map((menu, i) => (
                    <div key={menu.id} style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 12, padding: '10px 20px', borderTop: i > 0 ? '1px solid #F2F2F6' : undefined, alignItems: 'center' }}>
                      <div>
                        <div style={{ fontSize: '.78rem', fontWeight: 700 }}>{menu.name}</div>
                        {menu.example_ref && (
                          <div style={{ fontSize: '.62rem', color: 'var(--muted2)', marginTop: 2 }}>{menu.example_ref}</div>
                        )}
                      </div>
                      <div style={{ textAlign: 'right' }}>
                        <div style={{ fontSize: '.8rem', fontWeight: 800, fontFamily: 'Inter', color: 'var(--blue)' }}>
                          {menu.ref_type === 'fixed'
                            ? `¥${menu.ref_value.toLocaleString()}`
                            : `${menu.ref_value}%`}
                        </div>
                        <div style={{ fontSize: '.58rem', color: 'var(--muted2)', marginTop: 1 }}>
                          {menu.ref_type === 'fixed' ? '固定' : 'レート'}{menu.ref_trigger ? ` · ${menu.ref_trigger}` : ''}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {svc.service_menus.length === 0 && (
                <div style={{ padding: '12px 20px', fontSize: '.72rem', color: 'var(--muted2)' }}>
                  報酬メニューなし
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
