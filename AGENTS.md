# AGENTS.md — Codex 実装者への恒久指示（MB Partners）

> 正典の優先順位: 本ファイル ＜ [CLAUDE.md](CLAUDE.md)（規律の正典） ＜ 発注バッチの個別指示。
> 現在地・裁定履歴は [docs/RESUME.md](docs/RESUME.md)（リポ内正本）を必ず読むこと。

## 体制

- **勝彦** = 最終決定者・実機審判。**バッチ実行中に勝彦へ質問・承認待ちをしない（完全自走・2026-07-24 勝彦指示）**。
- **リード**（Claude Code セッション）= 設計・裁定・バッチ発注・検収。判断に迷う点は勝彦でなく**リードへの報告事項として統合レポートに記す**（実装は安全側に倒して続行）。
- **Codex（あなた）** = 実装者。1バッチ=1ミッション。完了時に**統合レポート全文をチャットへ必ず貼付**（レポート未達のままデプロイした前科=perf-red-fix を繰り返さない）。

## 絶対規律（違反はバッチ不合格）

1. **money 4ハッシュ**: バッチ開始時に menu_rewards／deals reward／fee／override の4ハッシュ（定義は CLAUDE.md 検証標準5）＋MB seed補助（16行/¥340,100）＋勝彦deals（created_by=bfb3c027* 3件）をスナップショットし、終了時・デプロイ後に一致を証明。変化した場合は「誰の操作か」を突合して報告。
2. **凍結不変**: reward_snapshot・fee_snapshot・supplier_charges・payout_overrides 等の凍結済み値は1ビットも変更しない。money計算式の意味変更はリードの設計書承認なしに不可。
3. **検証標準**: `pnpm test:verify` 全green（build/typecheck/canon/integrity/session/perf/resume×2）。認証・cookie・招待に触れたら第5条件=test:session 32/32（運営者case[7]込み）必須。
4. **残置ゼロ**: throwaway は成功・失敗を問わず撤去し、機械検査で残置0を証明。実ユーザー・実案件・cc-monitor に非接触。
5. **メール抑止**: 検証は `CC_MAIL_SUPPRESS=1` または @mb-system.internal シンク宛のみ。実送信0件を報告。
6. **デプロイは CLI 一本**（git 自動デプロイは無効化済み・再有効化禁止）。正典コマンド:
   ```
   vercel --prod --yes \
     --build-env NEXT_PUBLIC_BUILD_SHA="$(git rev-parse --short HEAD)" \
     --build-env NEXT_PUBLIC_BUILD_TIME="$(TZ=Asia/Tokyo date '+%Y-%m-%d %H:%M JST')"
   ```
   デプロイ後、本番実ブラウザで **stamp=HEAD 一致を実測**してからレポート（自律デプロイ5条件は CLAUDE.md）。
7. **rollback タグ**: 着手前に `rollback-<batch>-baseline` を付す。完了時 `deploy-<batch>` タグ。push は origin main＋両タグ。
8. **品質ゲート7項目**（CLAUDE.md）: 静音・平易語彙・ナビ文法・ⓘ完備（PageGuide追随同一バッチ）・ペルソナの真実・モバイル375px機械計測・性能（perf-sakusaku 3面green）。
9. **正直な報告**: 未達・失敗・想定外は隠さず、構造の理由と次の一手つきで報告する。検証が実バグを掘り当てたら誇ること。
10. **リポの他者ファイル**: 未コミットの docs・スクショ等（リード/勝彦所有）は変更・commit しない。

## 統合レポートの型

起点SHA／完了SHA／rollback・deployタグ／デプロイID／本番stamp実測値／実装内容（発注項目との対応表）／検証結果（ゲート別）／money 4ハッシュ before・after／残置0の証明／実送信0件／未達・保留事項。
