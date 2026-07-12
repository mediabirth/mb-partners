import { readFileSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'
import { chromium, type Page } from 'playwright'
const env=Object.fromEntries(readFileSync('.env.local','utf8').split('\n').filter(l=>l.includes('=')).map(l=>{const i=l.indexOf('=');return[l.slice(0,i).trim(),l.slice(i+1).trim()]}))
const admin=createClient(env.NEXT_PUBLIC_SUPABASE_URL!,env.SUPABASE_SERVICE_ROLE_KEY!,{auth:{persistSession:false}})
const BASE='http://localhost:4599', PW='CcSup!2026xx'
const OWNER='cc-sup-owner@mb-system.internal', SUPMAIL='cc-sup-corp@mb-system.internal', LINMAIL='cc-sup-lin@mb-system.internal'
let pass=0,fail=0; const ok=(c:boolean,n:string,d='')=>{c?(pass++,console.log('  ✓',n)):(fail++,console.log('  ✗',n,d))}
async function pidOf(email:string){const {data:pr}=await admin.from('profiles').select('id').eq('email',email).maybeSingle()
  if(!pr)return null; const {data:pa}=await admin.from('partners').select('id').eq('profile_id',pr.id).maybeSingle(); return pa?.id??null}
async function cleanup(){
  const supId=await pidOf(SUPMAIL)
  if(supId){await admin.from('supplier_charges').delete().eq('supplier_partner_id',supId);await admin.from('supplier_card_events').delete().eq('supplier_partner_id',supId);await admin.from('partner_reward_overrides').delete().eq('supplier_partner_id',supId);await admin.from('supplier_change_requests').delete().eq('supplier_partner_id',supId)}
  await admin.from('deals').delete().like('customer_name','CCE2E%')
  const {data:svc}=await admin.from('services').select('id').eq('name','CC-E2Eブランド').maybeSingle()
  if(svc){await admin.from('audit_logs').delete().eq('category','supplier_self').like('target','%'+svc.id+'%').then(()=>{},()=>{})
    const smIds=(await admin.from('service_menus').select('id').eq('service_id',svc.id)).data?.map((x:any)=>x.id)??[]
    if(smIds.length){const mIds=(await admin.from('menus').select('id').in('service_menu_id',smIds)).data?.map((x:any)=>x.id)??[]
      if(mIds.length){await admin.from('menu_rewards').delete().in('menu_id',mIds);await admin.from('menus').delete().in('id',mIds)}
      await admin.from('service_menus').delete().in('id',smIds)}
    await admin.from('services').delete().eq('id',svc.id)}
  const {data:l}=await admin.auth.admin.listUsers()
  for(const em of [LINMAIL,SUPMAIL,OWNER]){const u=(l?.users||[]).find((x:any)=>x.email===em)
    if(u){await admin.from('partners').delete().eq('profile_id',u.id);await admin.from('audit_logs').delete().eq('actor_profile_id',u.id).then(()=>{},()=>{});await admin.from('profiles').delete().eq('id',u.id);await admin.auth.admin.deleteUser(u.id).catch(()=>{})}
    await admin.from('invites').delete().eq('email',em)}
}
await cleanup()
const c=await admin.auth.admin.createUser({email:OWNER,password:PW,email_confirm:true,app_metadata:{role:'owner'}})
await admin.from('profiles').upsert({id:c.data!.user!.id,name:'CS運営',role:'owner',email:OWNER,color:'#888'})

const b=await chromium.launch()
const ctx=await b.newContext({viewport:{width:1440,height:900}})
ctx.on('page',p=>{p.on('dialog',d=>d.accept().catch(()=>{}));p.on('pageerror',e=>errs.push(p.url()+': '+e.message))})
const errs:string[]=[]
const pg=await ctx.newPage()
async function login(p:Page,email:string,path:string){await p.goto(BASE+path,{waitUntil:'domcontentloaded'});await p.waitForTimeout(1500)
  if(!(await p.locator('input[type="email"]').count())){return} // 登録直後などセッション既存→そのまま
  await p.locator('input[type="email"]').fill(email);await p.locator('input[type="password"]').fill(PW)
  await p.locator('button[type="submit"]').first().click();await p.waitForTimeout(2800)}
async function wizard(p:Page,last:string){
  await p.locator('input[type="password"]').nth(0).fill(PW);await p.locator('input[type="password"]').nth(1).fill(PW)
  await p.locator('button',{hasText:'次へ'}).click();await p.waitForTimeout(400)
  await p.locator('input[placeholder="山田"]').fill(last);await p.locator('input[placeholder="太郎"]').fill('検証')
  await p.locator('input[placeholder="09012345678"]').fill('09000000000');await p.locator('input[placeholder*="大阪府"]').fill('大阪府吹田市1-1-1')
  await p.locator('button',{hasText:'次へ'}).click();await p.waitForTimeout(400)
  await p.locator('button',{hasText:'自由入力'}).click();await p.waitForTimeout(300)
  await p.locator('input[placeholder*="信用金庫"]').fill('検証銀行');await p.locator('input[placeholder="例：本店"]').fill('本店')
  await p.locator('input[placeholder="1234567"]').fill('1234567');await p.locator('input[placeholder*="ヤマダ"]').fill('ケンショウ')
  await p.locator('button',{hasText:'次へ'}).click();await p.waitForTimeout(400)
  const cbs=p.locator('input[type="checkbox"]');for(let i=0;i<await cbs.count();i++){if(!(await cbs.nth(i).isChecked()))await cbs.nth(i).check()}
  await p.locator('button',{hasText:'登録を完了する'}).click();await p.waitForTimeout(7000)}
async function inviteViaUI(kind:'frontier'|'partner',email:string){
  await pg.goto(BASE+'/console/partners/invite',{waitUntil:'domcontentloaded'});await pg.waitForTimeout(1500)
  if(kind==='frontier')await pg.locator('button',{hasText:'フロンティア'}).first().click().catch(()=>{})
  await pg.locator('input[type="email"]').fill(email)
  await pg.locator('button',{hasText:'招待リンクを作成'}).click();await pg.waitForTimeout(3000)
  return await pg.evaluate(`(document.body.innerText.match(/https?:\\/\\/[^\\s]+\\/invite\\/[a-z0-9-]+[^\\s]*/)||[''])[0]`) as string}
async function registerVia(url:string,last:string){const p=await ctx.newPage()
  await p.goto(url.replace(/https?:\/\/[^/]+/,BASE),{waitUntil:'domcontentloaded'});await p.waitForTimeout(2000)
  await wizard(p,last); const done=(await p.locator('text=登録が完了しました').count())>0; await p.close(); return done}
// 案件を成約まで進める（コンソールUI）
async function confirmDeal(name:string,revenue?:string){
  await pg.goto(BASE+'/console/deals',{waitUntil:'domcontentloaded'});await pg.waitForTimeout(3000)
  await pg.locator(`text=${name}`).first().click();await pg.waitForTimeout(1200)
  const cta1=pg.locator('button',{hasText:'商談中へ'})
  if(await cta1.count()){await cta1.first().click();await pg.waitForTimeout(600)
    await pg.locator('button',{hasText:'実行する'}).click();await pg.waitForTimeout(1500)}
  await pg.locator('button',{hasText:'成約にする'}).first().click();await pg.waitForTimeout(900)
  if(revenue){const rin=pg.locator('input[inputmode="numeric"]:visible')
    if(await rin.count())await rin.first().fill(revenue)}
  const dlgBtn=pg.locator('button',{hasText:'成約にする'}).last()
  await dlgBtn.click();await pg.waitForTimeout(2200)
  await pg.keyboard.press('Escape');await pg.waitForTimeout(500)}
async function referAs(p:Page,cust:string){
  await p.goto(BASE+'/app/refer',{waitUntil:'domcontentloaded'});await p.waitForTimeout(3000)
  await p.locator('text=CC-E2Eブランド').first().click();await p.waitForTimeout(900)
  await p.locator('button',{hasText:'CC-E2Eメニュー'}).first().click();await p.waitForTimeout(1000)
  await p.locator('input').first().fill(cust) // 氏名（form先頭）
  const tel=p.locator('input[inputmode="tel"], input[type="tel"]')
  if(await tel.count())await tel.first().fill('09011112222')
  else await p.locator('input').nth(1).fill('09011112222')
  const consent=p.locator('#consent'); if(await consent.count()&&!(await consent.isChecked()))await consent.check()
  await p.locator('button',{hasText:'紹介する'}).click();await p.waitForTimeout(3500)
  const txt=await p.evaluate(`document.body.innerText`) as string
  return txt}

console.log('[1] UI: フロンティア招待→登録（供給会社）')
await login(pg,OWNER,'/console/login')
const u1=await inviteViaUI('frontier',SUPMAIL); ok(!!u1,'招待リンク表示(供給)')
ok(await registerVia(u1,'供給'),'供給会社の登録完走')
console.log('[1.5] ペルソナ: 昇格前=フロンティアのホーム（網ヒーロー・商品なし）')
{
  const c15=await b.newContext({viewport:{width:390,height:800}})
  const p15=await c15.newPage()
  await p15.goto(BASE+'/app/login',{waitUntil:'domcontentloaded'});await p15.waitForTimeout(1200)
  await p15.locator('input[type="email"]').fill(SUPMAIL);await p15.locator('input[type="password"]').fill(PW)
  await p15.locator('button[type="submit"]').first().click();await p15.waitForTimeout(3500)
  await p15.goto(BASE+'/app',{waitUntil:'domcontentloaded'});await p15.waitForTimeout(3000)
  const t15=await p15.evaluate(`document.body.innerText`) as string
  ok(t15.includes('あなたの網 — 今月の還元')&&t15.includes('リファラルを招待'),'昇格前: 網ヒーロー＋招待アクション')
  ok(!t15.includes('今月の全体像')&&!t15.includes('商品'),'昇格前: ミニコンソール要素なし')
  ok(t15.includes('確定残高')||t15.includes('最初のご案内'),'昇格前: 従来の紹介コンテンツが下に続く')
  await c15.close()
}
console.log('[2] UI: サプライヤーに昇格（founding）')
await pg.goto(BASE+'/console/suppliers',{waitUntil:'domcontentloaded'});await pg.waitForTimeout(2500)
await pg.locator('button',{hasText:'サプライヤーに昇格'}).click();await pg.waitForTimeout(1800)
const candVal=await pg.evaluate(`(()=>{const s=document.querySelectorAll('select')[0];const o=[...(s?.options??[])].find(o=>o.text.includes('供給'));return o?o.value:''})()`) as string
ok(!!candVal,'昇格候補に出現')
await pg.locator('select').nth(0).selectOption(candVal)
await pg.locator('select').nth(1).selectOption('omnis-founding-v1')
await pg.locator('button',{hasText:'昇格する'}).click();await pg.waitForTimeout(2800)
ok(((await pg.evaluate(`document.body.innerText`)) as string).includes('ファウンディング'),'一覧にfoundingで出現')
{
  const c25=await b.newContext({viewport:{width:390,height:800}})
  const p25=await c25.newPage(); const e25:string[]=[]; p25.on('pageerror',e=>e25.push(e.message))
  await p25.goto(BASE+'/app/login',{waitUntil:'domcontentloaded'});await p25.waitForTimeout(1200)
  await p25.locator('input[type="email"]').fill(SUPMAIL);await p25.locator('input[type="password"]').fill(PW)
  await p25.locator('button[type="submit"]').first().click();await p25.waitForTimeout(3500)
  await p25.goto(BASE+'/app',{waitUntil:'domcontentloaded'});await p25.waitForTimeout(3000)
  const t25=await p25.evaluate(`document.body.innerText`) as string
  ok(t25.includes('今月の成約受注額')&&t25.includes('今月のお支払い見込み'),'昇格直後: サプライヤー・コンソールへ切替（ゼロ状態）')
  ok((await p25.locator('button[aria-label="メニュー"]').count())>0,'昇格直後: SPドロワー（ハンバーガー）')
  ok(e25.length===0,'昇格直後: ゼロ状態 pageerrors=[]',JSON.stringify(e25))
  await c25.close()
}
console.log('[3] UI: ブランド作成＋供給元結線＋メニュー＋fixed報酬(警告)')
await pg.goto(BASE+'/console/services',{waitUntil:'domcontentloaded'});await pg.waitForTimeout(2500)
await pg.locator('button',{hasText:'サービス追加'}).click();await pg.waitForTimeout(1500)
await pg.locator('input[placeholder="MOOM"]').fill('CC-E2Eブランド')
await pg.locator('button',{hasText:'保存する'}).last().click();await pg.waitForTimeout(3000)
// 編集モード継続→供給元select出現
const supSet=await pg.evaluate(`(async()=>{const sels=[...document.querySelectorAll('select')];for(const s of sels){const o=[...s.options].find(o=>o.text.includes('供給 検証'));if(o){const set=Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype,'value').set;set.call(s,o.value);s.dispatchEvent(new Event('change',{bubbles:true}));return true}}return false})()`)
ok(!!supSet,'供給元selectでサプライヤー選択（即時PATCH）')
await pg.waitForTimeout(1800)
await pg.locator('button',{hasText:'メニュー追加'}).click();await pg.waitForTimeout(800)
await pg.locator('input[placeholder="メニュー名"]').fill('CC-E2Eメニュー')
await pg.locator('input[placeholder="30000"]').first().fill('10000')
// トーストは成功トーストに即置換されうる→MutationObserverで全出現テキストを確定捕捉
await pg.evaluate(`(()=>{window.__tlog=[];new MutationObserver(ms=>{for(const m of ms){if(m.type==='characterData'){const t=(m.target.textContent||'').trim();if(t)window.__tlog.push(t)}for(const n of m.addedNodes){const t=(n.textContent||'').trim();if(t)window.__tlog.push(t)}}}).observe(document.body,{childList:true,subtree:true,characterData:true})})()`)
await pg.locator('button',{hasText:'保存する'}).last().click();await pg.waitForTimeout(4000)
const tlog=await pg.evaluate(`(window.__tlog||[]).join('|')`) as string
ok(/50%枠|可能性/.test(tlog),'逆ザヤfixed警告がトースト表示',tlog.slice(0,160))
const {data:brand}=await admin.from('services').select('id, supplier_partner_id, active').eq('name','CC-E2Eブランド').maybeSingle()
const supId=await pidOf(SUPMAIL)
ok(!!brand&&brand.supplier_partner_id===supId,'services.supplier_partner_id 結線=UI操作のみで成立')
console.log('[4] UI: 系統パートナー招待→登録→系統外案件(折半)→成約')
const u2=await inviteViaUI('partner',LINMAIL); ok(!!u2,'招待リンク表示(系統用)')
ok(await registerVia(u2,'系統'),'系統パートナー登録完走')
const lin=await ctx.newPage(); await login(lin,LINMAIL,'/app/login')
const r1=await referAs(lin,'CCE2E-A'); ok(/案件|ありがとう|完了|受け付け/.test(r1),'系統外の紹介送信(deal1)',r1.slice(0,80))
await confirmDeal('CCE2E-A','200000')
const {data:d1}=await admin.from('deals').select('id, status, amount, fee_snapshot').eq('customer_name','CCE2E-A').maybeSingle()
ok(d1?.status==='confirmed','deal1成約(UI)',JSON.stringify(d1?.status))
ok(d1?.fee_snapshot?.rate_kind==='half_commission'&&Number(d1?.fee_snapshot?.rate)===0.5&&d1?.fee_snapshot?.rate_card_version==='omnis-founding-v1','fee_snapshot=折半50%/founding',JSON.stringify(d1?.fee_snapshot))
console.log('[5] UI: フロンティア紐づけ→系統内案件(月額/0)→成約')
const linId=await pidOf(LINMAIL)
await pg.goto(BASE+'/console/partners/'+linId,{waitUntil:'domcontentloaded'});await pg.waitForTimeout(2500)
const fset=await pg.evaluate(`(()=>{const sels=[...document.querySelectorAll('select')];for(const s of sels){const o=[...s.options].find(o=>o.text.includes('供給 検証'));if(o){const set=Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype,'value').set;set.call(s,o.value);s.dispatchEvent(new Event('change',{bubbles:true}));return true}}return false})()`)
ok(!!fset,'フロンティア紐づけselect=UI操作')
await pg.waitForTimeout(1800)
const r2=await referAs(lin,'CCE2E-B'); ok(/案件|ありがとう|完了|受け付け/.test(r2),'系統内の紹介送信(deal2)')
await confirmDeal('CCE2E-B')
const {data:d2}=await admin.from('deals').select('id, status, fee_snapshot').eq('customer_name','CCE2E-B').maybeSingle()
ok(d2?.status==='confirmed','deal2成約(UI)')
ok(d2?.fee_snapshot?.self_service===true&&d2?.fee_snapshot?.rate_kind==='omnis_monthly','fee_snapshot=系統内→月額(per-deal 0)',JSON.stringify(d2?.fee_snapshot))
console.log('RESULT-A: '+pass+'/'+(pass+fail)+' errors='+JSON.stringify(errs.slice(0,3)))
if(fail>0)process.exit(1)

console.log('[6] UI: 受注額入力(ドロワー)→月次クローズ→請求出現（月額50,000＋折半）')
// fixed案件の成約ダイアログは売上を取らない→ドロワーの受注額インライン入力（明細1件）で入れる＝実運用と同じ操作
await pg.goto(BASE+'/console/deals',{waitUntil:'domcontentloaded'});await pg.waitForTimeout(3000)
await pg.locator('text=CCE2E-A').first().click();await pg.waitForTimeout(1500)
const revIn=pg.locator('input[placeholder="未入力"]')
ok(await revIn.count()>0,'ドロワーに受注額入力欄')
await revIn.first().fill('200000');await pg.keyboard.press('Tab');await pg.waitForTimeout(2000)
const {data:di1}=await admin.from('deal_items').select('revenue').eq('deal_id',d1!.id)
ok(Number(di1?.[0]?.revenue)===200000,'受注額200,000保存(UI)',JSON.stringify(di1))
await pg.keyboard.press('Escape');await pg.waitForTimeout(500)
await pg.goto(BASE+'/console/supplier-charges',{waitUntil:'domcontentloaded'});await pg.waitForTimeout(2500)
const supSel=await pg.evaluate(`(()=>{const sels=[...document.querySelectorAll('select')];for(const s of sels){const o=[...s.options].find(o=>o.text.includes('供給'));if(o){const set=Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype,'value').set;set.call(s,o.value);s.dispatchEvent(new Event('change',{bubbles:true}));return true}}return false})()`)
ok(!!supSel,'請求ページでサプライヤー選択')
await pg.waitForTimeout(1200)
// 既定は前月→案件帰属月（当月）に合わせて締める
const ym=new Date().toISOString().slice(0,7)
await pg.locator('input[type="month"]').fill(ym);await pg.waitForTimeout(600)
await pg.locator('button',{hasText:'プレビュー'}).click();await pg.waitForTimeout(2200)
const prevTxt=await pg.evaluate(`document.body.innerText`) as string
ok(prevTxt.includes('50,000'),'プレビューに月額¥50,000',prevTxt.slice(0,0))
ok(prevTxt.includes('100,000'),'プレビューに折半¥100,000(=200,000×50%)')
await pg.locator('button',{hasText:'この月を締める（凍結）'}).click();await pg.waitForTimeout(3000)
const {data:chg}=await admin.from('supplier_charges').select('kind, amount, deal_id').eq('supplier_partner_id',supId)
const half=chg?.find((x:any)=>x.kind==='half_commission'); const mon=chg?.find((x:any)=>x.kind==='omnis_monthly')
ok(Number(half?.amount)===100000,'凍結: 折半100,000',JSON.stringify(chg))
ok(Number(mon?.amount)===50000,'凍結: 月額50,000')
const frozenHash=JSON.stringify((chg??[]).map((x:any)=>[x.kind,x.amount]).sort())
console.log('[7] UI: サプライヤー詳細=請求/系統/ブランド表示→カード付け替え(standard-v2)')
await pg.goto(BASE+'/console/suppliers/'+supId,{waitUntil:'domcontentloaded'});await pg.waitForTimeout(3000)
const detTxt=await pg.evaluate(`document.body.innerText`) as string
ok(detTxt.includes('CC-E2Eブランド'),'詳細: 供給ブランド表示')
ok(detTxt.includes('150,000')||detTxt.includes('100,000'),'詳細: 請求金額表示',detTxt.slice(0,0))
const cardSet=await pg.evaluate(`(()=>{const sels=[...document.querySelectorAll('select')];for(const s of sels){const o=[...s.options].find(o=>o.value==='standard-v2');if(o){const set=Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype,'value').set;set.call(s,'standard-v2');s.dispatchEvent(new Event('change',{bubbles:true}));return true}}return false})()`)
// 付け替えは選択→「付け替える」ボタン想定。ボタンがあれば押す
await pg.waitForTimeout(600)
await pg.locator('button',{hasText:'付け替える'}).click()
await pg.waitForTimeout(2500)
const {data:supRow}=await admin.from('partners').select('supplier_rate_card').eq('id',supId).maybeSingle()
ok(supRow?.supplier_rate_card==='standard-v2','カード付け替え=UI操作でstandard-v2へ',JSON.stringify(supRow))
const {data:ev}=await admin.from('supplier_card_events').select('event, from_card, to_card').eq('supplier_partner_id',supId).order('created_at')
ok((ev??[]).some((x:any)=>x.event==='card_changed'&&x.from_card==='omnis-founding-v1'&&x.to_card==='standard-v2'),'履歴: card_changed記録',JSON.stringify(ev))
console.log('[8] 以後のみ新カード: deal3(系統内)→決済5%・凍結分は不変')
const r3=await referAs(lin,'CCE2E-C'); ok(/案件|ありがとう|完了|受け付け/.test(r3),'付け替え後の紹介送信(deal3)')
await confirmDeal('CCE2E-C')
const {data:d3}=await admin.from('deals').select('fee_snapshot, status').eq('customer_name','CCE2E-C').maybeSingle()
ok(d3?.fee_snapshot?.rate_kind==='payment_fee_5'&&Number(d3?.fee_snapshot?.rate)===0.05&&d3?.fee_snapshot?.rate_card_version==='standard-v2','deal3=新カード(決済5%/standard-v2＝系統内は決済5%)',JSON.stringify(d3?.fee_snapshot))
const {data:d2b}=await admin.from('deals').select('fee_snapshot').eq('customer_name','CCE2E-B').maybeSingle()
ok(d2b?.fee_snapshot?.rate_kind==='omnis_monthly'&&d2b?.fee_snapshot?.rate_card_version==='omnis-founding-v1','deal2の凍結条件は不変(旧カードのまま)')
const {data:chg2}=await admin.from('supplier_charges').select('kind, amount').eq('supplier_partner_id',supId)
ok(JSON.stringify((chg2??[]).map((x:any)=>[x.kind,x.amount]).sort())===frozenHash,'凍結済みsupplier_chargesは不変')
console.log('[9] immutable: rate-cards PATCH/DELETE→405（コンソールUIセッションから実測）')
const codes=await pg.evaluate(`(async()=>{const a=await fetch('/api/console/rate-cards',{method:'PATCH',headers:{'content-type':'application/json'},body:'{}'});const b=await fetch('/api/console/rate-cards',{method:'DELETE'});return [a.status,b.status]})()`) as number[]
ok(codes[0]===405&&codes[1]===405,'PATCH/DELETE=405(不変版方式)',JSON.stringify(codes))
console.log('[10] 面公開禁止: partner面innerTextにfee/supplier語ゼロ')
let leak=''
for(const path of ['/app','/app/refer','/app/rewards']){await lin.goto(BASE+path,{waitUntil:'domcontentloaded'});await lin.waitForTimeout(2200)
  const t=await lin.evaluate(`document.body.innerText`) as string
  for(const w of ['サプライヤー','レートカード','折半','override','決済手数料','月額50,000'])if(t.includes(w))leak+=path+':'+w+' '}
ok(leak==='','partner面にサプライヤー/レート情報ゼロ',leak)
console.log('[11] 停止/再開・ブランド解除/再結線（詳細ページUI）')
await pg.goto(BASE+'/console/suppliers/'+supId,{waitUntil:'domcontentloaded'});await pg.waitForTimeout(2500)
await pg.locator('button',{hasText:'契約を停止する'}).click();await pg.waitForTimeout(2000)
const {data:pSus}=await admin.from('partners').select('status').eq('id',supId).maybeSingle()
ok(pSus?.status==='suspended','契約停止=UI',JSON.stringify(pSus))
await pg.locator('button',{hasText:'契約を再開する'}).click();await pg.waitForTimeout(2000)
const {data:pRes0}=await admin.from('partners').select('status').eq('id',supId).maybeSingle()
// ブランド解除→再結線（詳細UI）
await pg.locator('button',{hasText:'結線を解除'}).first().click();await pg.waitForTimeout(2200)
const {data:bDet}=await admin.from('services').select('supplier_partner_id').eq('name','CC-E2Eブランド').maybeSingle()
ok(bDet?.supplier_partner_id==null,'ブランド結線解除=UI',JSON.stringify(bDet))
const reSel=await pg.evaluate(`(()=>{const sels=[...document.querySelectorAll('select')];for(const s of sels){const o=[...s.options].find(o=>o.text.includes('CC-E2Eブランド'));if(o){const set=Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype,'value').set;set.call(s,o.value);s.dispatchEvent(new Event('change',{bubbles:true}));return true}}return false})()`)
ok(!!reSel,'再結線: ブランド選択')
await pg.waitForTimeout(400)
await pg.locator('button',{hasText:'結線'}).last().click();await pg.waitForTimeout(2200)
const {data:bRe}=await admin.from('services').select('supplier_partner_id').eq('name','CC-E2Eブランド').maybeSingle()
ok(bRe?.supplier_partner_id===supId,'ブランド再結線=UI')
const {data:pRes}=await admin.from('partners').select('status').eq('id',supId).maybeSingle()
ok(pRes?.status==='active','契約再開=UI')
console.log('[12] standard-v2: 系統外=パススルー満額＋受注額5%請求（I-2）')
// LINのフロンティアを外して系統外に戻す（パートナー詳細UI＝「なし」を選択）
await pg.goto(BASE+'/console/partners/'+linId,{waitUntil:'domcontentloaded'});await pg.waitForTimeout(2500)
const unset=await pg.evaluate(`(()=>{const sels=[...document.querySelectorAll('select')];for(const s of sels){const o=[...s.options].find(o=>o.value===''&&o.text.includes('なし'));if(o&&[...s.options].some(x=>x.text.includes('供給'))){const set=Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype,'value').set;set.call(s,'');s.dispatchEvent(new Event('change',{bubbles:true}));return true}}return false})()`)
ok(!!unset,'フロンティア紐づけ解除=UI');await pg.waitForTimeout(1800)
const r4=await referAs(lin,'CCE2E-D'); ok(/案件|ありがとう|完了|受け付け/.test(r4),'系統外の紹介送信(deal4)')
await confirmDeal('CCE2E-D')
const {data:d4}=await admin.from('deals').select('id, amount, status, fee_snapshot').eq('customer_name','CCE2E-D').maybeSingle()
ok(d4?.status==='confirmed','deal4成約(UI)')
ok(d4?.fee_snapshot?.rate_kind==='passthrough_revenue_fee'&&Number(d4?.fee_snapshot?.rate)===0.05&&d4?.fee_snapshot?.rate_card_version==='standard-v2','deal4=パススルー+受注額5%(standard-v2)',JSON.stringify(d4?.fee_snapshot))
ok(Number(d4?.amount)===10000,'パートナー報酬はパススルー満額（メニュー設定¥10,000のまま）',JSON.stringify(d4?.amount))
// 受注額入力（ドロワー）→再クローズ→passthrough行が出現・既凍結行は不変
for(let att=0;att<3;att++){
  await pg.goto(BASE+'/console/deals',{waitUntil:'domcontentloaded'});await pg.waitForTimeout(3000)
  await pg.locator('text=CCE2E-D').first().click();await pg.waitForTimeout(1800)
  const rin4=pg.locator('input[placeholder="未入力"]')
  if(!(await rin4.count())){console.log('   受注額入力欄なし(att'+att+')');continue}
  await rin4.first().fill('300000');await pg.keyboard.press('Tab');await pg.waitForTimeout(2200)
  await pg.keyboard.press('Escape');await pg.waitForTimeout(500)
  const {data:di4}=await admin.from('deal_items').select('revenue').eq('deal_id',d4!.id)
  if(Number(di4?.[0]?.revenue)===300000)break
  console.log('   受注額未保存(att'+att+'):',JSON.stringify(di4))
}
const {data:di4f}=await admin.from('deal_items').select('revenue').eq('deal_id',d4!.id)
ok(Number(di4f?.[0]?.revenue)===300000,'deal4受注額300,000保存(UI)',JSON.stringify(di4f))
const preCnt=(await admin.from('supplier_charges').select('id',{count:'exact',head:true}).eq('supplier_partner_id',supId)).count
await pg.goto(BASE+'/console/supplier-charges',{waitUntil:'domcontentloaded'});await pg.waitForTimeout(2500)
await pg.evaluate(`(()=>{const sels=[...document.querySelectorAll('select')];for(const s of sels){const o=[...s.options].find(o=>o.text.includes('供給'));if(o){const set=Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype,'value').set;set.call(s,o.value);s.dispatchEvent(new Event('change',{bubbles:true}));return true}}return false})()`)
await pg.waitForTimeout(1000)
await pg.locator('input[type="month"]').fill(ym);await pg.waitForTimeout(600)
const dbg=await pg.evaluate(`fetch('/api/console/supplier-charges?supplier=${supId}&period=${ym}').then(r=>r.json()).then(j=>JSON.stringify((j.preview&&j.preview.rows||[]).map(x=>[x.kind,x.amount])))`) as string
ok(dbg.includes('passthrough_revenue_fee')&&dbg.includes('15000'),'プレビュー: 販売手数料15,000(=300,000×5%)',dbg)
ok(dbg.includes('payment_fee_5')&&dbg.includes('500'),'プレビュー: deal3決済手数料500(=10,000×5%)')
await pg.locator('button',{hasText:'プレビュー'}).click();await pg.waitForTimeout(2200)
await pg.locator('button',{hasText:'この月を締める（凍結）'}).click();await pg.waitForTimeout(3000)
const {data:chg3}=await admin.from('supplier_charges').select('kind, amount, deal_id').eq('supplier_partner_id',supId)
const pt=chg3?.find((x:any)=>x.kind==='passthrough_revenue_fee')
ok(Number(pt?.amount)===15000,'再クローズ: 販売手数料¥15,000(=300,000×5%)出現',JSON.stringify(chg3))
const newKinds=new Set(['passthrough_revenue_fee','payment_fee_5'])
ok(JSON.stringify((chg3??[]).filter((x:any)=>!newKinds.has(x.kind)).map((x:any)=>[x.kind,x.amount]).sort())===frozenHash,'既凍結行（月額/折半）は不変')
ok((chg3??[]).some((x:any)=>x.kind==='payment_fee_5'&&Number(x.amount)===500),'再クローズ: deal3決済手数料¥500も凍結')
console.log('[13] standard-v2: 報酬型バリデーション（固定/受注額%のみ）')
const menuId4=(await admin.from('menus').select('id').eq('name','CC-E2Eメニュー').maybeSingle()).data?.id
const vr=await pg.evaluate(`(async()=>{const mk=(b)=>fetch('/api/console/menu-rewards',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(b)}).then(r=>r.status)
  const a=await mk({menu_id:'${menuId4}',reward_type:'continuous',reward_value:10})
  const b=await mk({menu_id:'${menuId4}',reward_type:'rate',reward_value:10,reward_base:'粗利'})
  const c=await mk({menu_id:'${menuId4}',reward_type:'rate',reward_value:10,reward_base:'売上',sort:5})
  return [a,b,c]})()`) as number[]
ok(vr[0]===400&&vr[1]===400&&vr[2]===200,'継続=400・粗利%=400・受注額%=200',JSON.stringify(vr))
console.log('[14] サプライヤーポータル（/app/supplier）表示・データ境界・ビューポート')
// SUP本人（別コンテキスト＝LINセッションと分離）
for(const vp of [{width:375,height:667},{width:1024,height:768}]){
  const sctx=await b.newContext({viewport:vp}); sctx.on('page',p=>{p.on('dialog',d=>d.accept().catch(()=>{}));p.on('pageerror',e=>errs.push('portal'+vp.width+': '+e.message))})
  const sp=await sctx.newPage()
  await sp.goto(BASE+'/app/login',{waitUntil:'domcontentloaded'});await sp.waitForTimeout(1200)
  await sp.locator('input[type="email"]').fill(SUPMAIL);await sp.locator('input[type="password"]').fill(PW)
  await sp.locator('button[type="submit"]').first().click();await sp.waitForTimeout(3000)
  await sp.goto(BASE+'/app/supplier',{waitUntil:'domcontentloaded'});await sp.waitForTimeout(2800)
  if(vp.width===375)ok(/\/app\/?$/.test(sp.url())||sp.url().endsWith('/app'),'[375] 旧URL /app/supplier→ホーム（ミニコンソール）へ',sp.url())
  const t=await sp.evaluate(`document.body.innerText`) as string
  if(vp.width===375){
    ok(t.includes('今月の成約受注額')&&t.includes('進行中の案件')&&t.includes('網（配下と還元）')&&t.includes('今月のお支払い見込み'),'[375] コンソールホーム: 数字4枚')
    ok(t.includes('要対応')&&t.includes('最近の動き'),'[375] 要対応＋最近の動き')
    ok(t.includes('リファラルを招待')&&t.includes('紹介する'),'[375] 主アクション（招待/紹介）')
    // ドロワーでナビ全項目
    await sp.locator('button[aria-label="メニュー"]').click();await sp.waitForTimeout(600)
    const dt=await sp.evaluate(`document.body.innerText`) as string
    ok(dt.includes('網（リファラル）')&&dt.includes('商品')&&dt.includes('案件')&&dt.includes('お金')&&dt.includes('設定'),'[375] ドロワー: ナビ全項目（網は上位）')
    await sp.locator('button[aria-label="閉じる"]').click();await sp.waitForTimeout(400)
    ok(t.includes('CCE2E-A')&&t.includes('CC-E2Eブランド'),'[375] ポータル: 自社案件表示')
    await sp.goto(BASE+'/app/s/money',{waitUntil:'domcontentloaded'});await sp.waitForTimeout(2800)
    const tm=await sp.evaluate(`document.body.innerText`) as string
    ok(tm.includes('払う（MBへ）')&&tm.includes('もらう（あなたへ）'),'[375] お金: 払う/もらう分離')
    ok(tm.includes('販売手数料（受注額5%）')&&tm.includes('15,000'),'[375] お金: 販売手数料15,000（単一ソース）')
    ok(tm.includes('月額（プラン基本料）')&&tm.includes('50,000'),'[375] お金: 月額50,000（履歴）')
    ok(tm.includes('締め済み・請求書待ち'),'[375] お金: 対外語彙')
    ok(tm.includes('委託先への支払い'),'[375] お金: 委託サマリ')
    ok(!tm.includes('unbilled')&&!tm.includes('invoiced')&&!tm.includes('settled'),'[375] お金: 内部語彙ゼロ')
    const tAll=t+tm
    ok(!tAll.includes('オムニス')&&!tAll.includes('ZZ6153'),'[375] 他サプライヤー情報ゼロ（home/money）')
    ok((await sp.evaluate(`document.documentElement.scrollWidth`) as number)<=375,'[375] お金: 溢れゼロ')
    await sp.goto(BASE+'/app/s/deals',{waitUntil:'domcontentloaded'});await sp.waitForTimeout(2800)
    const td=await sp.evaluate(`document.body.innerText`) as string
    ok(td.includes('CCE2E-A')&&td.includes('あなたの網')&&td.includes('MB側'),'[375] 案件: テーブル＋紹介系統表示')
    await sp.goto(BASE+'/app/s/network',{waitUntil:'domcontentloaded'});await sp.waitForTimeout(2800)
    ok(((await sp.evaluate(`document.body.innerText`)) as string).includes('リファラルを招待（最優先）'),'[375] 網: 招待リンク最上部')
    await sp.goto(BASE+'/app',{waitUntil:'domcontentloaded'});await sp.waitForTimeout(2000)
  }
  ok((await sp.evaluate(`document.documentElement.scrollWidth`) as number)<=vp.width,'['+vp.width+'] ポータル: 横はみ出しなし')
  if(vp.width===375){
    // mypage 出し分けカード
    await sp.goto(BASE+'/app/mypage',{waitUntil:'domcontentloaded'});await sp.waitForTimeout(2200)
    const mt=await sp.evaluate(`document.body.innerText`) as string
    ok(!mt.includes('サプライヤー ポータル')&&!mt.includes('フロンティア ダッシュボード')&&!mt.includes('会社・網・紹介の成果'),'[375] mypage: 役割導線カード撤去（ホームが役割適応）')
  }
  await sctx.close()
}
// データ境界: 非サプライヤー（LIN）の直打ち→/appへ（役割パターンa: リファラルのみ）
await lin.goto(BASE+'/app/supplier',{waitUntil:'domcontentloaded'});await lin.waitForTimeout(2200)
ok(!lin.url().includes('/app/supplier')&&!lin.url().includes('/app/dashboard'),'パターンa: リファラルのみ→/appへ（旧URLもダッシュボードも不可）',lin.url())
const lint=await lin.evaluate(`document.body.innerText`) as string
ok(!lint.includes('サプライヤー ポータル'),'非サプライヤーのmypage系にポータル語なし（この画面）')
console.log('[15] パートナー別報酬率P1: 設定UI・リスク①・4象限・fail-safe・境界・監査')
// 対象報酬（fixed 10000）と受注額10%（[13]でPOST済み）のid
const {data:mrows}=await admin.from('menu_rewards').select('id, reward_type, reward_value, reward_base').eq('menu_id',menuId4).order('sort')
const fixedR=(mrows??[]).find((x:any)=>x.reward_type==='fixed')
const rateR=(mrows??[]).find((x:any)=>x.reward_type==='rate'&&x.reward_base==='売上')
ok(!!fixedR&&!!rateR,'対象報酬（fixed/受注額%）が存在')
// a. 詳細ページに個別条件セクション＋UIで設定（LIN×fixed→15000）
await pg.goto(BASE+'/console/suppliers/'+supId,{waitUntil:'domcontentloaded'});await pg.waitForTimeout(3000)
ok(((await pg.evaluate(`document.body.innerText`)) as string).includes('個別条件'),'詳細: 個別条件セクション表示')
const uiSet=await pg.evaluate(`(async()=>{
  const sels=[...document.querySelectorAll('select')]
  const pSel=sels.find(s=>[...s.options].some(o=>o.text.includes('系統 検証')))
  const tSel=sels.find(s=>[...s.options].some(o=>o.text.startsWith('全メニュー')))
  if(!pSel||!tSel)return 'select不在'
  const set=Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype,'value').set
  const pOpt=[...pSel.options].find(o=>o.text.includes('系統 検証'))
  set.call(pSel,pOpt.value);pSel.dispatchEvent(new Event('change',{bubbles:true}))
  const tOpt=[...tSel.options].find(o=>o.text.includes('固定'))
  set.call(tSel,tOpt.value);tSel.dispatchEvent(new Event('change',{bubbles:true}))
  const inp=[...document.querySelectorAll('input')].find(i=>i.placeholder==='値')
  const iset=Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,'value').set
  iset.call(inp,'15000');inp.dispatchEvent(new Event('input',{bubbles:true}))
  return 'ok'})()`) as string
ok(uiSet==='ok','設定フォーム入力',uiSet)
const ovResp:string[]=[]
const onResp=async(r:any)=>{if(r.url().includes('reward-overrides')&&r.request().method()==='POST')ovResp.push(r.status()+':'+(await r.text().catch(()=>'')).slice(0,200))}
pg.on('response',onResp)
await pg.evaluate(`(()=>{const btns=[...document.querySelectorAll('button')].filter(b=>b.textContent.trim()==='設定');const b=btns[btns.length-1];if(b)b.click();return btns.length})()`)
await pg.waitForTimeout(2800)
pg.off('response',onResp)
if(ovResp.length)console.log('   POST resp:',ovResp.join(' | '))
else console.log('   POST未発火。note圏:',(((await pg.evaluate(`document.body.innerText`)) as string).match(/個別条件[\s\S]{0,200}/)?.[0]??'').replace(/\n/g,'/').slice(0,200))
const {data:ov1}=await admin.from('partner_reward_overrides').select('id, override_value, reward_id, active').eq('supplier_partner_id',supId).eq('partner_id',linId).eq('reward_id',fixedR!.id).maybeSingle()
ok(Number(ov1?.override_value)===15000&&ov1?.active===true,'UI設定: override行（fixed 15000）',JSON.stringify(ov1))
// b. ガード実測（本人拒否・fixed範囲・rate>100）
const gcodes=await pg.evaluate(`(async()=>{const mk=(b)=>fetch('/api/console/reward-overrides',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(b)}).then(r=>r.status)
  const a=await mk({supplier_partner_id:'${supId}',partner_id:'${supId}',reward_id:'${fixedR!.id}',override_value:20000})
  const b2=await mk({supplier_partner_id:'${supId}',partner_id:'${linId}',reward_id:'${rateR!.id}',override_value:150})
  const c2=await mk({supplier_partner_id:'${supId}',partner_id:'${linId}',reward_id:null,override_value:0})
  return [a,b2,c2]})()`) as number[]
ok(gcodes[0]===400&&gcodes[1]===400&&gcodes[2]===400,'ガード: 本人拒否400・率150%→400・率0→400',JSON.stringify(gcodes))
// c. ★リスク①: override付き案件が確定・支払を跨いで個別率を維持
const r5=await referAs(lin,'CCE2E-E'); ok(/案件|ありがとう|完了|受け付け/.test(r5),'override有の紹介送信(deal5)')
const {data:d5a}=await admin.from('deals').select('id, amount, reward_snapshot').eq('customer_name','CCE2E-E').maybeSingle()
ok(Number(d5a?.amount)===15000&&Number(d5a?.reward_snapshot?.override_applied?.original_value)===10000,'deal5作成: amount=15000・override_applied焼き込み',JSON.stringify({a:d5a?.amount,ov:d5a?.reward_snapshot?.override_applied}))
// メニュー正典を12000へ変更（確定がliveを読む旧枝なら12000に戻るはず）
const p12=await pg.evaluate(`fetch('/api/console/menu-rewards/${fixedR!.id}',{method:'PATCH',headers:{'content-type':'application/json'},body:JSON.stringify({reward_value:12000})}).then(async r=>r.status+':'+(await r.text()).slice(0,120))`)
console.log('   menu→12000:',p12)
await pg.waitForTimeout(800)
await confirmDeal('CCE2E-E')
const {data:d5b}=await admin.from('deals').select('amount, status').eq('customer_name','CCE2E-E').maybeSingle()
ok(d5b?.status==='confirmed'&&Number(d5b?.amount)===15000,'★リスク①: 確定を跨いで15000維持（正典12000に戻らない）',JSON.stringify(d5b))
await pg.goto(BASE+'/console/deals',{waitUntil:'domcontentloaded'});await pg.waitForTimeout(3000)
await pg.locator('text=CCE2E-E').first().click();await pg.waitForTimeout(1200)
await pg.locator('button',{hasText:'支払済にする'}).first().click();await pg.waitForTimeout(700)
await pg.locator('button',{hasText:'実行する'}).click();await pg.waitForTimeout(1800)
await pg.keyboard.press('Escape');await pg.waitForTimeout(400)
const {data:d5c}=await admin.from('deals').select('amount, status').eq('customer_name','CCE2E-E').maybeSingle()
ok(d5c?.status==='paid'&&Number(d5c?.amount)===15000,'★リスク①: 支払済まで15000維持')
// d. 対比（override無し案件は従来どおりmenuライブ枝＝挙動不変の証明）
await pg.goto(BASE+'/console/suppliers/'+supId,{waitUntil:'domcontentloaded'});await pg.waitForTimeout(2500)
await pg.locator('button',{hasText:'停止'}).last().click();await pg.waitForTimeout(2000)
const {data:ov1b}=ov1?await admin.from('partner_reward_overrides').select('active').eq('id',ov1.id).maybeSingle():{data:null}
ok(ov1b?.active===false,'UI停止: active=false（無効化は削除でなくフラグ）')
const r6=await referAs(lin,'CCE2E-F'); ok(/案件|ありがとう|完了|受け付け/.test(r6),'override停止後の紹介送信(deal6)')
const {data:d6a}=await admin.from('deals').select('amount, reward_snapshot').eq('customer_name','CCE2E-F').maybeSingle()
ok(Number(d6a?.amount)===12000&&!d6a?.reward_snapshot?.override_applied,'deal6作成: 正典12000（fail-safe方向＝停止で正典へ）',JSON.stringify({a:d6a?.amount,ov:!!d6a?.reward_snapshot?.override_applied}))
const p13=await pg.evaluate(`fetch('/api/console/menu-rewards/${fixedR!.id}',{method:'PATCH',headers:{'content-type':'application/json'},body:JSON.stringify({reward_value:13000})}).then(async r=>r.status+':'+(await r.text()).slice(0,120))`)
console.log('   menu→13000:',p13)
await pg.waitForTimeout(800)
await confirmDeal('CCE2E-F')
const {data:d6b}=await admin.from('deals').select('amount').eq('customer_name','CCE2E-F').maybeSingle()
// 対比: override無し案件も従来どおり作成時凍結（menuを13000に変えても確定で12000のまま＝既存挙動が不変）
ok(Number(d6b?.amount)===12000,'対比: override無し案件は作成時正典12000のまま（menu変更13000が波及しない=従来挙動不変）',JSON.stringify(d6b))
// e. 再開＋全メニュー上書き（率25%）→本人表示・境界
await pg.goto(BASE+'/console/suppliers/'+supId,{waitUntil:'domcontentloaded'});await pg.waitForTimeout(2500)
await pg.locator('button',{hasText:'再開'}).last().click();await pg.waitForTimeout(2000)
const allCode=await pg.evaluate(`fetch('/api/console/reward-overrides',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({supplier_partner_id:'${supId}',partner_id:'${linId}',reward_id:null,override_value:25})}).then(r=>r.status)`) as number
ok(allCode===200,'全メニュー上書き（率25%）設定=200')
const myOv=await lin.evaluate(`fetch('/api/my-reward-overrides').then(r=>r.json())`) as any
ok(Number(Object.values(myOv.byReward??{})[0])===15000&&Number(Object.values(myOv.bySupplier??{})[0])===25,'本人差分API: byReward=15000/bySupplier=25',JSON.stringify(myOv).slice(0,120))
await lin.goto(BASE+'/app/refer',{waitUntil:'domcontentloaded'});await lin.waitForTimeout(3000)
await lin.locator('text=CC-E2Eブランド').first().click();await lin.waitForTimeout(1000)
const linTxt=await lin.evaluate(`document.body.innerText`) as string
ok(linTxt.includes('15,000'),'本人表示: fixed=個別値¥15,000（メニュー行ピル）',linTxt.match(/¥[\d,]+|受注額[^\n]{0,12}/g)?.slice(0,8).join('|')??'')
ok(!linTxt.includes('13,000'),'本人表示: 正典13,000は出ない（fixedはexact優先）')
// 受注額%への全メニュー上書きは解決関数の実測で確認（メニュー行ピルは先頭報酬のみ表示のため）
const { resolveEffectiveReward: rer } = await import('../lib/reward-override')
const effRate=await rer(admin as any,{partnerId:linId!,reward:{id:rateR!.id,menu_id:menuId4!,reward_type:'rate',reward_value:10}})
ok(effRate.value===25&&effRate.overridden===true,'全メニュー上書き: 受注額%の有効値=25（解決関数実測）',JSON.stringify(effRate))
// 他パートナー（サプライヤー本人＝別コンテキストでAPPログイン）には正典のみ
const octx=await b.newContext({viewport:{width:1024,height:768}})
const supApp=await octx.newPage()
await supApp.goto(BASE+'/app/login',{waitUntil:'domcontentloaded'});await supApp.waitForTimeout(1200)
await supApp.locator('input[type="email"]').fill(SUPMAIL);await supApp.locator('input[type="password"]').fill(PW)
await supApp.locator('button[type="submit"]').first().click();await supApp.waitForTimeout(3000)
await supApp.goto(BASE+'/app/refer',{waitUntil:'domcontentloaded'});await supApp.waitForTimeout(3000)
await supApp.locator('text=CC-E2Eブランド').first().click().catch(()=>{});await supApp.waitForTimeout(1000)
const supTxt=await supApp.evaluate(`document.body.innerText`) as string
ok(!supTxt.includes('15,000')&&!supTxt.includes('の25%'),'他者表示: 個別値15,000/25%が漏れない',supTxt.match(/受注額[^\n]*|13,000|15,000/g)?.join('|')??'')
ok(supTxt.includes('13,000')||supTxt.includes('受注額（税抜）の10%'),'他者表示: 正典値のみ')
await octx.close()
// f. 折半カード下の50%硬上限（カード付け替え→率60拒否・率30許可）
await pg.goto(BASE+'/console/suppliers/'+supId,{waitUntil:'domcontentloaded'});await pg.waitForTimeout(2500)
await pg.evaluate(`(()=>{const sels=[...document.querySelectorAll('select')];for(const s of sels){const o=[...s.options].find(o=>o.value==='omnis-founding-v1');if(o){const set=Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype,'value').set;set.call(s,'omnis-founding-v1');s.dispatchEvent(new Event('change',{bubbles:true}));return true}}return false})()`)
await pg.waitForTimeout(500)
await pg.locator('button',{hasText:'付け替える'}).click();await pg.waitForTimeout(2500)
const halfCodes=await pg.evaluate(`(async()=>{const mk=(v)=>fetch('/api/console/reward-overrides',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({supplier_partner_id:'${supId}',partner_id:'${linId}',reward_id:'${rateR!.id}',override_value:v})}).then(r=>r.status)
  return [await mk(60), await mk(30)]})()`) as number[]
ok(halfCodes[0]===400&&halfCodes[1]===200,'折半カード: 率60→400（50%硬上限）・率30→200',JSON.stringify(halfCodes))
// g. fail-safe（解決関数に壊れたDBを渡す→正典値へ）
const { resolveEffectiveReward } = await import('../lib/reward-override')
const broken={from:()=>{throw new Error('db down')}} as any
const fs1=await resolveEffectiveReward(broken,{partnerId:linId,reward:{id:fixedR!.id,menu_id:menuId4,reward_type:'fixed',reward_value:13000}})
ok(fs1.value===13000&&fs1.overridden===false,'fail-safe: 解決失敗→正典値13000で継続')
// h. 監査ログ
const {count:ac}=await admin.from('audit_logs').select('id',{count:'exact',head:true}).eq('category','reward_override')
ok((ac??0)>=5,'audit_logs: reward_override記録（create/停止/再開/全メニュー/折半）',String(ac))
console.log('[16] 役割パターンb: フロンティアのみ（②なし・③④あり）')
await pg.goto(BASE+'/console/partners/'+linId,{waitUntil:'domcontentloaded'});await pg.waitForTimeout(2500)
await pg.locator('button',{hasText:'フロンティア'}).first().click();await pg.waitForTimeout(1800)
await lin.goto(BASE+'/app/dashboard',{waitUntil:'domcontentloaded'});await lin.waitForTimeout(2800)
ok(!lin.url().includes('/app/dashboard'),'パターンb: /app/dashboard廃止→ホームへ',lin.url())
await lin.goto(BASE+'/app',{waitUntil:'domcontentloaded'});await lin.waitForTimeout(3000)
const pb=await lin.evaluate(`document.body.innerText`) as string
ok(pb.includes('あなたの網 — 今月の還元'),'パターンb: ホーム上部が網ヒーロー')
ok(!pb.includes('今月の成約受注額')&&!pb.includes('お支払い見込み'),'パターンb: サプライヤー・コンソール要素なし')
ok(pb.includes('確定残高')||pb.includes('最初のご案内'),'パターンb: 従来の紹介コンテンツ併存')
await pg.goto(BASE+'/console/partners/'+linId,{waitUntil:'domcontentloaded'});await pg.waitForTimeout(2500)
await pg.locator('button',{hasText:'通常パートナー'}).first().click();await pg.waitForTimeout(1800)

console.log('[17] サプライヤー自己設定（即時/申請/境界）')
const octx2=await b.newContext({viewport:{width:1024,height:800}})
octx2.on('page',p=>p.on('dialog',d=>d.accept().catch(()=>{})))
const sp2=await octx2.newPage()
await sp2.goto(BASE+'/app/login',{waitUntil:'domcontentloaded'});await sp2.waitForTimeout(1200)
await sp2.locator('input[type="email"]').fill(SUPMAIL);await sp2.locator('input[type="password"]').fill(PW)
await sp2.locator('button[type="submit"]').first().click();await sp2.waitForTimeout(3000)
const selfData=await sp2.evaluate(`fetch('/api/supplier/self').then(r=>r.json())`) as any
ok((selfData.brands??[]).some((x:any)=>x.name==='CC-E2Eブランド'),'self GET: 自社ブランドのみ取得',JSON.stringify((selfData.brands??[]).map((x:any)=>x.name)))
ok(!JSON.stringify(selfData).includes('オムニス'),'self GET: 他社ブランド混入ゼロ')
// 即時: 報酬 fixed 13000→11000
const rw=await sp2.evaluate(`fetch('/api/supplier/self',{method:'PATCH',headers:{'content-type':'application/json'},body:JSON.stringify({reward_id:'${fixedR!.id}',reward_value:11000})}).then(r=>r.status)`) as number
const {data:rwRow}=await admin.from('menu_rewards').select('reward_value').eq('id',fixedR!.id).single()
ok(rw===200&&Number(rwRow!.reward_value)===11000,'即時: 報酬額 本人変更→反映',JSON.stringify({rw,v:rwRow?.reward_value}))
// ガード: 率150→400
const rg=await sp2.evaluate(`fetch('/api/supplier/self',{method:'PATCH',headers:{'content-type':'application/json'},body:JSON.stringify({reward_id:'${rateR!.id}',reward_value:150})}).then(r=>r.status)`) as number
ok(rg===400,'ガード: 率150%→400')
// 即時: メモ
const {data:svcRow}=await admin.from('services').select('id').eq('name','CC-E2Eブランド').single()
const mm=await sp2.evaluate(`fetch('/api/supplier/self',{method:'PATCH',headers:{'content-type':'application/json'},body:JSON.stringify({service_id:'${svcRow!.id}',supplier_memo:'8月から料金改定予定（デモ）'})}).then(r=>r.status)`) as number
const {data:memoRow}=await admin.from('services').select('supplier_memo').eq('id',svcRow!.id).single()
ok(mm===200&&memoRow!.supplier_memo==='8月から料金改定予定（デモ）','即時: 社内メモ反映')
const {count:selfAudit}=await admin.from('audit_logs').select('id',{count:'exact',head:true}).eq('category','supplier_self')
ok((selfAudit??0)>=2,'監査: supplier_self記録',String(selfAudit))
// 申請2件（説明・メニュー名）
const rq1=await sp2.evaluate(`fetch('/api/supplier/self',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({kind:'public_description',service_id:'${svcRow!.id}',menu_id:'${menuId4}',value:'住まいのご相談を、専門スタッフが丁寧に承ります。（デモ申請）'})}).then(r=>r.json())`) as any
const rq2=await sp2.evaluate(`fetch('/api/supplier/self',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({kind:'menu_name',service_id:'${svcRow!.id}',menu_id:'${menuId4}',value:'CC-E2Eメニュー改'})}).then(r=>r.json())`) as any
ok(rq1.status==='pending'&&rq2.status==='pending','申請2件=pending')
// コンソール: 承認キュー表示→説明を承認
await pg.goto(BASE+'/console/suppliers/'+supId,{waitUntil:'domcontentloaded'});await pg.waitForTimeout(3000)
const qt=await pg.evaluate(`document.body.innerText`) as string
ok(qt.includes('変更申請')&&qt.includes('顧客向け説明')&&qt.includes('メニュー名'),'コンソール: 承認キューに2件')
const ap1=await pg.evaluate(`fetch('/api/console/supplier-requests',{method:'PATCH',headers:{'content-type':'application/json'},body:JSON.stringify({id:'${rq1.id}',action:'approve'})}).then(r=>r.status)`) as number
const {data:mrow}=await admin.from('menus').select('public_description, name').eq('id',menuId4!).single()
ok(ap1===200&&(mrow!.public_description??'').includes('専門スタッフ'),'承認→顧客向け説明が反映')
// 却下（理由つき）→非反映
const rj=await pg.evaluate(`fetch('/api/console/supplier-requests',{method:'PATCH',headers:{'content-type':'application/json'},body:JSON.stringify({id:'${rq2.id}',action:'reject',reason:'ブランド表記ルールに合わないため'})}).then(r=>r.status)`) as number
const {data:mrow2}=await admin.from('menus').select('name').eq('id',menuId4!).single()
ok(rj===200&&mrow2!.name==='CC-E2Eメニュー','却下→メニュー名は非反映')
const selfAfter=await sp2.evaluate(`fetch('/api/supplier/self').then(r=>r.json())`) as any
ok(JSON.stringify(selfAfter.requests).includes('ブランド表記ルール'),'本人側: 見送り理由が見える')
// 境界: 非サプライヤー403・他社報酬403
const lf=await lin.evaluate(`fetch('/api/supplier/self').then(r=>r.status)`) as number
ok(lf===403,'境界: 非サプライヤーGET=403')
const {data:omniR}=await admin.from('menu_rewards').select('id').eq('menu_id','2fc3bc0d-cc7b-4c5d-bd78-d02d751427a2').limit(1).maybeSingle()
if(omniR){const cx=await sp2.evaluate(`fetch('/api/supplier/self',{method:'PATCH',headers:{'content-type':'application/json'},body:JSON.stringify({reward_id:'${omniR.id}',reward_value:9999})}).then(r=>r.status)`) as number
ok(cx===403,'境界: 他社（オムニス）報酬PATCH=403',String(cx))}
await octx2.close()

console.log('[18] 受注額の本人入力→折半計算→請求反映（一気通貫・折半カード下）')
const r7=await referAs(lin,'CCE2E-G'); ok(/案件|ありがとう|完了|受け付け/.test(r7),'折半カード下の紹介送信(deal7)')
await confirmDeal('CCE2E-G')
const {data:d7}=await admin.from('deals').select('id, status, fee_snapshot').eq('customer_name','CCE2E-G').maybeSingle()
ok(d7?.status==='confirmed'&&d7?.fee_snapshot?.rate_kind==='half_commission','deal7=折半条件で成約',JSON.stringify(d7?.fee_snapshot?.rate_kind))
// サプライヤー本人が /app/s/deals で受注額入力
const rctx=await b.newContext({viewport:{width:1200,height:800}})
rctx.on('page',p=>p.on('dialog',d=>d.accept().catch(()=>{})))
const rp2=await rctx.newPage()
await rp2.goto(BASE+'/app/login',{waitUntil:'domcontentloaded'});await rp2.waitForTimeout(1200)
await rp2.locator('input[type="email"]').fill(SUPMAIL);await rp2.locator('input[type="password"]').fill(PW)
await rp2.locator('button[type="submit"]').first().click();await rp2.waitForTimeout(3000)
await rp2.goto(BASE+'/app/s/deals',{waitUntil:'domcontentloaded'});await rp2.waitForTimeout(3000)
ok((await rp2.locator('.sup-side').first().isVisible().catch(()=>false)),'PC: 固定サイドバー表示（≥1024）')
const row=rp2.locator('tr',{hasText:'CCE2E-G'})
await row.locator('input[inputmode="numeric"]').fill('400000')
await row.locator('button',{hasText:'保存'}).click();await rp2.waitForTimeout(2500)
const {data:d7i}=await admin.from('deal_items').select('revenue').eq('deal_id',d7!.id)
ok(Number(d7i?.[0]?.revenue)===400000,'本人入力: 受注額400,000保存',JSON.stringify(d7i))
const {data:ev7}=await admin.from('deal_events').select('body').eq('deal_id',d7!.id).like('body','%サプライヤー本人が入力%')
ok((ev7??[]).length===1&&ev7![0].body.includes('¥400,000'),'出所: コンソール案件タイムラインに「サプライヤー本人が入力」')
const {count:ra}=await admin.from('audit_logs').select('id',{count:'exact',head:true}).eq('category','supplier_self').like('target','deal-revenue:%')
ok((ra??0)>=1,'監査: deal-revenue記録')
// 折半計算→請求反映（プレビュー=請求と同一計算・お金ページにも同数字）
const {rows:pv7}=await (await import('../lib/supplier-charges')).computeCharges(admin as any,supId!,ym)
const half7=(pv7 as any[]).find(r=>r.deal_id===d7!.id)
ok(Number(half7?.amount)===200000,'折半計算: 400,000×50%=200,000（単一ソース関数）',JSON.stringify(half7?.amount))
await rp2.goto(BASE+'/app/s/money',{waitUntil:'domcontentloaded'});await rp2.waitForTimeout(3000)
ok(((await rp2.evaluate(`document.body.innerText`)) as string).includes('200,000'),'お金ページ: 折半200,000が見込みに出現')
// 境界: 他社案件への受注額入力=403
const {data:omniDeal}=await admin.from('deals').select('id').eq('service_id','omnis').limit(1).maybeSingle()
if(omniDeal){const bx=await rp2.evaluate(`fetch('/api/supplier/self',{method:'PATCH',headers:{'content-type':'application/json'},body:JSON.stringify({deal_id:'${omniDeal.id}',revenue:1})}).then(r=>r.status)`) as number
ok(bx===403,'境界: 他社案件への受注額入力=403',String(bx))}
await rctx.close()

console.log('RESULT-B: '+pass+'/'+(pass+fail)+' pageerrors='+JSON.stringify(errs.slice(0,3)))
await b.close()
// 残置ゼロ（撤去は 系統→サプライヤー→運営 の順＝frontier_id FK）
await cleanup()
console.log('TEARDOWN: done（残置ゼロ）')
if(fail>0)process.exit(1)
