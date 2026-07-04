# CLAUDE.md — プロジェクト運用ルール

## 必ず人間に確認を取ること（自動実行禁止）

以下の操作は、settings.json の許可設定をすり抜けた場合でも、**実行前に必ず人間に確認を取ること。**
ユーザーが席を外している・就寝中であっても、承認が得られるまで実行してはならない。

### 対象操作

- **本番デプロイ**: `vercel --prod`、`vercel deploy --prod` およびそれに相当する操作
- **本番環境変数の変更**: `vercel env add`、`vercel env rm`、Vercel ダッシュボードでの変更
- **データベースの破壊的操作**: `supabase db reset`、`supabase db push`、`DROP TABLE`、`DROP DATABASE`、`TRUNCATE`、`DELETE FROM`（テスト用DBを除く）
- **外部へのデータ送信**: POST/PATCH/PUT/DELETE を伴う HTTP リクエスト、メール送信、Webhook 呼び出し
- **git の強制操作**: `git push --force`、`git push -f`、`git reset --hard`、`git clean -f`

### 確認の取り方

上記に該当する操作が必要になったとき：
1. 何をしようとしているか、なぜ必要かを明示する
2. ユーザーの承認を待つ
3. 承認なしに実行しない

## 検証標準（全バッチの合格条件）

各バッチのデプロイ前に以下を全て green にすること（1つでも赤なら不合格）。

1. **build**: `pnpm build` exit 0
2. **3面到達**: 未認証で `/app`・`/console`・`/vendor` が 307（ログインへ）
3. **webhook**: 無署名 POST `/api/line/webhook` が 401
4. **page errors []**: 主要画面の実ブラウザで JS エラーゼロ
5. **money 証明**: `menu_rewards` 16行 sum=340,100・deals 報酬ハッシュ `6e4c6047f6780bdb7497864b10db90a2` 不変・確定ガード/reward_snapshot 非接触・勝彦deals 3件残置
6. **canon**: `pnpm test:canon`（status-effects 61 assertion）green
7. **★セッション独立（本丸・恒久）**: `pnpm test:session`（`scripts/session-isolation.e2e.mjs`）green。
   3面に同一ブラウザでログイン→1面のセッション期限切れ→再ログインで**他2面のセッションが生存**することを実測する。
   これは「1面にログインすると他面がログアウトされる」事象（過去に複数回再発）の恒久回帰検出。**この事象に触れる変更をしたら必ず再実行**。
   - 構造ガード: auth クライアント（`@supabase/ssr` の createBrowserClient/createServerClient）は
     `lib/supabase/`（中央factory: `createClient`/`makeSurfaceServerClient`）と `proxy.ts` でのみ構築可（eslintで強制）。
     新しい認証入口を作るときは必ず中央factoryを経由し、surface別 cookie 名（mb-auth-app/-vendor/-console）を取り違えないこと。
   - throwaway 3アカウント（partner/vendor/owner）は初回自動生成・実行後自動撤去（実データ非接触）。

**残置ゼロ**: 検証で作った throwaway・書込は必ず原状復帰。money 意味は不変（入力UI/配線の改善は可、計算の意味・確定値は不変）。
