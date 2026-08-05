# MB Partners — 開発記録 / RESUME（リポ内正本）

## 2026-07-26 UX-5c（Codex・機能パリティ）

- console自己管理を中央factory/面別cookie文法のまま追加し、session 32/32×2・4面自己管理43/43を実走。
- supplierのタスク説明・保存入口・案件タスク・社内メモ、vendorのガイド・案件メニュー/時系列・既読、招待4点を是正。money計算/凍結値は非接触。
- production UX-5bとcandidateを同一throwawayで8画面×before/after撮影。専用E2E 12/12、恒久スイート全green、残置0。詳細は `docs/reports/ux5c_20260726.md`。

## 2026-07-26 UX-5b（Codex・語彙／文言統一）

- `docs/reports/ux5-parity-matrix.md` と勝彦／リード裁定に従い、in_progress=`対応中`、services.name=`ブランド名`、expense rejected=`差戻し` を全対外面へ反映。意味・状態遷移・moneyは不変。
- 新規協力タスクは「ヒアリング」。既存DBの「ヒヤリング」は書き換えず、共通マッチャとAPIが両表記を受理。旧表記行の自動完了をブラウザE2Eで実測し残置0。
- 「請求済／支払済／確定済」、対外内部語、保存／コピー文法、通知空状態、supplier口座導線を統一。詳細証跡は `docs/reports/ux5b_20260726.md`。

> 2026-07-23 より、開発の裁定・バッチ記録はこのファイルが正本（コードと同じコミットで文脈を残す）。
> それ以前の全履歴（2026-06-12〜07-23・432k字）は Notion「MB Partners — 引き継ぎ / RESUME (2026-06-21)」を歴史書庫として凍結参照。
> 規律の正典は [CLAUDE.md](../CLAUDE.md)（money 4ハッシュ・自律デプロイ5条件・品質ゲート7項目・凍結思想・検証資産分類）。

## 体制（2026-07-23〜）

- 勝彦＝株式会社Media Birth代表・最終決定者・実機審判。
- Claude Code（Opus/Fable セッション）＝開発リード：設計・裁定・Codexへの指示発行・レポートレビュー・記録。
- Codex（GPT-5）＝実装者。指示は1バッチ=1ミッション=1コードブロック。完了時に統合レポート全文を受領しレビュー。
- money域は二段階（read-only設計書→勝彦承認→実装）。

## 現在の本番状態

- HEAD: `4efdb02`(+docs) ＝ 本番stamp `4efdb02 ・ 2026-07-26 20:50 JST`（リード独立実測済）。デプロイはCLI一本。
- デプロイ済バッチ列（全20本検収合格）: …→hardening-1→perf-deep→**UX-5b（64a9cf1・語彙統一）→UX-5c（4efdb02・機能パリティ）＝第5巡163行クローズ**。
- **money 4ハッシュ正典（2026-07-26 まっさら化後・リード実行/実測）**:
  - menu_rewards: **`4f1b52d0a027a282e188be76e9372193`（2026-08-05 正式カタログ投入後・MB seed補助: 38行/sum=340,320）**
  - deals: 生き値（突合運用）。**開業儀式クリーンアップ後=`(empty)`/0件（2026-08-05）**。
  - fee: `(empty)`／override: `(empty)`
- **テストデータ残骸: ゼロ**（demo-teardown 2026-07-24 完遂・partners=MBHOUSE+ZZ6347のみ・services=MB6・broadcasts 0・demo profiles 0・cc-monitor×2生存・孤児frontier参照0）。バックアップ63ファイル/456行はCodex出力ディレクトリに退避（外部共有禁止・復元手順同梱）。

## 未決・進行中

1. ~~完全撤去プログラム~~（**完遂 2026-07-24**・台帳=docs/removal-ledger-20260724.md・検収合格）。
2. **ダーク全面＝実運用後へ延期（リード裁定 2026-07-24）**: 全面×全部品の再テーマ＋ゲート再走の規模に対しローンチ阻害要因ゼロ・実ユーザーの要望駆動が適切。トリガー=高さん/第2陣からの要望 or 勝彦指示。LINE空状態文言も同様に任意扱い。
3. **実運用ランウェイ（全て人の手番）**: 高さん（オムニス）実招待＝千秋楽 → UI移行 → 公開 → 100人招待。第2陣招待・apex MX・カレンダー/OAuth本番確認・LPロゴ（PRAGMATION/EMANATION正規ロゴ含む）。
4. バックログ: vendor 324ms真因（Server-Timing恒久計測＋実件数fixture）・P3請求書発行代行（税務レビュー前提）・書体展開・ティア制度。

---

## 作業ログ

### 2026-08-05 手数料単純化の裁定（勝彦）→ SIMPLE-FEE-1 発注

- 勝彦裁定: 月額固定（オムニス¥5万）は**システム外請求へ全廃**・サプライヤー間のシステム内差分は「折半か否か」のみ。lineage-rate-design **§11（v4追補）**として承認記録・凍結済みデータ0件の窓につき後方互換コード不要。
- カード再定義: omnis-founding-v1 = 標準+fee_model=half_commissionのみ差（pay5=0.05付与・monthly=null）。

### 2026-08-05 正式メニューカタログ投入（勝彦リスト・リード実行）＝開業台帳完成

- 勝彦提供リスト=3ブランド22メニュー（RESONATION9・PRAGMATION6・EMANATION7）。dry-run(rollback)で全数検証→本実行。
- 内容: 各ブランドにタグライン（subtitle）＋第2層（生み出す/型を作る/放つ）＋メニュー22（一言説明=short/public両設定）＋報酬22（**全て rate/10%/粗利(税抜)**・トリガー「成約後、粗利（税抜）確定で算出」）＋協力タスク88（つなぐauto/referral・アポイントauto/in_progress・アシスト/フォローmanual・ヒアリングmanual※新正書法・勝彦指定順）。
- 旧メニュー6件（reso/dx配下・BPO等の重複源）は active=false で停止（削除せず・menu_rewards/cttも停止）。service_menus新行の旧式ref列は rate/10/粗利 で整合（レガシー経路でも同率）。
- 表記正規化1件開示: 「AI導入・自動化・継続改善継続」→「AI導入・自動化・継続改善」（重複「継続」をタイポと判断・一言で戻せる）。
- 検収: 本番 /api/services 実測=RESONATION9/PRAGMATION6/EMANATION7・旧重複非表示。**正典改定=menu hash `4f1b52d0…`・MB seed 38行/sum=340,320（CLAUDE.md/AGENTS.md同時改定）**。バックアップ=~/Documents/mb-menu-import-backup-20260805。

### 2026-08-05 開業儀式クリーンアップ（勝彦GO・リード実行）＋メニューリスト取得不能の開示

- 勝彦正式GO「全データ削除→本日高さんサプライヤー招待→そこからリファラル1名招待まで」。
- 削除実行（COPY退避=~/Documents/mb-opening-backup-20260805・600権限）: deals2（勝彦8/4テスト起票・田中太郎/山田）+items2+applications2（田中義剛/山田孝之テスト応募）。**ZZ4820（勝彦本人パートナー行）とMBHOUSEは残置**（削除対象に明示されていないため。一言で撤去可）。検収: deals 0/(empty)・applications 0。
- **⛔メニューリスト取得不能**: 指定の公開アーティファクトURLが404（実描画で確認）・アカウントのアーティファクト一覧にも不存在。**登録は中身の再共有待ち**（チャット貼付/再公開いずれでも可）。登録仕様は確定済み=協力タスク4種（つなぐ/アポイント/アシスト・フォロー/ヒアリング※新正書法）・報酬=粗利（税抜）10%一律rate・投入時にMB seed補助チェック正典値を同時改定。

### 2026-08-05 EXP-1／SYN-1 検収合格＝体感とワクワクの層・SYNAPSE統合完了

- **EXP-1（b4d128a）＝合格**: after()移設（通知/Slack/メール/イベント/audit/協力タスク/ファネル）・同期コアはコメントで「after()へ移してはならない」と恒久固定（リード確認済）。実測=2メニュー+相談 2,667→1,319ms・pending表示 32-36ms・core最大539ms（目標600ms内）。ActionPending/SuccessMoment（報酬確定のみ紙吹雪・案件単位1回・reduced-motion縮退）。**検証がまた実バグ検出=パートナーRLS経路のdeal_events insert 403（従来からイベント静落ち）→service-role経路で根治**。
- **SYN-1（4db5d6f）＝合格**: 「SYNAPSE」UI残存0（独立grep一致）・紋章/回転リング撤去・「つながり」導線+完了画面提案カード（端末単位で閉・同一紹介非再表示）・詳細→紹介フォームのプリフィル・match/nudge/RLS不変。一巡25/25。
- リード独立検収: stamp 4db5d6f・deals生き値2件不変（勝彦8/4分）・menuハッシュ不変。
- **AGENTS.md改定**: 規律1の「勝彦deals 3件」固定記載を生き値+突合規則へ更新（Codex指摘・正）。
- 開示是認: 経費申請の完了表示+285msは成功演出320msを含む数字（core 187ms）＝設計意図どおり。lint既存債務456件はゲート外として存置（別途裁定可）。resume-perf初回17/21は再走21/21=一過性。

### 2026-08-05 体感・SYNAPSE・ワクワクの3裁定→EXP-1/SYN-1発注

- 勝彦3件: ①SYNAPSE見直し ②アクション後の待ち時間（起票等）③全画面ワクワク要素。
- **①裁定（勝彦）=縮小・改名・統合**: 実査=私的台帳+提案エンジン・入口が無説明紋章チップ・内部コードネームUI露出が「意味不明」の真因。中身は差別化そのものにつき削除せず「つながり」へ改名・紹介フロー起点へ統合・紋章廃止（SYN-1）。
- **②診断**: submitPartnerReferral=await50段の直列（REF-1のN件でN倍）。設計=計測ファースト＋Next16 `after()` で非クリティカル（通知/Slack/メール/イベント/ファネル）を応答後へ・コア（partner解決→reward解決→insert→items）のみ同期・**楽観的更新は不採用**（money線引き遵守・体感は演出で埋める）＋全ミューテーション共通のpending→成功演出部品。
- **③設計原則**: 「瞬間を祝う・常設で騒がない」=遷移/出現の物理感・成功モーメント演出（起票完了/成約/報酬確定）・count-up拡大の3類型に限定。常時ループ禁止・reduced-motion全対応・transform/opacityのみ・perfゲート不変。consoleは控えめ。
- 順序: EXP-1（②+③一体）→SYN-1。

### 2026-08-04 REF-1／TEAM-1 検収合格＋実運用データの初着弾

- **実運用の初書込を突合**: deals 0→2件（田中太郎/山田・received・8/4 02:23/02:32・created_by=bfb3c027・**新パートナー行ZZ4820=勝彦が再登録**）＝正当。以後 deals ハッシュは生き値・突合運用へ。
- **REF-1（1ebbb97）＝合格**: 複数メニューN件同時起票（既存凍結N回流用・部分失敗の正直表示・referral_group_id集約表示）＋相談の第一級化/構造化3問/ナラティブ/console CTA（報酬凍結は②b承認待ちのTODO明記）。単選従来動線の回帰・E2E12/12。**検証がResumeWarmer×復帰遷移の競合（supplier復帰15秒body-empty）を検出→prefetch 750ms遅延+操作時キャンセルで修理**（文化の実践・resume 21/21）。
- **TEAM-1（73ffaab+31d5a8d）＝合格**: チームブロック（director_id実名/委託先屋号/調整中表示）＋public-timeline（完全一致許可表・default-deny・金額値¥987,654,321の非漏出実測）＋director変更のイベント/audit。検証資産のfalse red（本番ログインhydration）を診断・是正し正直に再デプロイ。E2E15/15。
- リード独立検収: stamp 31d5a8d・deals突合・許可表実装のdiff確認（完全一致のみ・可変本文非登録）。
- **軽微フォロー（次バッチ同梱可）**: 許可表の写像で「ステータスを『成約』に変更しました」が menu_confirmed（「メニューが決まりました」）に言い換えられる＝成約イベントは専用kind/文言（例「ご成約となりました」）へ分離すべき。

### 2026-07-27 進化プログラム（勝彦4案）設計裁定→REF-1/TEAM-1発注・②b設計書起案

- 勝彦4案: ①複数メニュー紹介 ②「まず相談」実用化 ③担当者可視化 ④メニュー大量投入（リスト精査中）。
- リード裁定: ①=**N件同時起票方式**（1案件複数明細は凍結思想の大工事につき不採用・既存凍結をN回流用=money非接触・referral_group_id additive で組を表示）／②a=UI/構造化3問/ナラティブ（money非接触）・**②b=相談のメニュー確定時凍結は新凍結ポイント=設計書 consult-reward-freeze.md v1 起案・勝彦承認待ち**／③=公開許可リスト方式（金額系イベントは構造的対象外・MB担当=deals.director_id 実名・委託先=屋号）／④=台帳方式（投入時にMB seed補助チェック正典値の更新必須）。
- 実行順: ④(リスト待ち)→REF-1(①+②a)→②b→TEAM-1(③)。テスト応募2件（田中義剛/山田孝之）はGO未受領につき残置。

### 2026-07-26 LP-1 検収合格（c9503ec）＝第6巡クローズ・公開面の応募動線完成

- リード本番実測: stamp c9503ec・apex「パートナー応募はこちら」・/partnersに報酬例¥30,000/翌月末/免責・会社情報（大阪府吹田市千里山東2-24-21・神原勝彦・2024年3月設立）・「まかせる/うけとる」。カウンター非接触=SHA-256前後同一証明つき。公開面3点セット（alias/SWブロック/cache-busting12回）＋SW v37 bump。
- 会社情報はCodexが公式会社概要から照合採用（勝彦の実値返信前に公開情報で充足＝正当）。**⏳勝彦: 掲載値（所在地・設立2024年3月）が登記表記として正しいか一目確認**。
- 開示是認: 自動返信メールの構造確認のため本番内部シンク宛1通のみ実送信（件数明示・CLAUDE.md規律内）。
- 応募後の体験完成: 自動返信「3営業日以内」+完了画面3ステップ+審査FAQ（落とす試験ではない）。報酬例は lib/public-partner-content.ts 単一ソース化＝/partners・rewards・/join で不一致が構造的に起きない。

### 2026-07-26 LP-1（Codex・応募動線と信頼）

- apex未認証着地から応募LPへ1行導線を追加し、報酬3タイプの具体例・支払時期・免責を公開面共通正典へ一本化。会社情報は公式会社概要の所在地・代表・設立を共通部品で表示。
- 応募自動返信と完了面へ3営業日・審査→面談→招待を追記。FAQ、3語、領域マーキー密度、SW cache v37を追随。実績カウンターの値/演出blockはSHA-256一致で非接触。
- 公開4面375px before/after、専用22/22、恒久全green、money `(deals empty)` を含む4ハッシュ不変、残置0。詳細は `docs/reports/lp1_20260726.md`。

### 2026-07-26 LP監査（第6巡・リード）＋勝彦3裁定→LP-1発注

- 監査対象=/partners・/join・/partners/rewards・apex動線。土台は高品質（設計系・/join士業コピー・rewards子ページの免責つき例示）。
- **発見**: ①実績風カウンター（PARTNER+40/FEE+3,200K）はハードコード演出値 ②apex→応募導線ゼロ ③応募の自動返信なし・期待値提示なし ④報酬具体例がメインLPに不在（子ページに埋没） ⑤信頼ブロック薄（社名+事業内容のみ） ⑥「はなす」語義曖昧・審査FAQ欠落。
- **勝彦裁定**: カウンター=**現状維持（非接触・早期に実態が追い越す見込みとの判断）**／報酬例メイン引き上げ=リード判断に委任→**実施**（根拠: 主動機を1クリック先に置かない・免責は子ページで整理済み＝リスク増なし・/joinの「条件は面談で」不安の解消）／会社情報=**所在地・代表名まで**（写真なし）。
- LP-1バッチ発注（apex導線・報酬例引き上げ・信頼ブロック・自動返信+完了画面・審査FAQ・3語の明確化）。⏳勝彦: 所在地表記・設立年月の実値。

### 2026-07-26 まっさら化（勝彦指示・リード実行）＝運用台帳ゼロでスタート地点へ

- 勝彦指示「案件とフロンティアも全てテスト＝削除」→スコープ裁定（AskUser）=**パートナー行のみ**（auth/profile残置=監査21件の孤児化なし・同メールで再招待可）。
- 実行（リード直接・COPY退避→単一トランザクション）: deals3+items3+通知2+紹介リンク2+ZZ6347 partner行。バックアップ=~/Documents/mb-blank-slate-backup-20260726（600権限）。
- 検収: deals **(empty)/0件**・menu不変 c5317c59…・partners=**MBHOUSEのみ**・bfb3c027 profile生存・孤児audit 0・MB seed 16行/¥340,100。
- **deals-cleanup-rule 改定**: 「勝彦deals3件は錨」条項は勝彦自身の指示で失効。新規則=**台帳は空が正・以後 deals に入る行は全て本物**（検証でのthrowaway起票は従来どおり作成即撤去・ハッシュ復元証明）。

### 2026-07-26 UX-5b/5c 検収合格＝第5巡163行クローズ・横断整合の完成

- **UX-5b（64a9cf1）**: 勝彦3裁定＋リード7裁定の語彙・文言統一。リード独立grep=商談中0・APP面オーバーライド0。残存の裁定=経費外「却下」4件は口座変更申請の別ドメイン語で正当・「ヒヤリング」4件はコメント2＋後方互換ルックアップ2で正当。**合格**。
- **UX-5c（4efdb02）**: console自己管理（第5条件green）・vendor通知既読（本人metadata方式=DDL回避の開示済み設計・実運用で件数増の剪定要否を観察）・supplier等価化残り3件・vendorメニュー名/時系列・招待整合・孤立部品削除。検証が旧menu_id写像バグとconsoleログインa11y欠落まで炙り出して修理（文化の実践）。**合格**。
- **リード本番実測**: stamp 4efdb02・ボード「対応中」/「商談中」消滅・console設定にパスワード/メール変更・設定末尾の版数+ログアウト・ハッシュ不変・残置0。
- **これで第5巡（横断UX整合）完結**: 163行=容認約90・是正73・全行裁定記録済み。開発卓上は再び実質ゼロ（バックログ: supplier固有通知種別・broadcast既読・partner/vendor moneyⓘ・vendor既読metadataの剪定観察）。残るは人の手番=高さん実招待・第2陣・apex MX・OAuth確認・LPロゴ。

### 2026-07-26 UX-5a検収合格＋リード全行裁定（163行）＋勝彦3裁定

- **UX-5a（read-only差分表）＝合格**: 163行・既知7件全収録・行番号根拠つき。新発見の白眉=孤立部品 SupplierInvite.tsx（参照ゼロ）・公開面/partnersに禁止語「網」露出（VOC-24）・vendor通知の既読機構なし（NOTE-07/08）。
- **勝彦裁定3件（2026-07-26）**: in_progress=**「対応中」**（consoleボード列のみ改称）／services.name=**「ブランド名」**（サプライヤー側改称）／expense rejected=**「差戻し」**（正典EXPENSE_STATUS・vendor表示とも改称）。
- **リード裁定の要旨**: 「意図された差」約90行は権限・ペルソナ境界として容認。是正=語彙・文言系（UX-5b）と機能パリティ系（UX-5c）へ二分。容認だが記録する主なもの=進行中の3粒度（各面内で一意・consoleⓘ対応表1行追記のみ）・期間基準の面別差（MONEY-03）・招待メール要否の面別差（INV-03）。バックログ=supplier固有通知の種別表示・broadcast既読のinbox反映・partner/vendor moneyⓘ。
- 5b/5c発注（下記）。Codexの vercel login 再認証がデプロイ前提。

### 2026-07-26 第5巡監査（横断UX整合・リード先行調査）＝確定所見7件

勝彦指示「全画面通しの辻褄」。コードレベル突合で確定した不整合:
1. **in_progress の二語問題**: console案件ボード=「商談中」（_parts.tsx）／supplierボード=「対応中」／正典DEAL_STATUS・パートナー面=「対応中」。1状態に面またぎ2語。
2. **サービスマスタ編集の語彙ドリフト**（console vs supplier 同項目別名7組）: 一言説明/ひとこと説明・こんな方に(Who)/こんなお客さまに・紹介対象(フック文)/紹介しやすい方・詳細説明/詳しい説明・説明(〜とは)/サービス概要・サービスサイトURL/WebサイトURL・ブランド名(必須)/サービス名。
3. **「ヒヤリング」表記が data-coupled**: COOP_TASK_MASTER と hearing API の `includes('ヒヤリング')` マッチャが旧表記に依存＝UI全域の「ヒアリング」と不一致。**安易な一括置換は自動タスク完了を壊す地雷**（是正は両表記マッチ+新規はヒアリング）。
4. **console運営者の自己パスワード変更なし**（hardening-1はAPP/vendor/supplierのみ＝運営はresetメール経由しか正道がない取り残し）。
5. **経費の 却下/差戻し 二語問題**: vendor=却下・consoleは差戻し/却下が混在（EXPENSE_STATUS正典=却下）。
6. vendor設定に「サービスガイド」欠落（APPにあり・受託者だけ道標なし）。
7. console板だけ「進行中/納品済み」プロジェクトフェーズ列が状態語と同居（PageGuide対応表はあるが語の統一裁定は未）。
→ UX-5a（read-only全画面ペア差分表・Codex）→リード全行裁定→UX-5b（是正）の二段で完全化。5aはデプロイ不要=CLI認証未復旧でも実行可。

### 2026-07-26 hardening-1／perf-deep 検収＋perf-deepデプロイ代行

- **hardening-1（304033b・本番済）＝合格**: 自己管理2動線（パスワード変更=現行確認→updateUser・メール変更=secure email change 2通型+profiles同期失敗時のauth側ロールバック補償）＋公開フォーム防御（IP×対象キー5分5回・honeypot=正規同一200で静かに破棄・境界付き入力）。恒久 test:hardening 34/34 を test:verify へ配線。リード実測: 本番stamp 304033b・ハッシュ不変。generateLink(email_change_new) の hashed_token 無効問題への action_link token 抽出は実証済み開示＝是認。
- **perf-deep（96a0e66）＝合格**: Server-Timing恒久計測（console deals/payouts 段別・vendorは /api/vendor/rewards-timing 観測口=本人401境界）。**真因確定=Edge runtime×11本同時発行の接続待ち**（Node+4本×3波=248ms・80%短縮、Edge11本=900-1062ms、Node11本=516ms、Node6本=835msの完全な実測系列）。console dealsのみNode化・select/値/認証不変・結果同一性20/20突合。vendor 326ms=構造下限を寄与msで証明（auth115ms+RSC/router162ms・DB49ms）。payouts 149ms=下限。
- **Codex環境事故の開示**: CLI57検証中に自身のCLI認証を失効（新規認可はせず正しく保留）。**リードのCLI認証は健在→デプロイをリードが代行**（standing承認・全ゲートgreen確認済み）。本番stamp `96a0e66` 実測一致・3面307・webhook401・タグ/push完了。⏳勝彦: Codexターミナルで `vercel login` 再認証（次バッチまでに）。

### 2026-07-24 第4巡監査（機能整合・リード）＝reset穴と同型の欠落を全域捜索

- **健全確認**: 撤去後の孤児参照=全域0（deal_events/items/notifications/referral_links/audit actor/creator/frontier/synapse）。監視・恒久検証に旧ハッシュ/件数の固定ピンなし＝偽アラームリスクなし。/api/inquiries は認証必須＝スパム面なし。招待は再発行で運用可＝穴でない。
- **発見（同型穴3件）**: ①**ログイン中のパスワード変更UIなし**（reset メール経由しか正道がない）②**メールアドレス変更動線なし**（変更依頼が来たら運営がSupabase直触り＝オーナー事故と同じ土壌）③**公開フォーム2本が無防備**＝/api/referral（/r/相談）・/api/partner-apply（/join応募）にレート制限/honeypotゼロ→公開シェアが前提の面につきスパム起票・応募洪水が可能。
- **推奨（勝彦の手番・各1行）**: Supabase の自動バックアップ/PITR設定の確認（ダッシュボード）。console 2FA は過去に撤去裁定済みのため再提案しない（必要なら一声で）。
- → hardening-1（自己管理2動線＋公開フォーム防御）と perf-deep（Server-Timing恒久計測＋vendor324ms真因）を発注。

### 2026-07-24 password-reset 検収合格（dac2c56）＝リセット動線の穴クローズ

- 発端=オーナー復旧劇で顕在化した「リセット動線ゼロ」。3面に forgot/reset 新設。
- diff精査（認証域）: メール列挙防止（全失敗を同一成功表示・debugLinkはCC_MAIL_SUPPRESS+内部シンク時のみ＝本番構造上漏れない）・resetOriginはhost許可表＝open redirectなし・token_hash+verifyOtp（公式SSR文法・単回使用）・updateUserは回復セッション必須・signOut scope:local＝他面巻き添えゼロ・全て中央factory経由。action_linkのfragment問題への token_hash 迂回は正当な設計判断（開示どおり）。
- Codex実測: 専用E2E 39/39・session 32/32×3・全ゲートgreen。リード独立実測: 6URL全200・3面ログインにリンク文言・stamp=dac2c56・money 4ハッシュ不変。
- レート制限はインスタンス内best-effort（開示済・是認）。**合格**。

### 2026-07-24 ⛔インシデント続報: 復元後もログイン不能→真因2=CSV復元のNULL化→完全修理

- 復元後も勝彦ログイン不能。真因=**COPY(csv)は空文字とNULLを区別できず**、auth.users の token系7カラム（confirmation_token/recovery_token/email_change×3/phone_change×2/reauthentication_token）が''→NULLに化け、GoTrueがscanエラー=全パスワードで500。
- 修理=7カラムをCOALESCEで''へ。**証明**: 誤パスワードprobeが修理前500→修理後400 invalid_credentials（アカウント健全化をパスワード非依存で実証）。
- 教訓（復元手順の恒久規則）: auth.users をCSV復元したら**必ずtoken系カラムの''復元とhealthy行との列比較**を行う。RESTORE.mdにも本規則を追記すべき（バックアップはCodex出力側のため次回撤去時の台帳規則に含める）。

### 2026-07-24 ⛔インシデント: 撤去がオーナーアカウントを巻き添え→復旧完了

- **事象**: 勝彦が console から強制ログアウト・再ログイン不能。真因=**ZZ3782（テストパートナー行）が勝彦のオーナーprofile（39b30d21・mediabirth.project@gmail.com・role=owner）に紐づいており**、撤去台帳の「ZZ3782 partners/profiles/auth」がオーナーのauth/profileごと削除した。**台帳作成時にprofileのroleと共有参照を確認しなかったリードの過失**（Codexは台帳どおり実行＝過失なし）。
- **巻き添え実運用データ**: ①auth.users/identities/profiles（owner） ②member_calendar_links（Google OAuth結線） ③member_notification_prefs ④services.moom.calendar_member_id（予約カレンダー結線）。
- **復旧（全件・バックアップから原本復元）**: 3行復元（生成列除外のCOPY→INSERT・元UID/パスワードハッシュ維持=旧パスワードで即ログイン可）＋カレンダー結線＋通知設定＋moom結線UPDATE。money 4ハッシュ非接触を前後確認。ZZ3782 partner行は意図どおり削除のまま。米井テストaccountの通知pref（1155ed3c）は孤児化のため復元せず。
- **恒久教訓（次回撤去の台帳規則）**: profiles/auth を削除対象に載せる前に、(a) profile の role（owner/manager は原則巻き添え禁止）(b) 共有参照の全列挙（services.calendar_member_id・member_*・deals.created_by・audit）を必須チェックとする。テスト用partner行の削除と、その profile/auth の削除は**別判定**（partner行だけ消せば十分なケースが多い）。

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
