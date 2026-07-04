# MB Partners デリバリー全面進化＋PWA招待動線プログラム 統合レポート（2026-07-05）

自走・無確認で完遂。土台=`9d57b45` → 3コミット → **デプロイHEAD=`c645270`（READY・stamp実測一致）**。
実行モデル: **Claude Fable 5**（claude-fable-5）。

- タグ: `deploy-vendor-evolution-20260705`=c645270 ／ `rollback-vendor-evolution-baseline`=9d57b45
- 検証green: build exit 0・3面307・LINE webhook無署名401・page errors []・stamp=c645270=HEAD・money確認（§終）・
  **test:session 26/26 green（本番）**・**ベンダー登録E2E 14/14 green（ローカル本番ビルド）**・canon 61 green

## 柱1 — ベンダー全画面の APP 水準化

診断（サブエージェント全数監査）の結論: **shell/nav/設定は既に単一ソース共通化済（BR-V3）で、前バッチで profile/設定/通知も刷新済**。ベンダー面は大半が既に v2.2 準拠で、実違反は外科的に数点のみ（むしろ vendor support/terms は APP 版より規律準拠が進んでいた）。修正:

| 対象 | 違反 | 修正 |
|---|---|---|
| rewards/page.tsx | `RewardHero`/`StatusPill` が `.rh-q` 外＝内蔵 weight 800/600/700 で描画 | APP と同じく `.rh-q` でラップ→500 静音化・StatusPill 塗りピル→**dot+text**（ベンダー面の状態表現を全面統一）・常設説明文撤去 |
| VendorOfferActions | `background: var(--amber-bg)` の余計な塗り | 白面＋0.5px罫線＋余白へ（塗り撤去） |
| VendorCaseTabs | active タブが青塗り／常設ヒント／`＋ 提出する` | 白＋影（APP セグメント同型）／ヒント撤去（構造が語る）／`提出する` |
| VendorCaseExpense | `＋ 経費を申請` | `経費を申請`（記号前置き除去） |
| InstallHint（3面共有） | weight 800・1px 罫線・旧 btn クラス | weight 500・0.5px・ui-btn（**同時適用ルールで3面に反映**） |

全画面スクショ: `vendor_home` / `vendor_cases` / `vendor_case_detail` / `vendor_rewards` / `vendor_mypage_new` / `vendor_mypage_edit` / `vendor_inbox_new` / `vendor_settings_new`（docs/reports/screens_integrity/）。
自己監査: 装飾絵文字ゼロ・生 `<b>` の重い inline weight ゼロ・塗りは「1画面1つ（ヒーロー）」原則・状態は dot+text 統一。

## 柱2 — PWA招待動線の端到端完成（2系統）

### 動線マップ（診断）

**リファラル（partner）**: `/invite/[token]` → 4step ウィザード（アカウント→基本情報→報酬受取→確認と同意・住所/電話/税区分/BankBranchSelect段階選択/口座/インボイス/規約リンク文中同意）→ `POST /api/invite/accept`（partners へ全項目永続）→ 祝福画面＋Partnerコード → `/app`。**完成済（基準）**。

**ベンダー（before）**: `/vendor/accept/[token]` → **フラット1画面（お名前＋パスワードのみ）** → `POST /api/vendor/accept`（`{token,email,password,name}` のみ）→ `/vendor`。
- **KYC黒穴**: mypage は 振込先/税区分/インボイス を「本人確認で確定した項目」として lock 表示するのに、**登録が一切収集せず永続もしない**→新規ベンダーは全項目「—」のまま、自力で埋める手段ゼロ。規約同意も未取得。

### 改善（after・partner と同一文法へ）

- **VendorAcceptForm を4stepウィザードへ全面刷新**（partner InviteForm と同一文法・v2.2）: お名前/屋号・電話・住所・税区分（個人/法人）・**BankBranchSelect 段階選択**（全銀マスタ＋自由入力フォールバック）・口座種別/番号/名義カナ・インボイス・**業務委託規約/プライバシー文中リンク同意**・確認サマリ・完了祝福画面→ダッシュボード誘導。
- **`/api/vendor/accept` をフルフィールド受理・`deliveries` へ永続**: phone/address/tax_type（日本語ラベル）/bank_name/bank_branch/bank_account（種別+番号結合＝myp表示「普通1234567」一致）/bank_holder_kana/invoice_number/terms_agreed_at/privacy_agreed_at。**既存プロフィールの role は非上書き**（前バッチの identity 不変条件を維持）。
- **additive DDL**: `deliveries.terms_agreed_at` / `privacy_agreed_at`（partner の partners.terms_agreed_at と対称・NULL許容・監査全文 `docs/reports/vendor_onboarding_consent_ddl.sql`）。
- **legal/terms** に `vendor` kind 追加（「業務委託規約」）。
- **格差全件解消**: 診断で挙げた11項目（wizard/phone/address/tax_type/bank picker/account/invoice/terms/privacy/完了画面/API受理）を**全て解消**。未解消ゼロ。

### PWA

- vendor は独自 manifest（start_url/scope `/vendor`・standalone・theme/bg・apple-touch-icon・appleWebApp）を既に保持＝**ほぼ parity 済**。今回 **`vendor.webmanifest` に 16/32 favicon を追加**（app/console と完全一致）。
- InstallHint はルート layout 配下＝**vendor にも表示**（standalone 検出/dismiss 記憶つき・押し付けない・v2.2 化済）。
- **認証永続**: cookie は host-scoped ＝ standalone 起動（start_url `/vendor`）で `mb-auth-vendor` が保たれ、ログイン済みダッシュボードに直達。セッション分離レイヤー（前バッチ）と整合。

### タップ数/入力数（招待リンク→ダッシュボード初回到達・実測）

| | before | after |
|---|---|---|
| ベンダー（完全なオンボーディング） | **不可能**（登録が KYC/振込を収集せず、mypage は「—」・自力補完手段なし） | **タップ9 / 入力10** で完全登録（振込情報まで確定）→ダッシュボード到達 |

before は「タップ3・入力2」で終わるが**振込情報が空**の使い物にならない状態だった。after は partner と同水準の完全登録を9タップ/10入力で達成（E2E実測）。

## 恒久ルール — 今後の同時適用チェックリスト（雛形）

APP に改修を入れたら、同一バッチで以下をベンダー（および該当すればコンソール）にも適用する:

- [ ] 画面/文言: 追加・変更した画面の v2.2 規律（weight500・dot+text・塗りは1画面1つ・記号前置きなし・説明文は操作の瞬間）をベンダー等価画面にも適用したか
- [ ] 登録/認証: 登録項目・KYC・同意記録・認証入口を変えたら、ベンダー accept／`/api/vendor/accept`／deliveries 永続にも反映したか（identity の role 非上書きを維持）
- [ ] 通知/設定/プロフィール: 3タブ文法・編集文法・共通部品（SettingsScreen/ProfileHeader/AvatarEditor）を流用したか
- [ ] PWA: manifest/アイコン/start_url/認証永続を両系統で確認したか
- [ ] 検証: `pnpm test:session` 26/26・`pnpm test:canon`・build/307/webhook401・money（CCが変えていない確認）・残置ゼロ・eslint 認証封鎖
- [ ] スクショ添付（事後デザインレビュー対象）

## §終 money証明・残置ゼロ

- money: **CC の作業で deals 報酬ハッシュ不変**（`48a896fa…`・バッチ前後一致）・menu_rewards **16行/340,100**・確定ガード/reward_snapshot 非接触・勝彦deals **3件**。
- DDL: additive 2列のみ（deliveries.terms_agreed_at/privacy_agreed_at・監査全文添付）。ライブ送信ゼロ（RESEND鍵不在・招待メールはローカルskip＝構造保証）・実予約ゼロ。
- **実データ操作禁止則の順守**: 全UI書込は CC自作 throwaway（onboard1・vshot2・session/dual）で実施し撤去。実データ読取のみ・汎用セレクタ不使用（ダイアログ/ウィザード内の特定要素駆動）。撤去後 psql実測: profiles/deliveries throwaway 残置 **0**・deals 6（勝彦/米井の正当データのみ）。
- test:session 26/26（本番・コールドスタート耐性リトライで安定）・eslint 認証封鎖維持・3面分離維持。

## コミット（rollback-vendor-evolution-baseline..deploy-vendor-evolution-20260705）
c645270 デリバリー全面進化＋PWA招待動線完成（柱1外科修正＋柱2登録ウィザード/API/DDL/manifest）（＋test:session 安定化コミット）
