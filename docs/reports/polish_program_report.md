# MB Partners 磨きと速さのプログラム 統合レポート（2026-07-04）

自走・無確認で完遂。着手時HEAD=`f54fe28`（整合性プログラムのデプロイSHA・レポートdocsコミット58d5d33の直後から開始）→ 12コミット → **デプロイHEAD=`873609c`（READY・stamp実測一致）**。
実行モデル: **Claude Fable 5**（claude-fable-5）。監査4並列＋実装1並列のサブエージェント使用。

- デプロイ: `vercel --prod --yes --build-env NEXT_PUBLIC_BUILD_SHA=873609c --build-env NEXT_PUBLIC_BUILD_TIME="2026-07-04 11:59 JST"`
- タグ: `deploy-polish-program-20260704`=873609c ／ `rollback-polish-baseline`=f54fe28
- 検証green: local build exit 0・単体テスト全green・3面未認証307・LINE webhook無署名401・375px水平オーバーフロー0・page errors []・stamp=873609c=HEAD・money不変（下記§6）

---

## テーマ① メールの完全可視化と管理（成功基準1: 達成）

**構成**（全てadditive・コード直書きテンプレは「フォールバック」としてのみ残存＝成功基準充足）:
- `lib/mail-registry.ts` — 全**19テンプレ**の単一ソース（key・宛先・イベント・変数辞書＋実データ風サンプル・既定件名/本文・CTA）
- `lib/mail-send.ts` — `sendTemplatedEmail`: DB上書き（message_templates category=key・件名/本文とも）→無ければレジストリ既定。**mail_log へ必ず記録**
- `mail_log` テーブル新設（DDL§5）— いつ・誰に・どのテンプレ・結果（sent/skipped/error＋理由）。運営宛（sendOpsEmail）も記録
- 直書き16サイト＋既存resolveTemplate系3種＋招待4種を全て移行（lib/mail-templates.tsは廃止しレジストリへ一本化）
- **コンソール `/console/settings/mail`**（owner/manager）: ①テンプレート＝一覧（既定/カスタム/無効の状態ドット）→件名/本文編集・変数チップ・有効/無効・既定に戻す＋**実データ風サンプル差し込みのライブプレビュー**（sandbox iframe実描画） ②**送信マトリクス**＝イベント×宛先（パートナー/お客さま/委託先/招待先）の全体像1画面 ③**送信履歴**＝mail_log最新200件
- 実測: 管理API E2E（PUT上書き→resolve反映→DELETE→既定復帰）green／送信履歴E2E（ローカル招待発行→RESEND未設定で**skipped**が記録→本番画面で行表示）green／実送信ゼロ（管理画面からのテスト送信機能は意図的に未実装＝プレビューで体裁確認可能なため。将来課題に記載）
- スクショ: docs/reports/screens_integrity/ mail_admin_templates / mail_admin_matrix / mail_admin_log_prod

## テーマ② 文言規範と3面適用（成功基準2: 達成）

- **規範**: `docs/copy-guideline.md` v1（用語辞書・ステータス4語+終端「不成立」・送り仮名固定・全角括弧・中黒統一・「例：」形式・（任意）統一・ボタン動詞規則＋コンソール表内名詞形の明文例外・エラー文型「〈対象〉を〈動作〉できませんでした。〈次の行動〉」・APPトーン憲章・お客さま=ご契約/パートナー=成約の相手別語）
- **冗長削除の証跡（例示）**: 「デリバリー経費（承認済）」→「デリバリー経費」（console/page.tsx・console/deals/page.tsx の2箇所）／「経費（承認済 ¥…）」→「経費（¥…）」／「✓ 承認済み/✕ 却下済み」→「承認済/却下」／「未払(確定)」→「未払い（確定）」
- **主な全面適用**: お客様・顧客→お客さま（12箇所超・LOST_REASONSはDB保存値のため表示のみ`lostReasonLabel()`）／lib/status.ts confirmed「成約・確定」→「成約」＋各面のバンドエイド上書き撤去／粗利(税抜)→粗利（税抜）等の全角統一（テスト期待値更新・全green）／「·」→「・」23ファイル／汎用「エラーが発生しました」6箇所を対象明示＋次アクション型へ／「ご入力ください」→「入力してください」／？…全角化・「例：」21箇所統一／**APP絵文字ゼロ**（✨📈🚀🔥⚡🌱⚠✓＋Push通知の🎉！）／frontierの煽りトーン全面改稿（「さあ、〜しよう」→「〜しませんか」等）
- 意図的非変更: lib/legal/terms.ts（契約文言）・Slack運営内部通知の絵文字（内部向け）

## テーマ③ 張りぼての根絶（成功基準3: 達成・宙に浮いた要素ゼロ）

**(a) 動くように実装**
1. **Web Push死蔵の解消**（最重度）: インフラ（VAPID/API/SWチャネル）完成済みでUI未配線だった。設定「準備中」→実トグル（購読/解除・拒否中/未対応の正直表示・SW ready永久待ちをgetRegistration+3sタイムアウトで堅牢化）＋PushOptIn（許可のソフト前置き）をホームにマウント
2. **報酬「年間集計」の偽選択肢**: 支払明細と同一遷移だった→`?mode=annual`深リンク＋初期モード対応（本番実測green）
3. ヘルプFAQの陳腐化（撤去済みの「紹介/営業選択」を案内）→現行フローの文面へ
4. 改善: **案件一覧に検索**（6件以上で表示・お客さま名/メニュー絞り込み）

**(b) 削除（機能ゼロの装飾）**: ベンダーのLINE連携「準備中」カード（押下不能）／ベンダー設定のPush「準備中」行（partner紐付けのため対象外）／スケジュール「カレンダー連携（近日対応）」カード／`/app/calendar`（redirectのみ・流入なし）／console設定の死んだsaveCal一式／referの未使用chunk/dedupeTasks/InfoIcon

**(c) 削除・仕様判断の提案リスト**
- メール通知のオプトアウト（現状は情報表示のみ。配信制御の仕様判断が必要→member_notification_prefs流用で実装可能・コスト中）
- vendor/delivery向けLINE連携とPush（partner_line_links/push_subscriptionsのdelivery主体拡張が必要・コスト中）
- vendorカレンダー連携（コスト大・運用優先度判断）
- bank_change_requests＋console承認パネル（前プログラムからのdormant・削除候補）
- **設定待ち（コード修正不要）**: Slack通知は配線済みだが本番envに `SLACK_WEBHOOK_URL` が未設定＝トグルONでも沈黙。運用で設定すれば即有効

## テーマ④ パフォーマンス（成功基準4: 達成）

**宣言した数値目標**: モバイルLCP<2.5s／主要APIのTTFB中央値<300ms／Lighthouse Performance 90+相当（CLI未導入のためCore Web Vitals実測で代替判定）

**before/after 実測**（本番・authenticated・375px・3回中央値・scripts/perf-lcp.mjs）:

| ページ | LCP before→after | FCP before→after |
|---|---|---|
| APPホーム | 368→**256ms** | 280→256 |
| 案件一覧 | 572→**268ms** | 564→268 |
| 紹介をはじめる | 464→**312ms** | 368→264 |
| 案件詳細 | 824→**488ms** | 504→252 |
| 報酬 | 260→**296ms** | 232→296 |
| console案件 | 652→660ms | 184→168 |
| consoleホーム | 544→**244ms** | 252→244 |

- 全ページ LCP≦660ms＝**目標2.5sの1/4以下で達成**。TTFB全ルート中央値<200ms（未認証実測含む）。
- 実装: consoleダッシュボードの**DB往復7段→1段**（deals全行の重複再取得を削除＋直列await6本のPromise.all化）／ホーム・案件詳細の直列クエリ並列化／**銀行マスタ検索 pg_trgm GIN**（ilike '%みずほ%' 実測 **22.5ms→0.07ms**）／/api/services の swr 600→86400（cold 1.04sの再訪回避）／エラーページweight500化
- **安全条件の遵守**: 金銭・状態データのキャッシュはゼロ追加（全no-store維持・SWRのfocus再検証も不変）。クエリ変更は読み取り構造のみで結果不変
- 未達/見送り: console案件ボードのLCP（クライアントfetch律速・現状660msで実害なし→将来課題）／supabase-jsクライアント同梱61KB gz削減（認証フロー書き換え＝中リスクのため**提案リスト行き**）／フォントウェイト削減（joinのLP表現が600-900使用のため見送り）／Lighthouseスコア直接計測（CLI非導入・CWV代替）

## §5 DDL監査（additiveのみ・psql自走・全文）

```sql
-- ① mail_log（送信履歴）
create table if not exists public.mail_log (
  id bigint generated always as identity primary key,
  template_key text, event text, to_email text not null, to_role text,
  subject text not null, status text not null, detail text, meta jsonb,
  created_at timestamptz not null default now());
create index if not exists mail_log_created_idx on public.mail_log (created_at desc);
create index if not exists mail_log_template_idx on public.mail_log (template_key);
alter table public.mail_log enable row level security;
grant select, insert on public.mail_log to service_role;
grant usage on all sequences in schema public to service_role;

-- ② 銀行マスタ検索の高速化
create extension if not exists pg_trgm;
create index if not exists banks_name_trgm_idx on public.banks using gin (name gin_trgm_ops);
create index if not exists banks_hira_trgm_idx on public.banks using gin (hira gin_trgm_ops);
create index if not exists banks_kana_trgm_idx on public.banks using gin (kana gin_trgm_ops);
create index if not exists bank_branches_name_trgm_idx on public.bank_branches using gin (name gin_trgm_ops);
create index if not exists bank_branches_hira_trgm_idx on public.bank_branches using gin (hira gin_trgm_ops);
```
破壊的変更ゼロ。message_templates は既存スキーマをそのまま利用（列追加なし）。

## §6 money証明・検証データ

- menu_rewards **16行 / sum=340,100** 前後一致 ✓・deals報酬ハッシュ `6e4c6047f6780bdb7497864b10db90a2` 不変 ✓・勝彦deals 3件残置 ✓・報酬計算/reward_snapshot書込/deal作成 非接触 ✓
- 外部送信: **ライブ送信ゼロ**（ローカル検証はRESEND未設定のno-op＝mail_logに'skipped'として記録され、それ自体が送信履歴機能の実測証跡）。実予約ゼロ
- 検証残置データ: invites 1行（送信履歴検証用・未使用・7日失効）＋mail_log 1行（skipped）

## §7 自己決定した判断（記録）

1. テンプレ上書きの保存先は既存 message_templates を category=key で流用（新テーブルより既存のauto-messages/resolveTemplate資産と整合・列追加も不要）
2. 運営宛メールはテンプレ管理対象外・履歴記録のみ（内部通知の文面管理は過剰。マトリクスに注記）
3. テスト送信ボタンは未実装（ライブ送信ガードとの両立が曖昧になるため。プレビューで体裁確認可能・将来課題）
4. リマインドの既定件名は既存文言をfallbackで維持しつつ、DB上書き時のみ${stage}型に統一可能な設計
5. コンソール表内アクション（承認/却下/削除）は名詞形を規範の明文例外に（高密度UIでの可読性優先）
6. join LPの「顧客」は文脈書き換えで「お客さま」へ・display weight（900等）はLP表現として維持
7. supabase-js同梱削減は「速さのために正確さ（認証）を危険に晒さない」判断で提案リスト行き
8. LOST_REASONSはDB保存値と確認し、値は不変・表示のみ変換（データ互換維持）

## §8 コミット一覧（rollback-polish-baseline..deploy-polish-program-20260704）

b932ae3 メールレジストリ化+mail_log → f20faf8 メール管理画面 → 320040f 張りぼて根絶 → 8117c62/59d0... perf → f089ad4 文言規範適用 → 873609c PushToggle堅牢化（＋favicon等の中間fix）
