# 協力報酬の起票時凍結 — 設計書 v1

- 日付: 2026-07-23 ／ 起案: Claude Code（リード）／ フェーズ: **設計のみ（実装なし）**
- 裁定: 勝彦 2026-07-23 ＝ **(b) 起票時凍結**（紹介報酬と同型に揃える）。本書は実装バッチ発行前の正典。
- 関連正典: partner-reward-override-design.md §0（「案件作成時＝現行実装の凍結点」）・CLAUDE.md 凍結思想

## 1. 現状の非対称（監査 2026-07-23 発見事項⑧）

| 報酬 | 凍結点 | 確定時の読み元 |
|---|---|---|
| 紹介 ref_* | 起票時に reward_snapshot へ焼く | snapshot（override_applied 案件は snapFirst で snapshot 優先） |
| **協力 coop_*** | **凍結なし** | **`ctx.service_menus` からライブ**（`app/api/console/deals/[id]/route.ts` 確定処理） |

帰結: 起票→成約の間にメニューの協力報酬（coop_type/coop_value/coop_base/coop_enabled）を編集すると、進行中案件の確定額が黙って新値になる。パートナーが申込時に見た条件と支払条件が乖離し得る。

## 2. 設計（最小差分・2点のみ）

### 2.1 起票時: coop_* を snapshot へ焼く

- 対象経路: `app/app/refer/actions.ts`（channel='cooperation' で起票される唯一の経路。/r/ 顧客相談・console 直営業は cooperation を持たない＝実装時に channel 別の起票経路を grep で再確認し、cooperation が通る経路全てに適用）。
- 焼く内容: 起票時点のメニューの `coop_enabled / coop_type / coop_value / coop_base` を reward_snapshot に `coop_*` キーで追記（既存キーは不変・additive）。
- 協力ゲート（必須タスク未達→紹介ダウングレード）のロジックは**不変**。ダウングレード先の ref_* は既に凍結済み。

### 2.2 確定時: snapshot 優先（snapFirst と同型）

- `app/api/console/deals/[id]/route.ts` の協力レート採用部:
  `snap.coop_* が存在する案件は snapshot を正とし、無い案件（本改修以前の起票・後方互換）は現行どおり menu ライブ`。
  fee_snapshot=null 後方互換・ref_* の snapFirst と同一パターン＝新規原理なし。
- 既存進行中案件への backfill は**しない**（凍結思想の対称: 「以後の新規案件から」のみ）。

## 3. money 整合

- 計算式の意味: 不変（読む値の凍結点が変わるだけ。式・端数・源泉は非接触）。
- deals reward-hash: 新規起票・確定で正当に変化（従来運用どおり帰属突合）。既存行への書込なし＝backfill 由来のハッシュ変化は発生しない。
- menu_rewards / fee / override ハッシュ: 不変。
- canon（status-effects）: 非接触見込み。confirm side-effects 不変を実装時に確認。

## 4. 検証（実装バッチの合格条件）

1. throwaway で cooperation 起票→メニューの coop_value を変更→成約確定→**確定額が起票時の値**（新値でない）を実測。
2. 改修前起票の cooperation 案件（snapshot に coop_* なし）→確定→現行どおり menu ライブ値（後方互換）。
3. 協力ゲート未達ダウングレード→ref_*（凍結済み）適用が不変。
4. money 4ハッシュ・test:verify 全 green・残置ゼロ。

## 5. 文書追随

- partner-reward-override-design.md §0 の「凍結思想の適用」に協力報酬も含まれる旨を実装バッチで追記。
- 実装後、CLAUDE.md の money 恒久不変領域の記述は変更不要（凍結点の追加であり意味変更ではない）。

---
*承認後、単独バッチ（tag: deploy-coop-freeze-20260723）で Codex へ発行する。是正パッケージAとは分離（money域は単独タグの規律）。*
