# CLAUDE.md — プロジェクト運用ルール

## 必ず人間に確認を取ること（自動実行禁止）

以下の操作は、settings.json の許可設定をすり抜けた場合でも、**実行前に必ず人間に確認を取ること。**
ユーザーが席を外している・就寝中であっても、承認が得られるまで実行してはならない。

### 対象操作

- **本番環境変数の変更**: `vercel env add`、`vercel env rm`、Vercel ダッシュボードでの変更
- **データベースの破壊的操作**: `supabase db reset`、`supabase db push`、`DROP TABLE`、`DROP DATABASE`、`TRUNCATE`、`DELETE FROM`（テスト用DBを除く）
- **外部へのデータ送信**: POST/PATCH/PUT/DELETE を伴う HTTP リクエスト、メール送信、Webhook 呼び出し（※検証は throwaway・顧客宛メール未入力で実送信ゼロを保つ）
- **git の強制操作**: `git push --force`、`git push -f`、`git reset --hard`、`git clean -f`

### 確認の取り方

上記に該当する操作が必要になったとき：
1. 何をしようとしているか、なぜ必要かを明示する
2. ユーザーの承認を待つ
3. 承認なしに実行しない

## 本番デプロイ（自律実行・2026-07-06 勝彦承認）

**本番デプロイ（`vercel --prod` 等）および `git push origin main` は、以下4条件を全て満たす場合に限り、都度承認なしで自律実行してよい**（通水プログラムの承認をもって恒久ルール化）。1つでも欠ければ従来どおり実行前に確認を取ること。

1. **rollbackタグ付与**: デプロイ対象の直前ベースラインに `rollback-<program>-baseline` を付す（差し戻し先を常に確保）。
2. **stamp=HEAD 実測一致**: `--build-env NEXT_PUBLIC_BUILD_SHA=<デプロイSHA>` で注入し、本番 `/app/settings` の版数stampが当該SHAと一致することを実ブラウザで確認する。
3. **回帰green**: 「検証標準」7項目（build0・3面307・webhook401・page errors[]・money証明・canon・session）が全て green。
4. **money確認**: `menu_rewards` 16行/¥340,100・勝彦deals3件・報酬ハッシュ不変を突合し、CCが金額を触っていないことを証明。

上記を満たさない本番デプロイ、および本番環境変数変更・DB破壊操作・外部実送信・git強制操作は、引き続き人間確認必須（このルールは deploy/push のみを対象とし、他項目の自律化ではない）。

## 検証標準（全バッチの合格条件）

各バッチのデプロイ前に以下を全て green にすること（1つでも赤なら不合格）。

1. **build**: `pnpm build` exit 0
2. **3面到達**: 未認証で `/app`・`/console`・`/vendor` が 307（ログインへ）
3. **webhook**: 無署名 POST `/api/line/webhook` が 401
4. **page errors []**: 主要画面の実ブラウザで JS エラーゼロ
5. **money 証明**: 恒久不変＝`menu_rewards` 16行 sum=340,100・報酬計算式の意味・確定ガード・reward_snapshot 非接触・勝彦deals（created_by=bfb3c027）3件。
   deals 報酬ハッシュ（`select md5(string_agg(reward_snapshot::text||amount::text, ',' order by id)) from deals`）は
   **バッチ開始時にスナップショットし、CC の作業でそれが変わっていないこと**を確認する（＝CCが金額を勝手に触っていない証明）。
   ※固定値の絶対pinはしない——勝彦/米井が製品を正当に使えば（成約・起票等で）自然に変わるため。変化を見たら「誰の操作か」を必ず突合する。
6. **canon**: `pnpm test:canon`（status-effects 61 assertion）green

**★公開ページの本番検証（2026-07-07 追加・/partners 404 事故の再発防止）**:
公開URL（`/partners`・`/r/`・`/join`・`/legal` 等、未認証で見せる面）を「動いた」と判定するときは、必ず **本番エイリアスドメイン `https://mb-partners.app/...`**（デプロイ直URL `*.vercel.app` でも localhost でもない）に対して、**①`curl -sI`（キャッシュ無効ヘッダ）で 200 を確認、②Service Worker をブロックした新規ブラウザ（`serviceWorkers:'block'`＝シークレット相当・キャッシュ無**）で 200＋実描画をスクショ確認、③デプロイ直後は CDN 伝播ラグと端末側 SW キャッシュを疑い、cache-busting クエリで複数回叩いて一貫 200 を確認** の3点を満たすこと。
※ 事故の穴: デプロイ直後に温まった1拠点から alias を1回叩いて 200 を得ても、他エッジの伝播ラグや端末の旧 SW/キャッシュで 404 になり得る。公開面のデプロイでは SW の `CACHE_NAME` を bump して端末側の旧キャッシュ更新を促すこと。
7. **★セッション独立（本丸・恒久）**: `pnpm test:session`（`scripts/session-isolation.e2e.mjs`）green。
   3面に同一ブラウザでログイン→1面のセッション期限切れ→再ログインで**他2面のセッションが生存**することを実測する。
   これは「1面にログインすると他面がログアウトされる」事象（過去に複数回再発）の恒久回帰検出。**この事象に触れる変更をしたら必ず再実行**。
   - 構造ガード: auth クライアント（`@supabase/ssr` の createBrowserClient/createServerClient）は
     `lib/supabase/`（中央factory: `createClient`/`makeSurfaceServerClient`）と `proxy.ts` でのみ構築可（eslintで強制）。
     新しい認証入口を作るときは必ず中央factoryを経由し、surface別 cookie 名（mb-auth-app/-vendor/-console）を取り違えないこと。
   - throwaway 3アカウント（partner/vendor/owner）は初回自動生成・実行後自動撤去（実データ非接触）。

**残置ゼロ**: 検証で作った throwaway・書込は必ず原状復帰。money 意味は不変（入力UI/配線の改善は可、計算の意味・確定値は不変）。

**★PageGuide 追随（恒久・2026-07-09 追加）**: コンソール各ページのⓘ（ページガイド）内容は `lib/console-guides.ts` の構造化定数が単一ソース。**UI（要素・操作・波及・ラベル）を変更するバッチは、該当ページの PageGuide 定数を同一バッチで追随更新すること**。ガイドは実UIと1対1（存在しない機能・古い名称を書かない）。ⓘは需要時表示（押した時だけモーダル／モバイルは全画面シート）＝静音化原則を維持し、常設説明文を増やさない。
