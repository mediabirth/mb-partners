# 相談案件の報酬凍結（メニュー確定時凍結）— 設計書 v1

- 日付: 2026-07-27 ／ 起案: リード ／ フェーズ: **設計のみ（勝彦承認待ち・実装なし）**
- 関連正典: coop-reward-freeze.md（起票時凍結の対称）・partner-reward-override-design.md（resolveEffectiveReward）・CLAUDE.md 凍結思想

## 1. 問題

「まず相談」案件（is_consultation・起票時 service/menu 未定・reward_snapshot=null・amount=0）は、
現行のままメニューを割当てて成約すると **reward_snapshot が null のまま＝報酬なし案件**になり得る。
起票時凍結の原則は「起票時にメニューが決まっている」前提であり、相談はその正当な例外。

## 2. 設計（凍結ポイントの追加・最小差分）

- **凍結点＝コンソールの「メニューを確定する」操作**（相談案件にメニュー/報酬行を割当てた瞬間）:
  1. 選択された menu_reward を正典として `resolveEffectiveReward`（パートナー個別条件を通常紹介と同一規則で解決）
  2. reward_snapshot へ通常起票と同一形（reward_*/ref_* 両キー・override_applied 痕跡・continuous月数）で凍結
  3. fixed は amount 即時反映・rate/continuous は amount=0（確定時計算＝既存規則）
  4. 同時に `freezeFeeSnapshot`（serviceId 確定に伴う系統条件の凍結・P0-a と同一 best-effort）
  5. deal_events に `consult_menu_fixed`（誰が・どのメニューへ）を記録・audit_logs 併記
- **再確定の規則**: メニュー確定後の変更は confirm 前に限り可（再凍結・イベント追記）。confirmed 以後は既存の確定ガードに従う。
- **後方互換**: 非相談案件・既存経路は 1 バイトも変更しない（凍結点の「追加」であり変更ではない）。

## 3. money 整合

- 計算式・端数・源泉・支払・請求は全て既存規則の流用（新規計算ゼロ）。
- deals ハッシュ: 相談案件のメニュー確定で正当に変化（従来運用どおり帰属突合）。
- menu_rewards/fee/override ハッシュ: 不変。canon 非接触見込み（confirm side-effects 不変）。

## 4. 検証（実装バッチ合格条件）

1. throwaway: 相談起票→メニュー確定→snapshot 凍結値=正典（override 有無両ケース）→menu 値変更→確定額不変（凍結の証明）。
2. 相談起票→メニュー確定→成約→報酬・支払集計が通常紹介と同額（同一メニュー比較）。
3. 非相談案件の全回帰（coop-freeze §4 含む）green・money 4 ハッシュ規律・残置ゼロ。

---
*承認後、単独バッチ（tag: deploy-consult-freeze）で発注。REF-1（①複数選択＋②a相談UI）とは独立・REF-1 は本設計に依存しない（②a は報酬意味に非接触）。*
