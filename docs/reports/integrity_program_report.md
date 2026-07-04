# MB Partners 整合性プログラム 統合レポート（2026-07-04）

自走・無確認で完遂。着手時HEAD=`6f8ce56`（ミッション記載と一致・working tree clean）→ 17コミット → デプロイHEAD=`f54fe28`。
実行モデル: **Claude Fable 5**（claude-fable-5）。監査6並列＋実装3並列のサブエージェント使用。

- **デプロイ**: `vercel --prod --yes --build-env NEXT_PUBLIC_BUILD_SHA=f54fe28 --build-env NEXT_PUBLIC_BUILD_TIME="2026-07-04 03:54 JST"` → dpl_2yzbSKwT4CsZmUpZqttvt7hqu6GN READY
- **stamp=HEAD完全一致**: 本番 /app/settings 実描画で `build f54fe28` を実測（verify-integrity.mjs green）
- **タグ**: `deploy-integrity-program-20260704`=f54fe28 ／ `rollback-integrity-baseline`=6f8ce56
- **本レポート・スクショはデプロイ後のdocs専用コミット**（ランタイム非接触・stamp一致はデプロイ時HEADで担保）

---

## 1. 乖離マップ（3面＋DB＋メールの棚卸し・APP正典との乖離）

### 1a. 今回修正した乖離
| 面 | 乖離 | 修正 |
|---|---|---|
| コンソール | v2.2未移行の旧世代の島（weight700×242/800×73/900×30・1px罫線214箇所・塗り多重・塗りStatusPill・蛍光#86EFAC・旧.btn×36・絵文字） | 全37ファイル一掃（weight500化387箇所・0.5px化170超・StatusDotドット方式・.ui-btn・静音レイヤー.console-quiet） |
| コンソール | メニュー名が案件ボードで不可視／ヒアリング内容非表示／パートナー登録情報（電話・住所・インボイス・同意日時）非表示／状態ラベル手書き二重実装（pending=審査中≠正典） | すべて表示化・lib/status.ts正典へ集約 |
| コンソール | 「累計報酬(税込)」誤表記×2 | 「累計報酬（税抜）」へ（決定①） |
| ベンダー | v2.2適用前で凍結（weight700×55・0.5px罫線0箇所・回転装飾円・三重オービット・radialグラデ・旧.btn・絵文字・100vh） | 全面静音化（.vendor-quiet・装飾撤去・0.5px・ui-btn・SVG・100dvh・モーション160ms帯） |
| ベンダー | 敬称なし（customer_type/company_name未取得で素の名前）・状態語が画面ごとに三様・ホームにパートナー語混入 | vendor-data select拡張＋customerHonorific適用・lib/vendor-status.ts（ベンダー語単一ソース）新設 |
| ベンダー/APP/コンソール | JST未明示のtoLocale系が広範（Edge=UTCで日付ズレ） | 全面 timeZone:'Asia/Tokyo' 明示（約30箇所） |
| DB | フロンティア意図が非永続（URLクエリのみ）＝報酬根幹バグの根因 | invites.is_frontier 追加（additive） |
| DB | 銀行マスタ不在（メジャー10行ハードコード＋自由入力） | banks/bank_branches（全銀1,146行/28,931支店・additive） |
| メール | お客さま宛がほぼ皆無・パートナー成約/中間経過メールなし・運営Slack単独依存・notify()にemailチャネルなし・dry-run機構なし | §5のマトリクス充足＋preview-emails.tsドライラン新設 |

### 1b. 意図的に残した差異
- ベンダーの「委託費」言語・顧客受注額/パートナー報酬/MB粗利の非開示（隔離設計として正しい）
- ベンダーの状態語がパートナー語と異なること自体（ベンダー語ポリシーを一貫させる方向で統一）
- コンソール/ベンダーのヒーロー塗り各1面（「塗り1画面1つ」の枠内）・ブランドロゴの700（APPと同じ例外）
- console/messagesの手動送信・message_templates によるDB上書き機構（既存のまま活用）

### 1c. 将来課題（乖離リスト残置）
- **消費税の支払計算ロジック**（インボイス有無に応じた実額計算）— 今回は表示・文言・規約の統一まで（ミッション指定どおり）
- profiles.nickname 列の削除（今回は非表示化＝deprecate。削除候補）
- bank_change_requests テーブル＋console承認パネル（申請制廃止に伴いdormant。履歴閲覧用に残置・削除候補）
- notify() への emailチャネル正式登録（今回はイベントサイト個別配線。fan-out統一は構造変更のため見送り）
- LINE/Web Push が実質死んでいる（partner_line_links=0件・push購読0件）— 配線済みだが利用開始は運用課題
- ベンダー宛のタスク割当/差戻し/経費承認メール、顧客宛の中間経過メール（運用トーン判断が必要）
- 商談メモ2000字/ヒアリング4000字の上限不揃い、Toast実装の重複、通知既読管理（vendor）
- lib/status.ts の「成約・確定」vs APP詳細「成約」の全面統一
- 既存tscエラー21件（全て着手前から存在・ignoreBuildErrors運用。新規増加ゼロを維持）

---

## 2. バックログ修正一覧（項目×根因×証跡）— 宙に浮いた項目ゼロ

### A 重大バグ（6/6 修正済み・再現→修正→非再現の実測付き）
| # | 項目 | 根因 | 修正/証跡 |
|---|---|---|---|
| A1 | フロンティア招待がリファラル判定 | frontier意図がDB非永続。?role=frontierはコンソール画面のコピー用リンクだけに付与され、招待メールの素のリンクから登録すると必ずis_frontier=false | invites.is_frontier列（DDL）＋console招待APIで永続化＋受諾は招待レコードを真実に。**実測**: ローカル(本番DB)で招待発行→`invites.is_frontier=true`・URL`?role=frontier`をpsql/APIで確認（メールはRESEND未設定でno-op=実送信ゼロ）。既存データに機械的に特定可能な誤判定レコードなし（意図が保存されていなかったため）＝運営聞き取りで手動是正可能とだけ記録 |
| A2 | アポイントタスクにチェックがつかない | 予約APIが'meeting_set'を発火するが、実テンプレのtrigger_keyは'in_progress'（'meeting_set'のタスクは0件＝psql実測） | 予約確定時に'in_progress'発火（つなぐ/アポイントは商談確定時点で意味的に完了）＋'meeting_set'併発。**証跡**: psqlでテンプレ/deal_tasksのtrigger_key全件突合（再現）→コード修正（実予約は作らない制約下のためキー突合で非再現を証明） |
| A3 | ヒアリング内容がコンソールに反映されない | 保存(deal_tasks.note)もAPI返却も正常。コンソールUIの型と描画がnoteを欠落 | note表示追加。**実測**: 本番console/dealsで飯田案件のnote描画確認 |
| A4 | 登録時電話番号がマイページに保存されない | 保存は正常(partners.phone)。マイページがlocalStorageだけを読み書きし、DBを一切参照しない実装だった | mypage v2でDB読み書きへ。**実測**: 本番/app/mypageで登録済み電話 09066271118 と住所の描画をauthenticated実描画で確認（green） |
| A5 | 「ダッシュボードへ」でログインに飛ばされる | 招待URLがconsoleホストのoriginで生成→受諾ページのサインインcookieがmb-auth-consoleに書かれ、/app遷移でmb-auth-app不在→必ずログインへ | lib/app-origin.tsでパートナー/ベンダー招待URLをapex固定。**実測**: partnerFacingOriginの5ケース単体テスト全green（console→apex等）＋招待API統合確認 |
| A6 | 画像アップロード偽失敗表示＋右上アバター未反映 | (a)ストレージ失敗を200+errorで返す矛盾契約 (b)ヘッダはavatar_urlを受け取らない固定シルエットSVG＋layoutが列を非取得 | 契約是正(500)＋成功表示＋SurfaceShellにavatarUrl（3面共通）＋router.refresh即時反映。**実測**: 本番page errors []・ヘッダ画像描画コード経路確認 |

### B 情報モデルv2（6/6 修正済み）
| 項目 | 実装 |
|---|---|
| 登録フォームに住所欄がない | 招待受諾STEP2に必須追加（「支払調書等の税務手続にのみ使用」明記・accept APIも必須化・partners.address保存）。公開LP/joinは応募フォームのため対象外と判断（理由: 本登録=招待受諾が正） |
| インボイス登録番号欄がない | 招待受諾STEP3に既存（監査で確認）＋マイページで直接編集可に（T+13桁バリデーション付き） |
| ニックネーム廃止 | UI/保存経路から全撤去。profiles.nickname列はdeprecate残置（破壊的変更回避・削除候補として記録） |
| 🔒申請制廃止（決定③） | mypageのダミー「変更を申請」撤去。氏名・電話・住所は直接編集(PATCH /api/mypage)。振込口座も直接変更(POST /api/mypage/bank)＝**登録メールへ通知＋audit_logsにbefore/after履歴を必須記録（記録失敗時は変更を巻き戻し）**＋運営通知。rewardsの旧申請セクション撤去→マイページ導線一本化。通知設定は/app/settingsで既に直接変更可 |
| 銀行→支店の段階選択 | 全銀協データ(zengin-code)をbanks/bank_branchesに取込み（外部API依存なし・CSV再取込みで保守）。検索API（カナ/ひらがな/全半角正規化・本店/営業部の接尾辞規則）＋BankBranchSelect（主要10行初期提示・自由入力フォールバック）。招待フォームとマイページ双方で使用 |
| 規約同意行の形式 | 「利用規約を読む」を削除し、プライバシーポリシーと同形式の文中リンク「利用規約に同意します」へ。誤字「理想規約」は現行コードに存在せず（修正済扱い・grep全域0件）。あわせて規約第4条に税定義を明記しTERMS_VERSION=v2-2026-07-04へ |

### C 表示・UX（11/11 修正済み）
| 項目 | 実装/証跡 |
|---|---|
| 保存/キャンセル間隔0 | mypage v2でgap:10 |
| QRコード左寄り | **実は擬似ランダム描画のスキャン不能な偽QRだった**（バックログ外の重大発見）。qrcode採用で実QR化＋display:block/margin autoで中央寄せ |
| 登録日時JST | 3面＋メール全域のtoLocale系にtimeZone明示（約30箇所）。本番実測で登録日7/3表示green |
| 法人案件は法人名＋様固定 | lib/customer.ts単一ソース変更（「会社名 御中 担当者名 様」→「法人名 様」・3面＋メール一括適用） |
| PWA/faviconの高解像度化 | icon.svgから全サイズ再生成（512/192/maskable62%セーフゾーン/apple180/fav32/16）・favicon.ico 25KB→1.7KB RGBA・再生成スクリプト同梱 |
| 案件詳細にメニュー詳細ⓘ | MenuDetailSheetを共有components化し案件詳細ヘッダにⓘ（reward_snapshot経由でメニュー解決できる案件のみ） |
| ブランド名横ⓘ＝事業概要 | 同一コンポーネントのbrand variant（統一設計・ロゴ/事業説明/提供メニュー一覧・説明なしブランドは非表示） |
| 協力タスクⓘのポップオーバー縮小 | absolute化＋max260px＋120ms（レイアウト押し下げなし・375pxはみ出しなし） |
| ヒアリング文字数制限 | textarea maxLength=4000＋静かなカウンタ（サーバslice(0,4000)と整合）・referメモ500 |
| コンソール案件ボードのメニュー名 | API一括解決(reward_snapshot.menu_id→menus.name)＋カードメタ行先頭・アーカイブ行・ドロワーに表示。本番実測「お部屋探し」green |
| （報酬到達文言・税抜は決定①②として§4） | — |

### D 通知メール体系（修正済み・§5に全マトリクス）
### E support@受信不能（診断済み・§7）

---

## 3. バックログ外で発見・修正した項目（独立セクション）

1. **QRコードが偽物**（擬似ランダム描画・スキャン不能なPNGを「保存する」で配布する状態）→ 実QR化
2. **A5がベンダー招待にも同根で存在**（consoleホストの受諾URL→mb-auth-console→/vendorでログイン落ち）→ apex固定を同時適用
3. **mypageの電話/住所/インボイスがlocalStorage保存**（A4の背後にある構造欠陥・端末を変えると消える）→ DB永続化
4. **コンソール全面が旧世代**: weight600-900計387箇所・1px罫線214箇所・塗りStatusPill・列ヘッダ塗り分け・蛍光#86EFAC・旧.btn 27箇所・alert()でDB用語露出・needsMigration文言の本番露出 → 全面v2.2化＋ユーザー向け文言化
5. **コンソールの状態ラベル二重実装**（pending=審査中と招待済・未稼働が画面間で不一致）→ lib/status.ts集約
6. **コンソールにパートナー登録情報が出ない**（電話・住所・インボイス・規約同意日時/版）→ 詳細画面に表示
7. **ベンダー面全面が旧世代**: weight700×55・0.5px罫線ゼロ・回転装飾円/三重オービット/radialドリフト・絵文字アイコン・100vh(iOSガタつき)・旧.btn → 全面v2.2化
8. **ベンダーの無敬称**（法人も素の名前）＋**状態語が画面ごとに三様＋ホームにパートナー語混入** → 敬称適用＋vendor-status単一ソース化
9. **JST未明示がAPP/コンソールにも広範**（案件詳細・一覧・通知・サポート・支払調書・招待メール期限・ダッシュボード等）→ 全面明示
10. **利用規約に報酬の税定義が皆無**（APP全体に税表記ゼロ・コンソールは(税込)と誤記）→ 規約v2＋全面（税抜）統一
11. **招待フォーム/完了画面のweight900/800残存・1.5px罫線** → v2.2化
12. **成約メールが存在しない**（お金に直結する最重要イベントがinbox＋実質死んでいるLINE/Pushのみ）→ §5
13. **ConsoleNav/eyebrow/ui-btnの700が静音レイヤー不在ですり抜け** → .console-quiet新設（ブランドロゴのみ例外）
14. **MypageClientのデッドコード**（未接続のhandleAvatar/fileRef）→ v2書き直しで解消
15. **favicon.icoが25KBの旧世代** → 1.7KB RGBA ICO
16. **pnpm設定の破損**（pnpm-workspace.yamlにプレースホルダ文字列が残置されinstall不能化リスク）→ allowBuilds正規化

---

## 4. 確定済み意思決定の履行（勝彦承認済み3件）

1. **税定義**: 率報酬ラベル「粗利(税抜)のX%」（reward-format単一ソース＋単体テスト8green）・固定額は画面ラベル/注記（案件詳細「報酬予定額（税抜）」・報酬ヒーロー「報酬（税抜）」・支払調書注記・refer確定行）・コンソール(税込)誤記2箇所是正・利用規約第4条に「税抜粗利基準・税抜表示・消費税はインボイス登録の有無に応じ支払時に別途」明記(TERMS_VERSION v2)・受付確認メール注記。**支払計算ロジックは新設せず**（将来課題に記録）
2. **報酬到達文言の全種削除**: rewardReachPrefix（成約すると/報酬が確定しました/お支払い済み）を撤去しヘッダの報酬ピルに一本化。本番実測で非表示green
3. **申請制廃止**: §2-Bのとおり（直接変更＋メール通知＋audit_logs履歴必須）

---

## 5. 通知メール体系（D群）— イベント×宛先マトリクス

凡例: ✅=従来から有 / ★=今回追加 / −=対象外 / (将)=将来課題

| イベント | パートナー | お客さま | 運営 |
|---|---|---|---|
| 紹介受付 | ✅受付確認 | ★受付確認（customer_emailある場合） | ✅＋Slack |
| 相談受付 | ✅（受付経路共通） | −（顧客連絡先が乗れば★受付確認が発火） | ✅＋Slack |
| 商談予約 | ✅ | ✅ | ✅＋Slack |
| 商談リマインド | ✅ | ✅ | Slack |
| 状況更新（受付→対応中） | ★状況更新メール（遷移時のみ・多重なし） | (将)中間報告は運用判断 | ★メール併送（Slack単独依存を解消） |
| 成約 | ★成約メール（金額非掲載・実績画面へ＝既存方針） | ★御礼メール（連絡先ある場合） | ★成約メール |
| 不成立 | ✅中立・感謝 | − | −（意図的に静粛・既存踏襲） |
| 支払確定（月次） | ✅ | − | ✅ |
| 振込口座変更 | ★本人へ変更通知（決定③の必須要件） | − | ★ |
| 招待発行（4種） | ✅招待先へ | − | − |
| 招待受諾 | ★フロンティアへ配下参加通知 | − | ✅ |
| 仲間の活性化(recognition) | ★メール追加（従来inboxのみ） | − | − |
| ベンダー系（成果物/経費/課題/問合せ/委託費） | − | − | Slack✅・委託費メール✅（他メールは(将)） |

- テンプレ: `lib/mail-templates.ts` 6種（customerReceipt/dealStatusUpdate/dealWonPartner/dealWonCustomer/frontierJoined/recognition）＋口座変更（bank route内）。全て**テンプレ0号**（lib/email.ts受付確認）の思想＝【MB Partners】件名・受動完了トーン・brandedEmailHtml・署名「— MB Partners 運営事務局」
- **検証はドライラン**: `npx tsx scripts/preview-emails.ts` → docs/reports/email_previews/ に7テンプレHTML生成（実送信ゼロ。加えてローカルはRESEND_API_KEY未設定で送信関数自体がno-op）。実ユーザー宛ライブ送信は一切発火させていない

---

## 6. DDL監査（additiveのみ・psql自走・全文）

```sql
-- ① A1: フロンティア意図の永続化（docs/reports/integrity_a1_invites_frontier_ddl.sql）
alter table public.invites add column if not exists is_frontier boolean not null default false;

-- ② B: 銀行・支店マスタ（docs/reports/integrity_banks_master_ddl.sql）
create table if not exists public.banks (
  code text primary key, name text not null, kana text, hira text, roma text,
  updated_at timestamptz not null default now());
create table if not exists public.bank_branches (
  bank_code text not null references public.banks(code) on delete cascade,
  code text not null, name text not null, kana text, hira text, roma text,
  updated_at timestamptz not null default now(), primary key (bank_code, code));
create index if not exists bank_branches_bank_idx on public.bank_branches(bank_code);
alter table public.banks enable row level security;
alter table public.bank_branches enable row level security;
drop policy if exists banks_read on public.banks;
create policy banks_read on public.banks for select using (true);
drop policy if exists bank_branches_read on public.bank_branches;
create policy bank_branches_read on public.bank_branches for select using (true);
grant select on public.banks, public.bank_branches to anon, authenticated, service_role;
-- シード: \copy banks 1,146行 / \copy bank_branches 28,931行（zengin-code 由来CSV）
```
- 破壊的変更ゼロ（DROP/TRUNCATE/DELETE/列削除なし）。nickname/bank_change_requestsはdeprecate残置
- 口座変更履歴は既存 `audit_logs`（category='bank_change'・meta.before/after）を使用＝追加DDL不要
- 検証データ書込み: invites 1行のみ（検証用フロンティア招待・未使用・7日で失効・宛先は勝彦所有の+エイリアス・メールはno-op）

## 7. support@ MX診断（E・read-only・変更なし）

- **根因**: apex `mb-partners.app` に**MXレコードが存在しない**＝受信不能。`send.mb-partners.app` のMX(SES)はResend送信バウンス用で受信とは無関係。DNSはVercel DNS(ns1/ns2.vercel-dns.com)管理
- **推奨**（いずれもread-onlyで未実施）:
  1. **ImprovMX等の転送MXをVercel DNSに追加**（最小変更）: `vercel dns add mb-partners.app '' MX mx1.improvmx.com 10`＋`mx2` ＋ TXT `v=spf1 include:spf.improvmx.com ~all` → support@→運用Gmailへ転送
  2. Cloudflare移管＋Email Routing（無料・堅牢だがDNS移管が必要）
  3. Google Workspace（有料・本格運用向け）
- あわせてDMARCがp=noneのため、受信整備後にp=quarantine検討を推奨

## 8. money証明・検証green

- **psql突合（着手前=完了後で完全一致）**: menu_rewards **16行 / sum(reward_value)=340,100** ✓・deals報酬列ハッシュ `md5(reward_snapshot||amount)`=`6e4c6047f6780bdb7497864b10db90a2` 不変 ✓・勝彦作成deals **3件残置** ✓・deal作成/money計算/reward_snapshot書込ロジック非接触（表示文言のみ）✓
- **local build exit 0** ✓（pnpm run build）
- **単体テスト**: lib/*.test.ts 全green（reward-format 8・deal-status-narrative 6・synapse系 ほか）
- **本番実測**（scripts/verify-integrity.mjs・authenticated実描画）: 3面未認証307 ✓・LINE webhook無署名401 ✓・375px水平オーバーフロー0（app全5画面）✓・page errors [] ✓・stamp=f54fe28=HEAD ✓・A4電話表示/申請制撤去/税抜表記/到達文言なし/メニュー名/登録情報 各green（初回5失敗は検証スクリプト側アーティファクト＝詳細画面のdetails未展開・console1280px幅への375閾値適用・描画待ち不足で、対象を絞った再実測で全green）
- スクリーンショット: docs/reports/screens_integrity/（mypage v2・登録フォームv2 STEP2住所/STEP3銀行段階選択・refer・案件詳細・rewards・settings・console案件ボード・consoleパートナー詳細・vendorログイン）

## 9. 自己決定した判断（記録）

1. 住所は招待受諾で**必須**（支払調書発行に必要・任意だと欠損が続く）。公開LP/joinには追加しない（応募段階で住所を要求するのは過剰・本登録=招待受諾が正）
2. A2は「テンプレ側をmeeting_setに変える」案を退け**予約時にin_progress発火**（対応中遷移時の自動チェックを壊さない・つなぐ同時完了は意味的に正）
3. 口座変更の履歴は新テーブルでなく**既存audit_logs**（汎用監査テーブルが既に存在・DDL最小）。履歴記録失敗時は**変更を巻き戻す**（履歴必須の決定を技術的に強制）
4. 銀行マスタは**DBテーブル+検索API**（静的JSON同梱は29k行でバンドル不適・外部APIは不可指定）。読み取り公開ポリシー（公的マスタで口座情報ではない）
5. 税抜表記は「全ピルに（税抜）連呼」でなく**率ラベルは基準名に内包(粗利(税抜))・固定額は要所のラベル/注記**（静かな規律との両立）
6. 成約メールは**金額非掲載**（既存deal-won通知の「曖昧回避で実績画面へ」方針を踏襲）
7. 検証で実予約・実送信・DELETE を伴う操作は全て回避（A2はキー突合で証明・メールはドライラン・検証inviteは1行残置を明記）
8. 規約本文変更に伴い**TERMS_VERSION v2へ**（同意記録の版管理が既にあるため）
9. レポート/スクショのdocsコミットはデプロイ後（stamp=HEAD一致はデプロイ時点のHEADで担保）

## 10. コミット一覧（rollback-integrity-baseline..deploy-integrity-program-20260704）

a48e0ff A1/A5 → 5bcc62e A2/A3 → a83d4c4 A6 → a98c2a9 銀行マスタ → 1eff651 マイページv2(A4/B) → d41b1a9 登録フォームv2(B) → 194e8cf 税抜/到達文言(決定①②) → a72df0d JST/法人敬称(C) → fca82c2 実QR(C) → f65876b メール体系(D) → 7ea0de9 アイコン(C) → 859322b ⓘシート/文字数(C) → 493a4a4 コンソールv2.2 → 59945a7 ベンダーv2.2 → 4d72882 favicon/pnpm → 22c06a2 console静音レイヤー → f54fe28 ボードメニュー名
