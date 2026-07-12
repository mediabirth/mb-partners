import FrontierSection from '../dashboard/FrontierSection'
import { redirect } from 'next/navigation'
import { createClient, getCachedUser } from '@/lib/supabase/server'
// 網の詳細（チーム・マイルストーン・招待）。ホームの網ヒーロー/網の動きからの遷移先。
export default async function FrontierDetailPage() {
  const user = await getCachedUser()
  if (!user) redirect('/login')
  const supabase = await createClient()
  const { data: me } = await supabase.from('partners').select('is_frontier').eq('profile_id', user.id).maybeSingle()
  if (!me?.is_frontier) redirect('/app')
  return (
    <div className="page-anim" style={{ paddingBottom: 8 }}>
      <h2 style={{ fontSize: '.92rem', fontWeight: 500, margin: '18px 20px 0' }}>あなたの網</h2>
      <FrontierSection />
    </div>
  )
}
