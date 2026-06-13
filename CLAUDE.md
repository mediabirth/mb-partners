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
