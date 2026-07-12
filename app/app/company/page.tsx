import { redirect } from 'next/navigation'
// v2(2026-07-13): 会社の中身は 商品/お金/設定 に分割済み。
export default function CompanyRedirect() { redirect('/app') }
