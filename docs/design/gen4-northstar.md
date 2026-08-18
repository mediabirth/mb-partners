# GEN-4「計測」— 2回目紹介率ダッシュボード 設計書 v1

- 日付: 2026-08-18 ／ 起案: リード ／ 承認: 勝彦（GEN-4着手指示 2026-08-18・完全自走）
- 位置づけ: GENプログラム最終章。North Star=**2回目紹介率**（1回紹介した人が2回目を紹介する率）を
  正典定義で常設計測し、GEN-1〜3の効果を同じ画面で読めるようにする。
- 大原則: 数字は正直に。母数が小さいうちは率を誇張しない（分母0は「—」・n=を常に併記）。
  決定的集計・AI不使用・money非接触。

## 1. 設計判断（リード裁定）

1. **新ページは作らない**。既存 `/console/growth`（紹介ファネル計測）の冒頭に「North Star」節を追加し、
   GENループ週次表・パートナーステージを同居させる（計測面の分散を防ぐ）。
2. **起票時のsrc捕捉を追加して帰属ループを閉じる**: GEN-2は閲覧(landing_view)までしかsrcを持たない。
   `/r/` の起票POSTに src を透過し `deals.src`（additive・nullable）へ保存する。
   これで digest/card → 閲覧 → **起票** まで一本の線で読める。
3. consoleはowner面なのでパートナー実名/コード表示は可（匿名化はGEN-3の対外面のみの規律）。
4. 高価な集計はページ内オンデマンド（force-dynamic・edge）＋現行growthページの文法を踏襲。
   規模が小さいうちはクエリ最適化より定義の正しさを優先する。

## 2. 仕様

### 2.1 起票時のsrc捕捉（帰属ループの完成）
- migration（additive）: `alter table public.deals add column if not exists src text null;`
- `/r/[token]` client: URLの `?src=`（allowlist: digest/card）を POST `/api/referral` body に同送。
- `/api/referral` route: src を allowlist 検証して deals insert に**メタデータとして**追加。
  ★reward_snapshot・token帰属・凍結・moneyロジックは1行も変えない（srcは挿入objectへの
  nullable 1フィールド追加のみ）。deals 報酬ハッシュ（reward_snapshot+amount）は定義上不変。
- 旧形リクエスト（src無し）= null（後方互換）。不正値も null。

### 2.2 North Star節（/console/growth 冒頭）
- **2回目紹介率** = 紹介2回以上のパートナー数 ÷ 紹介1回以上のパートナー数。
  - 「紹介」= deals 起票（is_system/内部シンク/cc-monitorパートナーを恒久除外。直営=MBHOUSEは
    is_systemで自然除外）。
  - 表示: `X%（n=a/b）`。分母0は `—（まだ最初の紹介がありません）`。
- **1→2回目の中央値日数**: 2回以上の各パートナーの（2件目created_at−1件目created_at）の中央値。
  対象0人は `—`。
- 補助: 紹介1回で止まっている人数（=次の一手の対象）。

### 2.3 GENループ週次表（直近8週・JST週=月曜開始）
| 週 | digest送信 | digest閲覧 | card閲覧 | 共有操作 | 起票 | うちdigest/card起票 | 成約 |
- ソース: mail_log(template_key='weekly-digest', status='sent') ／ funnel_events(landing_view×src)
  ／ funnel_events(share) ／ deals(created_at, src) ／ deal_events(成約確定遷移=GEN-3と同一定義・
  lib/social-proof の WON_EVENT_BODY を re-export して共有。文字列の二重定義禁止)。
- 全列0の週も行は出す（時系列の連続性はダッシュボードでは正義。GEN-3の抑制規律はこの面には適用しない
  =owner面は空白も情報）。

### 2.4 パートナー・ステージ
- 3ステージ集計: 未紹介 ／ 1回 ／ 2回以上（リピーター）。人数と一覧（code・名前・紹介数・最終起票日）。
- 一覧は紹介数desc→最終起票desc。0件パートナーも掲載（「火を待つ人」が見える）。

### 2.5 実装配置
- `lib/north-star.ts`: 集計と計算の純粋部（率・中央値・週次バケット）を分離しcanonで固定。
- `/console/growth` server component内で既存クエリ群と並列取得。PageGuide GUIDE_GROWTH を同一バッチで追随。

## 3. 境界・不変
- money非接触: 集計は件数と日時のみ（amount/reward/fee列をselectしない）。deals.src追加は
  非money列・報酬ハッシュ定義外。reward_snapshot凍結・/api/referralの帰属/凍結ロジック不変。
- funnel_events・mail_log への書込なし（読むだけ）。GEN-1〜3の挙動不変。
- 認証: /console/growth 既存gate（owner/manager）のまま。

## 4. 検証（実装バッチ合格条件）
1. 単体（canon）: 率・中央値・分母0の「—」・週次バケット境界（JST月曜）・src allowlist の全分岐・決定性。
2. throwaway E2E: ①partner A=2件起票/B=1件/C=0件 → 率50%(n=1/2)・ステージ1/1/1・中央値=実差分日数
   ②POST /api/referral src=digest → deals.src='digest'・src不正→null・**reward_snapshot構造が
   従来と全ビット同形式**（src以外のフィールド差分なし）を機械比較 ③全撤去→原状復帰・残置0。
3. 本番実測: growth頁の各数値=psql直接集計と全桁一致（ペルソナの真実）・375px溢れ0・pageerror 0。
4. /r/ 実ブラウザ: ?src=digest付きで起票→deals.src記録（throwaway・FK連鎖撤去）。
5. 品質ゲート7項目（PageGuide追随込み）・test:verify全green・money 4ハッシュ前後一致
   （deals hashはE2E中に変動→撤去後に開始値へ復帰することを含めて証明）・残置ゼロ。

## 5. GEN-4後の状態＝GENプログラム完成
- 鼓動（GEN-1）が機会を配り、道具（GEN-2）が会話に載り、火（GEN-3）が動機を灯し、
  計測（GEN-4）が「2回目紹介率」でループの健全性を毎週語る。
- 以後の改善は勝手な思いつきではなく North Star の実測に従う（どの施策が2回目を生んだかを
  src帰属で読める状態）。
