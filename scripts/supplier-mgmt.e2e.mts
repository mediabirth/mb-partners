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
  if(supId){await admin.from('supplier_charges').delete().eq('supplier_partner_id',supId);await admin.from('supplier_card_events').delete().eq('supplier_partner_id',supId)}
  await admin.from('deals').delete().like('customer_name','CCE2E%')
  const {data:svc}=await admin.from('services').select('id').eq('name','CC-E2Eブランド').maybeSingle()
  if(svc){const smIds=(await admin.from('service_menus').select('id').eq('service_id',svc.id)).data?.map((x:any)=>x.id)??[]
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
console.log('[2] UI: サプライヤーに昇格（founding）')
await pg.goto(BASE+'/console/suppliers',{waitUntil:'domcontentloaded'});await pg.waitForTimeout(2500)
await pg.locator('button',{hasText:'サプライヤーに昇格'}).click();await pg.waitForTimeout(1800)
const candVal=await pg.evaluate(`(()=>{const s=document.querySelectorAll('select')[0];const o=[...(s?.options??[])].find(o=>o.text.includes('供給'));return o?o.value:''})()`) as string
ok(!!candVal,'昇格候補に出現')
await pg.locator('select').nth(0).selectOption(candVal)
await pg.locator('select').nth(1).selectOption('omnis-founding-v1')
await pg.locator('button',{hasText:'昇格する'}).click();await pg.waitForTimeout(2800)
ok(((await pg.evaluate(`document.body.innerText`)) as string).includes('ファウンディング'),'一覧にfoundingで出現')
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
  const c=await mk({menu_id:'${menuId4}',reward_type:'rate',reward_value:10,reward_base:'売上'})
  return [a,b,c]})()`) as number[]
ok(vr[0]===400&&vr[1]===400&&vr[2]===200,'継続=400・粗利%=400・受注額%=200',JSON.stringify(vr))
console.log('RESULT-B: '+pass+'/'+(pass+fail)+' pageerrors='+JSON.stringify(errs.slice(0,3)))
await b.close()
// 残置ゼロ（撤去は 系統→サプライヤー→運営 の順＝frontier_id FK）
await cleanup()
console.log('TEARDOWN: done（残置ゼロ）')
if(fail>0)process.exit(1)
