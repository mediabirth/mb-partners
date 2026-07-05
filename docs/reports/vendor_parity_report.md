# MB Partners ベンダー×APP完全整合プログラム 統合レポート（2026-07-05）

自走・無確認で完遂。土台=`c645270` → 4コミット → **デプロイHEAD=`126027b`（READY・stamp実測一致）**。
実行モデル: **Claude Fable 5**（claude-fable-5）。

- タグ: `deploy-vendor-parity-20260705`=126027b ／ `rollback-vendor-parity-baseline`=c645270
- 検証green: build 0・3面307・webhook401・page errors []・stamp=126027b=HEAD・money確認（§終）・**test:session 26/26**・canon 61

## 前提の是正 — 「共通化済」は自己監査ベースの誤りだった

勝彦さんの実機判定は正しく、過去レポートの「共通化済」「partner同等」は**実描画を測っていない主張**でした。本バッチは実レンダリングを1:1突合し、**parityを証跡（対比スクショペア）で成立**させました。判明した事実:
- **設定画面**のみ真に単一ソース（SettingsScreen）共有。
- **マイページ・ログインは実は非共有**の別実装で、mypage は編集文法・ロック対象・空状態トークン・ボタン系・バッジまで別物だった（ヘッダに内部語彙「デリバリー」も露出）。

## A. 全画面 parity 監査と修正（1:1対比）

### マイページ（最重要・全面書き換えで1:1化）
`VendorMypageClient` を APP `MypageClient` と同型へ全面書換。対比スクショ `parity_app_mypage_view.png` ⇔ `parity_vendor_mypage_view.png`（＋ `_edit`）で構造一致を確認。

| 要素 | before（乖離） | after（APP同型） |
|---|---|---|
| 見出し | span 1rem・extra「プロフィール」ラベル | **h2 .98rem「マイページ」**（APP一致・余分な小見出し撤去） |
| バッジ | 「MB Partners デリバリー」＋別枠code | **display_code の `chip chip-referral`**（partnerCode と同型） |
| メール | lock なし | **ログインID ロック**（APP一致） |
| 税区分 | 生 enum「individual/corporate」 | **個人/法人 にマッピング** |
| 空状態 | 「—」 | **「未登録」**（APP一致） |
| 口座 | 生値露出 | **「種別 ***下4桁」マスク**（APP一致） |
| 銀行ラベル | 「銀行・支店」「名義（カナ）」 | **「銀行 / 支店」「名義(カナ)」**（APP一致） |
| 編集文法 | インライン行(label左/入力右) | **フルスクリーンカード・Fld(label上)・トースト保存**（APP一致） |
| ボタン | ui-btn・編集=outline | **btn btn-p/btn-g・編集=塗り**（APP一致） |

**正当な固有差（理由付き）**: お名前/税区分/振込先/インボイスは **KYC確定項目**のため編集不可（`FldDisabled`＝APPは編集可）／パートナーコード・フロンティアカードは受託者に無し（display_code バッジで代替）。

### 設定・ログイン・登録
- **設定**: 既に SettingsScreen 単一ソース＝真の parity。差分はすべて正当（サービスガイド/LINE/招待/Pushは紹介者・partner専用で非表示、規約ラベルは「業務委託規約」）。対比: `parity_{app,vendor}_settings.png`。
- **ログイン**: ロゴ・eyebrow・フィールド・ボタン・エラー・フッター注記は完全一致。見出しは面固有コピー（partner=紹介／受託者=成果）＝正当差。
- **登録**: ステップ scaffold（4step・ラベル・プログレス・card/input/Field）は共有。ボタン系（btn btn-p/btn-g）・罫線1px・トグル書式を APP に一致化。対比: `parity_{app,vendor}_register.png`。正当固有差=屋号単一/業務委託規約/パートナーコード無し。

## B. 内部語彙の対外露出全廃（ユーザー可視ゼロ）

`grep -rn "デリバリー|ベンダー"` の**ユーザー可視ヒットを全処理**（残存は全てコード内コメントのみ＝可視露出ゼロを確認）。

| # | 箇所 | before | after |
|---|---|---|---|
| 1 | mypage バッジ | MB Partners デリバリー | display_code chip（TA4821 等） |
| 2 | register h1 | デリバリー登録 | **MB Partners 登録** |
| 3 | register 完了文 | MB Partners デリバリーへようこそ／委託案件 | MB Partners へようこそ／案件 |
| 4-5 | terms 本文/副題 | デリバリー（実行者） | **受託者**（契約用語） |
| 6 | PWA description | デリバリー（業務委託先）ポータル | 業務委託先ポータル |
| 7-8 | 招待メール本文（lib/email.ts・mail-registry） | 業務委託先（デリバリー）として | 業務委託先として |
| 9 | mail-registry trigger（運用向け） | 業務委託先（デリバリー）を招待したとき | 業務委託先を招待したとき |

**対外呼称の正典**（copy-guideline §5c に恒久追記）: 面名/ヘッダ/PWA名=「MB Partners」のみ・partner=「パートナー」・受託者は役割語を出さず氏名/屋号＋ID表記。**ID表記は3面同型**（`chip chip-referral`・Inter・letterSpacing .08em / partners.code ⇔ deliveries.display_code）。
**ID採番**: deliveries.display_code を partnerコード同型式（英字2+数字4）で `vendor/accept` 時に採番＋既存実データを backfill（神原商店→`KA6031`・additive・ID空欄の補完でmoney非接触）。

## C. 登録フロー差分全数表

| ステップ/項目 | 同一化 | 固有差（理由） |
|---|---|---|
| ステップ構成（アカウント→基本情報→報酬受取→確認と同意） | ✓ 同一 | — |
| 見出し | — | 「MB Partners 登録」（受託者に「パートナー」語を使わない） |
| 氏名 | — | 「お名前/屋号」単一（partnerは姓/名） |
| 電話・住所・区分・銀行(段階選択)・口座・インボイス | ✓ 同一（ラベル/順序/バリデーション） | — |
| 規約同意 | ✓ 文中リンク体裁同一 | リンク先=業務委託規約（?kind=vendor） |
| 完了画面 | ✓ 祝福＋CTA同一 | パートナーコード表示なし（受託者に無し） |
| ボタン/罫線 | ✓ btn btn-p・1px に一致 | — |

E2E（前バッチ＋本バッチ）: 招待→4step登録→deliveries全項目永続→ログイン→ダッシュボード到達→PWA維持を **14/14 green**（タップ9/入力10）。両面 throwaway の登録一気通貫を実測。

## §終 money証明・残置ゼロ

- money: **CC の作業で deals 報酬ハッシュ不変**（`48a896fa…` 前後一致）・menu_rewards **340,100**・確定ガード/snapshot 非接触・勝彦deals **3件**。
- DDL 追加ゼロ（前バッチの terms/privacy_agreed_at を使用）。display_code backfill は既存 additive 列の**空欄補完**（money非接触・partner の code 採番と対称）。
- ライブ送信ゼロ（RESEND鍵不在・構造保証）・実予約ゼロ。
- **実データ操作禁止則の順守**: 全UI/登録書込は throwaway（parity撮影用 vendor/partner・onboard・session/dual）で実施し撤去。実データは読取と ID空欄の補完のみ。撤去後 psql実測: throwaway profiles/deliveries 残置 **0**。
- test:session **26/26**（本番・ウォームアップでコールドスタートflake根絶）・eslint 認証封鎖維持・identity 不変条件（role/name非上書き）維持・3面分離維持。

## 対比スクショ（証跡・docs/reports/screens_integrity/）
`parity_app_mypage_view` ⇔ `parity_vendor_mypage_view`／`parity_app_mypage_edit` ⇔ `parity_vendor_mypage_edit`／`parity_app_settings` ⇔ `parity_vendor_settings`／`parity_app_register` ⇔ `parity_vendor_register`

## コミット（rollback-vendor-parity-baseline..deploy-vendor-parity-20260705）
126027b APP1:1整合＋内部語彙全廃＋登録同一化 → ウォームアップ安定化（＋docs）
