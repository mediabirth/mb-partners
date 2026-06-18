# 性能：1＋4（Vercel Pro前提）— 進捗＋環境ブロック報告（2026-06-16）

## 環境ブロック（致命）— 実行不能の事実報告
作業途中で **app ディレクトリ配下の `getcwd()` が EPERM（operation not permitted）** になり、`git` / `node` / `vercel` / `npm` がすべて起動時に失敗する状態になった（`/bin/pwd` は $PWD フォールバックで動くため一見成功するが、実 getcwd は不可）。
- ディレクトリの mtime が全階層 14:03 で揃っており、サンドボックス/TCC等の権限イベントが発生した模様。コード由来ではない。
- 影響：以降の **build / commit / `vercel --prod` / 検証が実行不能**。環境が回復し次第、下記「再実行手順」で完了可能。
- 本番自体は稼働中（curl: login/console/health=200）。前タスクの B1/B2/B3/B4 はデプロイ済みで有効。

## 実装状況（コードは編集・前回コミット済み。最終デプロイのみ未確認）
### 1. ウォームキープを Vercel Cron */5 に（Hobby日次フォールバック解除）
- `vercel.json` の `/api/health` cron を `*/5 * * * *` に変更（Proで分単位可）。Hobby時に入れた日次は解除。
- → 外部pinger（UptimeRobot等）は**不要**になる想定。**最小間隔の実値はデプロイ後に Vercel ダッシュボードのCron実行ログで確認が必要**（環境ブロックで未確認）。

### 4. クライアントキャッシュ＋先読み（SWR）
- `swr@2.4.1` 導入。`components/SWRProvider.tsx`（`revalidateOnFocus:true`／`revalidateOnReconnect:true`／`keepPreviousData:true`／`dedupingInterval:3000`）を **app・console 両shellに設置**。
- `refer` の `/api/services` を `useSWR`（不変マスタ＝CDNキャッシュ＋クライアントキャッシュ）。
- `console/payouts` を `useSWR`：遷移はキャッシュで即時、**focus復帰で再検証＝staleな金額を見せない**、`markPaid` 後は `mutate()` で必ず再取得。
- **金額の正本整合**：報酬（`rewards`＝SSRで常に最新）／支払（`payouts`＝SWR focus/mutate再検証）。キャッシュはプロバイダ配下のメモリ（セッション単位）、ログアウトの full reload で消去。
- `deals` ボードは mutation 箇所が多くリスクが高いため現行維持（金額は表示のみ・正本は payouts/rewards）。
- ローカル `npx next build` は **成功（BUILD OK）**、ローカル起動E2Eで refer(SWR)/payouts(SWR)/deals 正常・pageエラー0 を確認済み（デプロイ直前まで）。

### 2. Fluid Compute（勝彦操作・1手順のみ）
- Vercel ダッシュボード → プロジェクト `mb-partners` → Settings → **Functions → Fluid Compute** を有効化（Proで利用可。新規Proは既定ON）。トグルのみで関数インスタンス再利用が効く。コード側は重い初期化を持たない構成（Supabaseクライアントは軽量・per-request）なので追加変更不要。

## before / after（実測済み分）
- `/api/services`：cold **8.58s → 0.08〜0.10s**（B3 CDNキャッシュ・前タスクで実測/デプロイ済み）。アイドル初動の主因は解消済み。
- `/login`：warm 0.16〜0.22s（不変）。
- 1＋4 の追加効果（cron常時ウォーム・SWR遷移体感）は**デプロイ確認が環境ブロックで未測定**。

## 再実行手順（環境回復後・無人で完了可能）
1. `cd /Users/kmbrkthk/Desktop/mb-partners/app`（getcwd回復後）。
2. `git status` で「perf(1+4)」コミットの有無を確認（無ければ `git add -A && git commit`）。
3. `vercel --prod --yes` でデプロイ（Proなので `*/5` cron は受理される）。
4. 検証：`/api/health` 200、`/api/services` の `x-vercel-cache: HIT`、payouts/refer の遷移キャッシュ＋focus再検証、Cron実行ログで~5分間隔を確認。

## 不変性
認証フロー（getUser検証は維持）・host/role分離・frozen deal・payout/snapshot は不変。app_metadata 付与（前タスク）はmetadataのみ。SWRは読み取りキャッシュのみで書き込み経路は不変。
