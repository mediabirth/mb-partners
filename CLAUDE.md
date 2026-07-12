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
5. **money 証明**（2026-07-11 系統連動レートP0-a承認に伴い方式改定）: 恒久不変＝報酬計算式の意味・確定ガード・reward_snapshot 非接触・勝彦deals（created_by=bfb3c027）3件。
   **バッチ開始時に以下3ハッシュをスナップショットし、CCの作業で変わっていないこと**を確認する（＝CCが金額を勝手に触っていない証明）:
   - **menu_rewards 全行ハッシュ**: `select md5(string_agg(id::text||reward_type||reward_value::text||coalesce(reward_base,'')||active::text, ',' order by id)) from menu_rewards`（サプライヤー行含む全行＝旧「16行/¥340,100」固定チェックの置換。**MB seed補助チェック**＝supplierサービス配下を除いた集計が16行/sum=340,100 であることを併記確認）
   - **deals 報酬ハッシュ**: `select md5(string_agg(reward_snapshot::text||amount::text, ',' order by id)) from deals`
   - **fee-hash（サプライヤー請求）**: `select coalesce(md5(string_agg(snapshot::text||amount::text, ',' order by id)),'(empty)') from supplier_charges`
   - **override-hash（パートナー別報酬・2026-07-12追加）**: `select coalesce(md5(string_agg(id::text||partner_id::text||coalesce(reward_id::text,'')||override_value::text||active::text, ',' order by id)),'(empty)') from partner_reward_overrides`（CCが個別条件を勝手に触っていない証明。勝彦の正当な設定操作では変わる）
   ※固定値の絶対pinはしない——勝彦/米井が製品を正当に使えば（成約・起票・メニュー追加・請求クローズ等で）自然に変わるため。変化を見たら「誰の操作か」を必ず突合する。
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

**★新画面の横断品質ゲート（恒久・2026-07-13 追加）**: 新しい面・新ページは、リリース前に次のゲートを通し、通過証跡を統合レポートに含めること——①静音（常設説明文ゼロ原則・知識はⓘ、操作の説明は操作の瞬間のみ）②平易語彙（内部語・専門語のUI出力ゼロ・copy-guideline禁止語遵守）③確立ナビ文法（二重ナビ禁止・公式ロゴ（BrandMark）ロックアップ）④ⓘ完備 ⑤ペルソナの真実（そのペルソナに嘘になる数字・文言の不在）⑥モバイル機械計測（375px溢れゼロ・44pxターゲット）。本ゲートはE2Eのcraft検査に組み込む。

**★検証メールの抑止（恒久・2026-07-12 追加）**: E2E・検証スクリプトからのメール送信は、**抑止フラグ（環境変数 `CC_MAIL_SUPPRESS=1` で lib/email・lib/notify の全送信入口が no-op）** または **内部シンク宛（@mb-system.internal のみ）** を標準とする。検証時はローカルサーバを `CC_MAIL_SUPPRESS=1` で起動すること。throwaway 宛でも実プロバイダ送信（バウンス発生）を伴う検証は、抑止が構造的に不可能な場合に限り、件数を明示して報告する。本フラグは本番には設定しない（設定＝全メール停止のため、監視Tier2が異常を検知する）。

**★PageGuide 追随（恒久・2026-07-09 追加）**: コンソール各ページのⓘ（ページガイド）内容は `lib/console-guides.ts` の構造化定数が単一ソース。**UI（要素・操作・波及・ラベル）を変更するバッチは、該当ページの PageGuide 定数を同一バッチで追随更新すること**。ガイドは実UIと1対1（存在しない機能・古い名称を書かない）。ⓘは需要時表示（押した時だけモーダル／モバイルは全画面シート）＝静音化原則を維持し、常設説明文を増やさない。

**★モーダル/シートの検証（恒久・2026-07-10 追加）**: モーダル・シート・オーバーレイ類の検証は**最長コンテンツ × 最小ビューポート（例：375×667）**で行い、上端・下端がビューポート内に収まり最下部までスクロール到達できることを**機械計測**する（目視スポットは不可）。実装は **transform中央ではなく flex/grid オーバーレイ中央**、モーダル自体が `max-height`＋内部スクロール＋ヘッダ固定。**`position:fixed` のオーバーレイは `createPortal` で body 直下に出す**こと（コンソール topbar 等の `backdrop-filter`/`transform` が包含ブロック化し、fixed が帯の中に閉じ込められて上部見切れする事故を防ぐ＝PageGuide v2 で顕在化）。

**★招待〜初回到達の検証（恒久・2026-07-11 追加）**: 招待・登録の動線を触るバッチは、**経路ごとに・クリーンプロファイルの実ブラウザで・「招待URL→登録ウィザード→完了CTA→ログイン済みダッシュボード到達」までを実測**する（セッションcookie名の確認込み・再ログインを挟ませない）。恒久マトリクス＝①通常パートナー招待 ②フロンティア招待 ③受託者（vendor）招待 ④フロンティアのセルフ招待リンク（/invite/[token]?f=） ⑤apexルート直打ち（クリーン→/login・APPセッション有→/app） ⑥consoleホスト封じ込め（console.mb-partners.app/invite等→apexへ強制）。apex上に運営コンソールへの誘導を一切置かない（RootPage/proxy）。

**★運営者実環境検証＋第5条件（恒久・2026-07-11 招待セッション事故）**: 対外動線（招待・登録・認証・cookieに触れる変更）の検証は、クリーン環境に加え**運営者実環境（コンソールにログイン済みの同一ブラウザ）**でも実測する。**自律デプロイの第5条件**＝認証・招待・登録・cookieに触れる変更は、運営者条件E2E（test:session のケース[7]）を含む session 全通過なしにデプロイ不可。実行時強制＝`lib/supabase/cookie-guard.ts`（面×cookie名の許可表・違反Set-Cookieの剥奪・Domain属性のhost-only強制）が唯一の門（server/client/proxy の setAll）に常設——外すこと自体を変更禁止とする。
