import { createServiceRoleClient } from '@/lib/supabase/server'

export default async function Home() {
  const supabase = await createServiceRoleClient()

  const { data: partners, error: partnerError } = await supabase
    .from('partners')
    .select('code, status, tax_type')

  const { data: services, error: serviceError } = await supabase
    .from('services')
    .select('id, name')
    .order('sort')

  const { data: deals, error: dealError } = await supabase
    .from('deals')
    .select('id, customer_name, status, amount')

  const allOk = !partnerError && !serviceError && !dealError

  return (
    <main className="p-8 font-mono text-sm">
      <h1 className="text-xl font-bold mb-2">MB Partners — Supabase 疎通確認</h1>
      <p className={`mb-6 font-bold ${allOk ? 'text-green-600' : 'text-red-600'}`}>
        {allOk ? '✓ 全テーブル接続OK' : '✗ エラーあり'}
      </p>

      <section className="mb-6">
        <h2 className="font-bold mb-2">partners ({partners?.length ?? 0}件)</h2>
        {partnerError ? (
          <p className="text-red-600">ERROR: {partnerError.message}</p>
        ) : (
          <ul>{partners?.map(p => <li key={p.code}>{p.code} / {p.status} / {p.tax_type}</li>)}</ul>
        )}
      </section>

      <section className="mb-6">
        <h2 className="font-bold mb-2">services ({services?.length ?? 0}件)</h2>
        {serviceError ? (
          <p className="text-red-600">ERROR: {serviceError.message}</p>
        ) : (
          <ul>{services?.map(s => <li key={s.id}>{s.id}: {s.name}</li>)}</ul>
        )}
      </section>

      <section className="mb-6">
        <h2 className="font-bold mb-2">deals ({deals?.length ?? 0}件)</h2>
        {dealError ? (
          <p className="text-red-600">ERROR: {dealError.message}</p>
        ) : (
          <ul>{deals?.map(d => <li key={d.id}>{d.customer_name} / {d.status} / ¥{d.amount.toLocaleString()}</li>)}</ul>
        )}
      </section>
    </main>
  )
}
