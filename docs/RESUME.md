# MB Partners — 開発記録 / RESUME（リポ内正本）

> 2026-07-23 より、開発の裁定・バッチ記録はこのファイルが正本（コードと同じコミットで文脈を残す）。
> それ以前の全履歴（2026-06-12〜07-23・432k字）は Notion「MB Partners — 引き継ぎ / RESUME (2026-06-21)」を歴史書庫として凍結参照。
> 規律の正典は [CLAUDE.md](../CLAUDE.md)（money 4ハッシュ・自律デプロイ5条件・品質ゲート7項目・凍結思想・検証資産分類）。

## 体制（2026-07-23〜）

- 勝彦＝株式会社Media Birth代表・最終決定者・実機審判。
- Claude Code（Opus/Fable セッション）＝開発リード：設計・裁定・Codexへの指示発行・レポートレビュー・記録。
- Codex（GPT-5）＝実装者。指示は1バッチ=1ミッション=1コードブロック。完了時に統合レポート全文を受領しレビュー。
- money域は二段階（read-only設計書→勝彦承認→実装）。

## 現在の本番状態

- HEAD: `31ec7bd`(+docs) ＝ 本番stamp `31ec7bd`（リード独立実測済 2026-07-24）。デプロイはCLI一本（git自動デプロイ恒久停止・stamp-truth）。
- デプロイ済バッチ列: 環境整備→パッケージA→perf-red-fix→UX-1→coop-freeze→UX-2→stamp-truth（76c0522）→perf-polish（f5b6084）→UX-3（31ec7bd）。全て検収合格。
- **money 4ハッシュ正典（2026-07-24 完全撤去後・リード独立再測定＝台帳§4案B事前計算と全桁一致）**:
  - menu_rewards: `c5317c594d08ee0afea4a4764082876c`（＝デモ投入前値へ復帰・MB seed補助: 16行/¥340,100 ✓）
  - deals: `f0cda850919327978126ece73d303434`（**残3件＝全て勝彦作成** ✓）
  - fee: `(empty)`／override: `(empty)`
- **テストデータ残骸: ゼロ**（demo-teardown 2026-07-24 完遂・partners=MBHOUSE+ZZ6347のみ・services=MB6・broadcasts 0・demo profiles 0・cc-monitor×2生存・孤児frontier参照0）。バックアップ63ファイル/456行はCodex出力ディレクトリに退避（外部共有禁止・復元手順同梱）。

## 未決・進行中

1. **完全撤去プログラム**（次の主戦・三段: リードが台帳作成(read-only)→勝彦GO→Codex実行）。原資料=demo_seed_manifest_20260712.json/v2（機械可読・91エンティティ）＋追加残骸（あきらdeal・ZZ3782・+takasan・配信3件）。現況カウント: ZZ系partners 9・デモ/throwaway配信 3・demo系profiles 6。**deals-cleanup-rule厳守＝CC/デモ起源のみ撤去・勝彦(bfb3c027)/実パートナー作成分は残置**。
2. **ダーク全面＝実運用後へ延期（リード裁定 2026-07-24）**: 全面×全部品の再テーマ＋ゲート再走の規模に対しローンチ阻害要因ゼロ・実ユーザーの要望駆動が適切。トリガー=高さん/第2陣からの要望 or 勝彦指示。LINE空状態文言も同様に任意扱い。
3. 実運用ランウェイ: 完全撤去（台帳作成→勝彦GO→実行の三段）→beforeハッシュ復帰→高さん（オムニス）実招待→UI移行→公開→100人招待。第2陣招待・apex MX・カレンダー/OAuth本番確認・LPロゴ（PRAGMATION/EMANATION正規ロゴ含む）。
4. バックログ: vendor 324ms真因（Server-Timing恒久計測＋実件数fixture）・P3請求書発行代行（税務レビュー前提）・書体展開・ティア制度。

---

## 作業ログ

### 2026-07-24 demo-teardown 検収合格＝開業前クリーンルーム達成

- 実行=Codex（GPT-5.6 Sol・勝彦GO済）。DBのみ・コード変更0・デプロイなし。事前COPY退避63ファイル/456行＋復元手順＋SHA-256照合。
- **リード独立再測定＝台帳§4案Bの事前計算値と全桁一致**（deals f0cda850…/menu c5317c59…=投入前復帰/fee・override empty/MB seed 16行/¥340,100/勝彦deals 3件）。残置リスト全生存（MBHOUSE・ZZ6347・cc-monitor×2・MB6サービス）・孤児参照0・実ブラウザで【デモ】/ZZ表示消滅確認（Codex証跡）。
- 特記: MOOM が ZZ3782 profile を calendar_member_id 参照→参照のみNULL化（本体非接触・正しい裁量）。ZZ6347配下の非デモ通知2件は保護残置（正しい保守判断）。invites は台帳明記3件を超え16件撤去（蓄積テスト招待の掃除・非money・是認）。
- **これで開発～撤去の全アーク完結。残るは人の手番のみ＝高さん実招待（千秋楽）・第2陣・apex MX・カレンダー/OAuth本番確認・LPロゴ素材。**

### 2026-07-24 login-server-action 検収合格（f1f65c0）＝仕上げプログラム完了

- diff実読: `createSurfaceActionClient` は唯一の門（makeSurfaceServerClient）経由・surface二重照合（header優先/期待面不一致throw=fail-closed）・クライアント入力を面判定に不使用。eslint境界内。
- リード独立実測（本番）: 新server action経由で /login→/app 着地✓・authクッキーは `mb-auth-app` のみ（面分離維持）✓・誤入力文言維持✓・ハッシュ不変✓。session 32/32×3回（Codex）。
- バンドル: ログイン3面 Brotli 186-191KB→**133-138KB**（auth-js 除去・目標136KB級達成・console差分は固有UI）。
- これで7/23監査以降の「仕上げ計画」全項目消化: 検証基盤（型/テスト/perf誠実化/stamp/デプロイ一本化）・UX 3巡＋是正3バッチ・性能仕上げ・バンドル。残る性能宿題は vendor 324ms真因のみ（Server-Timing恒久計測・バックログ）。

### 2026-07-24 perf-polish／UX-3 検収＋UX-4要否判定

- **perf-polish（f5b6084）＝合格（開示是認）**: augmentBatches並列化・resolveVendorContext統合・app-persona共有化。diff実読=認証境界の条件・null門は不変、値はSHA-256機械突合一致。**「有意短縮」は未達のまま開示してデプロイ**（vendor 325→324ms）→裁定=**是認**（自律5条件は充足・変更は値同一の並列化のみ・正直開示は文化の実践。ただし今後バッチ固有合格条件が未達の場合はデプロイ保留を既定とし、開示の上でリード裁定を仰ぐこと）。**vendor 324msの真因は段数ではない**と確定＝Server-Timing恒久計測＋十分な件数のfixtureでの段別計測が次の一手（バックログ）。
- **UX-3（31ec7bd）＝合格**: console 9頁ヘッダ375px文法・ダッシュボード縦積み・支払の氏名主体復元・招待STEP3欄別エラー（カナ文言含む・STEP4完走→/app着地実測）・/r/二重タイトル/serif根絶・経費シートportal化・Slack抑止ガード。リード独立検収=本番stamp 31ec7bd・dash h1水平(110×24)・payouts氏名3名可視・ハッシュ一致。
- **UX-4要否**: 配信/分析/LINE深読→専用バッチ不要。発見=配信一覧に「計測用配信（throwaway）」下書き残置＋【デモ】2件→撤去台帳へ追加。LINE空状態の文言改善は任意（次の自然なバッチに同梱可）。
- 残りの仕上げ計画: ①ログインのサーバーアクション化（第5条件案件・発注済み）②ダーク全面の裁定（保留中）。

### 2026-07-24 UX精査第3巡（リード・未踏領域の網羅・fixture全撤去/dealsハッシュ復元実証）

対象=console@375・/r/実走・招待STEP3/4・経費ジャーニー・空状態。経費fixture（deal+assignment）はdealsハッシュ before/after 完全一致で撤去実証。発見:
1. **console はモバイル未適応**（最重要）: 全頁ヘッダでタイトル縦潰れ（ダッシュボード/案件ボード）・KPI 3タイル圧壊・要対応/最近の動き 2カラム圧壊・支払頁は**要支払い行の氏名がコード/金額と重なり消失**＋タブ見切れ。運営が外出先で使えない品質。
2. **招待STEP3の誤誘導エラー**: 全欄入力済みでも「振込先口座をすべて入力してください」が残存（カナ欄の非カナ入力 or 任意インボイス欄の形式不備が原因でも同じ汎用文言）＝**実パートナーの登録離脱リスク**。STEP2の欄別エラー（UX-2）と同格の修理が必要。
3. **/r/ の第一印象劣化**: ブランド名がヘッダとh1で二重表示＋h1がserifフォールバック（書体未指定臭）。頭文字アバターの字形も要確認。
4. vendor経費シート上端の見切れ疑い（modal規律の機械計測対象）。
5. **検証標準の穴**: lib/slack.ts に CC_MAIL_SUPPRESS ガード無し（notify/emailのみ）＝ローカルE2EがSlack実発報し得る（本巡はSLACK_WEBHOOK_URL空で回避）。
6. 経費申請シートUI自体・/r/のフォーム/導線・招待STEP1-3の構造は良質。配信/分析/LINE面は撮影済み・深読は次巡。
→ UX-3バッチ＋性能仕上げバッチを発注（Codex実行モデル=GPT-5.6 Sol・勝彦指定をAGENTS.mdに恒久化済み）。

### 2026-07-24 UX-2検収合格＋⛔デプロイ二重化の再発検出（stamp偽装）

- **UX-2（bec60f2）検収**: diff 13ファイル=表示・文言・レイアウトのみ（waterfall は pct 計算のみ・api/mypage はコメント行のみ）。本番実測=mypage見出し「プロフィール」✓・口座導線「プロフィールから」✓・supplier partners h1 水平80×24px/scrollWidth375✓。**合格**。
- **⛔重大検出**: 検収プローブの stamp が `743cfb7・2026-06-19`＝Codex の CLI デプロイ（bec60f2 stamp正常）の後、**Vercel Git 連携の自動デプロイ（git-main alias 付き・08:53 JST）が本番エイリアスを奪取**。`--build-env` 無しビルドのため stamp は6/19の古い project env 値で焼かれ、**SHA表示が嘘をつく**（内容は bec60f2 で正・機能マーカーで確認済み）。6月に解消した「デプロイ二重化」の再発形態＝**git push origin main が5条件デプロイ規律をバイパスして本番へ届く**構造問題。
- 即応: 正典コマンドで bec60f2 を CLI 再デプロイ→本番stamp `bec60f2 ・ 2026-07-24 09:18 JST` 復元を実ブラウザ実測（money 4ハッシュ・残置ゼロ確認済）。**裁定が出るまで git push は停止**（push=自動デプロイ再発火のため）。
- **恒久対処の裁定（勝彦承認 2026-07-24）＋真因の更新**: 実査の結果、Vercel project env に BUILD_SHA/TIME は**不存在**＝「743cfb7・6/19」の値源は `lib/build-stamp.ts` の**ハードコードされたリテラル・フォールバック**（②env削除は対象不存在で完了扱い）。既存の `VERCEL_GIT_COMMIT_SHA` fallback は runtime 非露出で不発だった。採用対処=①vercel.json で git 自動デプロイ無効化（CLI一本化回復）③next.config の env ブロックでビルド時に SHA/TIME を焼き込み＋**「本物らしい嘘」リテラルの廃止**（fallback は 'local' 等の明示的に偽と分かる値へ）。→ stamp-truth バッチ発注。
- **勝彦指示（恒久）**: Codex は毎回勝彦に聞かず完全自走。AGENTS.md に恒久明記（迷いはリードへの報告事項として安全側で続行）。

### 2026-07-24 UX精査第2巡（リード・本番実走12枚・残置ゼロ）

対象=通知/mypage・招待→初回到達実走・サプライヤー面・PageGuide照合。**合格確認**: PageGuide全実ページカバー（ガイド無し6頁は全てリダイレクト）／招待ウィザードの作り（進捗バー・住所のプライバシー注記・readonlyメール）／サプライヤーhome・moneyのMB思想移植品質／通知3タブ構造。発見:
1. **サプライヤー「パートナー」頁の見出しが375pxで縦潰れ**（招待ボタン2つに圧迫され1文字/行）＝レイアウトバグ。
2. **「設定」ページが2つに同名化** — UX-1の「マイページ→設定」全面置換の回帰（リード指示起因）。/app/mypage（氏名・口座・税区分・インボイス）と /app/settings（アプリ設定）が同名。裁定=mypage系は「プロフィール」へ。
3. **サプライヤー waterfall が¥0でも総受注額バー満幅描画**（console月別はUX-1で修正済・supplier home/money の同型が未対応）。
4. 招待STEP2のエラーが一括文言のみ（欄別表示なし・小）。
5. 通知フィードの【デモ】お知らせが新規登録者全員に露出＝完全撤去プログラムの緊急度上昇（運用）。
※walker はSTEP2で停止（住所textarea非対応の可能性）＝STEP3/4は未実見。到達性は恒久session case[7]aで担保済み。
→ 1〜4を UX-2 バッチとして発注。

### 2026-07-24 3バッチ検収（perf-red-fix / UX-1 / coop-freeze）— リード合格裁定

- **perf-red-fix（b925234・レポート未受領のまま着地→diff直接レビューで事後検収）**: 製品コード変更ゼロ。真赤の真因＝**Playwrightの二度目クリックが要素安定待ち（:active復帰transition）を遷移時間へ混入**（リードのviewTransition仮説は誤り・撤回）。修正=実ジェスチャー（mouse-up一発）＋ready判定を「見出し実可視・完全一致」へ**厳格化**（consoleの操作可能42→232msに増えてなおgreen=誠実）。閾値不変。**合格**。診断ハーネス scripts/perf-red-diagnose.mts 残置（診断用分類）。
- **UX-1（3dab5ed）**: 発注8項目全実装・「マイページ」grep残0確認・**合格**。
- **coop-freeze（399119c・money域）**: 設計書§2どおり2ファイルのみ。`hasOwnProperty('coop_enabled')` の後方互換判別と三項演算子による凍結null保全は厳密。§4実測4ケースgreen（起票1000→menu9000変更→確定1000／旧案件7000／ダウングレード333）。**合格**＝**発見事項⑧クローズ・凍結思想の非対称解消**。
- **リード独立検収（本番）**: stamp `399119c`=HEAD・vendorナビ4ラベル・空状態カードを throwaway実ブラウザで実測✓。3面307・webhook401✓。money 4ハッシュ独立再測定=全一致✓（menu bb94d305…/deals d5976ebf…/fee 4b17cc90…/override 0fd767f4…）・勝彦deals 3件✓。
- **検出した綻び2件**: ①本番stamp時刻が「2026-06-19 01:58 JST」＝デプロイ時 `--build-env NEXT_PUBLIC_BUILD_TIME` 未注入（SHAは注入済み・Vercel環境変数に6/19の古い値が残存しfallback）→次デプロイから正典コマンド（SHA+TIME両注入）厳守を指示。古いproject env の掃除は本番env変更=勝彦確認事項。②perf-red-fix の統合レポート未受領→バッチ完了時のレポート必達を再周知。

### 2026-07-23 リード引き継ぎ監査（Opus 4.8→Fable 5）

リポ全体監査（設計書 vs money系コード実読）。金額計算式の誤りゼロを確認。発見事項:

- **①検証標準の穴**: `next.config.ts` の `ignoreBuildErrors: true` により「build 0」が型検査を含まない（tsc 20件・コメントも事実に反する）。
- **②テスト孤児6本**: `test:canon` は status-effects のみ。coop-task/narrative/reward-format/synapse×3 は未配線（全て手動実行green確認済）。
- **④漏出予備軍**: `lib/reward-override.ts` の `personalizeRewards()` は呼び出し元ゼロの死にコードで、設計書 §4.1（古い・自己矛盾）どおり配線すると `/api/services` の CDN 共有キャッシュ経由で個別報酬率が他パートナーへ漏出する。実装は正しく別endpoint（`/api/my-reward-overrides`・no-store）方式を採用済み。
- **⑤設計書ドリフト**: lineage-rate-design v2 が rate_cards 駆動（fee_model/passthrough_revenue_fee/standard-v2）に未追随。
- **⑥§7-8 文言**: fee_snapshot の SC 内 select は必要（P0-b①の判定材料）。禁止対象は「クライアントへの serialize」に改訂すべき。
- **⑦凍結監査証跡の欠陥**: `freezeOverridesForBatch` が `rate: OVERRIDE_RATE` 固定で書き込み、レートカード率と不一致になり得る（支払額は正・証跡のみ矛盾）。
- **⑧協力報酬の非凍結**: confirm 時に `menu.coop_*` をライブ読み＝起票→成約間のメニュー編集が確定額に波及。紹介(ref_*)との非対称が未文書化。→勝彦裁定待ち。
- **⑨バレル破損**: `components/ui/index.ts` が存在しない `../ChannelMark` を export（現在importゼロで潜伏）。
- **⑩fail-open**: `validateSupplierReward` が catch で ok:true＝DB一時障害時に逆ザヤ50%ガードが無効化。

### 2026-07-23 Codexブラウザ環境整備 合格（bd6ace3）

課題①（Chromium起動不可）解消。playwright-launch.mjs 共通ランチャー（Mach拒否時のみ single-process フォールバック）＋恒久5本の配線。verify-integrity 17/17・session 32/32・resume-reload 2/2・resume-perf 21green。money 4ハッシュ前後一致・残置ゼロ。

### 2026-07-23 リード環境での恒久スイート審判（multi-process・完了）

`pnpm test:verify` フル実行＋red の真因診断（throwaway プローブ・残置ゼロ確認済）。

- **green**: build 0・canon 61・integrity・session 32/32・resume-perf 21green。
- **製品性能に regression なし**: warm 実測 = app 84/108/32ms・vendor 34/314/35ms（全予算内）。
- **red 3件は全て検証側の欠陥**と確定:
  1. **perf: warm-up 欠落** — ランナーがサーバ起動直後に計測＝cold 初撃を「warm」として測る。vendor 816ms（Codex 810ms も同因）は再実測で 314ms green。
  2. **perf: console ログインの hydration 競走** — console/login はバンドルが重く、`domcontentloaded` 直後の fill を hydration が空リセット→空欄 submit→常に `-1 invalid`（決定的）。1.5s 待機で auth 200・/console 着地を実証。
  3. **resume-reload: SHA 未注入** — ResumeWarmer は `NEXT_PUBLIC_BUILD_SHA` 無しでは reload しない設計（正しい）。ランナー `run-permanent.mjs` がビルド時に SHA を注入しないため標準入口では構造的に green 不能。
- → 3件とも是正パッケージA（検証配線の章）へ編入。

### 2026-07-23 リードによる全面UX精査（第1巡・実画面18枚）

勝彦委任（「全て任せる・完璧に改善」）に基づき、throwaway 3面＋公開面を実ブラウザで撮影・実読（375px/1280px・撤去済）。強み＝console dashboard/payouts・pub_join は高水準。発見:
- **データ欠陥（修正適用済・委任に基づく）**: PRAGMATION の logo_path=/logos/reso.png、EMANATION の logo_path=storage/1782751670711.png（画像実確認＝**両方 RSNT=RESONATIONマーク**）＝紹介画面で3ブランド同ロゴ。加えて name「PRAGMATION 」末尾空白。→ 両logo_path=NULL（頭文字アバターへ）＋name trim を適用（UPDATE 2行・before値本節記録＝可逆・money非接触・正規ロゴは既存タスク「LPロゴ素材」で搭載）。
- **表示バグ**: ①dashboard KPI「前月比 ▲11580000」未フォーマット ②支払・月別バーが¥0でも描画＋月毎の色意味不統一。
- **語彙・動線の不整合**: ③vendor下部ナビがラベル無しアイコンのみ（APPと不統一・FAB「+」=経費申請が無説明）④APP案件空状態が「『紹介する』ボタン」と実在しないボタン名を案内（実UIは+FAB）⑤APP報酬「マイページから」→ナビに「マイページ」不存在（実体は設定）⑥vendor案件空状態が裸テキスト（APP空状態カード文法と不統一）⑦案件ボード列「商談中/進行中/納品済み」とDEAL_STATUS正典「対応中/成約/支払済」の二重語彙が画面混在（phase語彙。意図的でも用語対応の明示なし）。
- **検証側**: ⑧ランナーが BUILD_TIME 未注入→ローカルstamp日付が旧値表示（SHAは正・stamp規律の綻び）。
→ バッチUX-1（表示・文言のみ・money非接触）として発注。データ修正SQLは勝彦承認待ち。

### 2026-07-23 是正パッケージA レビュー合格＋性能 red の審判（891fa12）

- コードレビュー: A（personalizeRewards削除・バレル）／B（tsc 20→0・money近接3ファイルは型表現のみを実diffで確認・invite/accept tax_type 挙動保存・setAll 2引数はガード維持）／C（canon 7本・SHA注入・perf誠実化）／D（freeze rate 実適用率・fail-closed）全て**合格**。money 4ハッシュ前後一致。
- **性能 red の審判（リード環境 multi-process で Codex 数値を再現＝環境説を棄却）**: app 骨格253/操作可能257ms・vendor 47/829ms・console 39/42ms green。旧計測の「green」は計測欠陥（warm-up無し・URL時刻=骨格）による偽装だったと確定。**リードの前言「vendor 314ms=regression無し」は旧計測に依拠しており撤回**。
- 一次切り分け（リード実測・コード実読）:
  - **app 253ms**: operable−skeleton=4ms＝RSC/サーバは即応。全遅延が**URL コミット前のクライアント側**。容疑=(i) `experimental.viewTransition` の遷移コミット遅延（`.page-anim` pageIn=200ms と数値整合）(ii) loading境界（app/app/loading.tsx・aria-busy有）が commit されない経路。
  - **vendor 829ms**: skeleton 47ms 健全＝**サーバ描画 ~780ms**。/vendor/rewards は `runtime='edge'`＋`loadVendorBundle`（resolveVendor→2段並列・stagedフォールバック）。~830ms の決定性が高く固定コスト（edge simulate/リトライ/フォールバック発火）の疑い。
- 裁定: **NO DEPLOY 維持**。独立性能バッチ（計測ファースト）を発注→green 後にパッケージAと同時デプロイ。
