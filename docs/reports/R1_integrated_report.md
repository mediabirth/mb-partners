# MB Partners 微調整 R1（F→…→H 後続）統合レポート（2026-06-16）

自走・無確認で実行。各バッチ build+検証→ vercel --prod。プラン変更なし。マスター整合(5/9)・host/role分離・既存deal frozen 不変。破壊操作なし（検証案件は都度削除）。`deals.customer_type/company_name/contact_name` は適用済み列を使用（追加DDLなし）。

| バッチ | 内容 | commit | deploy |
|---|---|---|---|
| Batch1 | ⑦フォーム・⑧敬称・⑨やること・④⑤⑥トーン | `eef78f3` | (中間) |
| Batch2 | ①②③カレンダー | `a601137` | `5r0197ies`（最新・本番反映） |

## ⑦ フォーム（個人/法人）
- 紹介/協力フォーム（refer）＋顧客予約（/book）に「お客様の種別（個人/法人）」を追加。
- 個人→「お客様のお名前／ご紹介先のお名前」、法人→「会社名＋ご担当者名（任意）」。ラベル明確化でパートナーの自己名入力を防止。
- `customer_type/company_name/contact_name` を保存（refer=deals、/book=client_name へ会社名(担当)を合成）。

## ⑧ 敬称
- `lib/customer.ts`：個人「氏名 様」／法人「会社名 御中　担当者名 様」。
- 適用：案件一覧・ホーム(やること/商談予定/最近の動き)・案件詳細・報酬内訳・コンソール案件ボード・受付確認メール。（クエリに3列追加）

## ⑨ やること表記
- ホーム「やること」の商談予定を「お客様名 様（メニュー名について）＋日時」に（サービス名でなくメニュー名＋「について」）。

## ④⑤⑥ 見た目・トーン（B/B2のcount-up主役方針を上書き）
- ④ サービス選択：ブランドアクセント枠を削除→ニュートラル（ロゴ＋名前＋一言）。
- ⑤ 関わり方：枠の色を削除しメニューリスト然と。対応範囲は中立タグ。報酬の連呼/強調を廃し控えめ。
- ⑥ 報酬表記：デカデカ/煽りを廃し「目安」として控えめに添える。完了は感謝表現（「ご紹介ありがとうございます」「お預かりしました」）。派手なcount-up等を抑制。

## ① 予約フロー
- partner自己予約（BookingDrawer）：ワンタップ＝即予約 → **選択→「予約を確定」** に変更。
- 顧客 /book：⑦属性フォーム（選択→情報入力→確定）。**予約完了で顧客へ完了メール**（Resend `sendBookingConfirmEmail`、ベストエフォート、日時＋打ち合わせ案内）。
- `/api/availability` を刷新：**Google未接続でも必ず既定空き（平日9:00-18:00／30分）を提示**。除外＝既存 `deals.meeting_at` ＋（連携時）Google FreeBusy。検証：未接続で18枠提示。
- ※「顧客ページと自己予約の完全な同一コンポーネント化」は、顧客=公開(/api/availability)・自己=認証(/api/calendar/slots)で経路が異なるため、空き表示ロジック/挙動（選択→確定・既定空き・既存予約除外）を統一。UIコンポーネントの物理共有は今後の課題。

## ②③ コンソール カレンダー（UI設置済・本番有効化に勝彦の操作＋DDLが必要）
- **③ 設定UI**（`ConsoleCalendarCard`, console/設定）：営業時間（既定9:00-18:00）／土日予約不可／祝日予約不可／枠間隔／前後バッファ。
- **② Google連携ボタン** 設置（「Googleと連携する」）。
- slots の既定値も 9:00-18:00 に統一（現状は既定で算出、連携後は実 free/busy）。

### ▶ 勝彦の操作（②）：Google認可ワンクリック
1. Google Cloud Console で OAuth 同意画面が「本番」または自分のGoogleアカウントがテストユーザーに登録済みであること（スコープ：calendar.readonly / calendar.events）。
2. リダイレクトURI `GOOGLE_REDIRECT_URI`（既存env）が承認済みであること。
3. コンソール設定の「Googleと連携する」を押し、MB運営のGoogleアカウントで認可。

### ▶ DDL（③ 設定保存＋②owner連携の保存先＝MB運営カレンダー）
現状 `calendar_links` は `partner_id`（partners FK）必須で、owner(勝彦)は partner レコードを持たない（role分離のため意図的）。MB運営カレンダーを安全に保存するため、専用シングルトン表を提案（要 勝彦 実行）:

```sql
-- MB運営カレンダー（単一）。Google接続＋営業時間設定を保持
create table if not exists public.mb_calendar (
  id              int primary key default 1,
  google_email    text,
  oauth_tokens    jsonb,            -- 暗号化済みトークン（lib/google-token 形式）
  active          boolean not null default false,
  business_start  text not null default '09:00',
  business_end    text not null default '18:00',
  no_weekend      boolean not null default true,
  no_holiday      boolean not null default true,
  slot_minutes    int  not null default 30,
  buffer_minutes  int  not null default 0,
  updated_at      timestamptz not null default now(),
  constraint mb_calendar_singleton check (id = 1)
);
alter table public.mb_calendar enable row level security;
grant select, insert, update on public.mb_calendar to service_role;
insert into public.mb_calendar (id) values (1) on conflict (id) do nothing;
```

適用後にこちらで：(a) console「保存する」を `mb_calendar` へ永続化、(b) Google OAuth(owner) を `mb_calendar` に保存、(c) slots/availability を `mb_calendar`（MB運営基準）の設定＋実busyで算出、へ配線します（コード準備済・接続のみ）。

## 本番疎通
apex/console login=200。`/api/availability`（未接続）=既定18枠提示・connected:false。

## スクショ
- `docs/reports/review_screens/r1_batch1/`：service_select_neutral / engage_calm / form_corporate / home（様・について）
- `docs/reports/review_screens/r1_batch2/`：book_slots / book_form_corporate / console_calendar

## 備考
- DXロゴは reso 画像を暫定流用中（前タスクの依頼どおり）。専用ロゴ受領で差し替え可。
