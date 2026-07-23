# 検証資産の分類

## permanent

`permanent/` は全バッチで維持する恒久ゲートである。実ユーザー・実案件・`cc-monitor`・既存デモへ触れず、書込が必要な場合は `cc-*-throwaway@mb-system.internal` 相当の専用fixtureだけを作成して必ず撤去する。`pnpm test:verify` が唯一の標準入口で、ここに登録された全スイートを直列実行する。

## batch-specific

`scripts/` 直下に残る `*.e2e.*`、`verify-*`、`repro-*`、描画・計測スクリプトは、作成バッチの証跡または診断用であり恒久ゲートではない。固定ID・固定日付・実アカウント・旧UI文言を含み得るため、再利用前に現在の規律へ適合させる。恒久化する場合は実データ依存を除去し、残置ゼロを機械確認した上で `permanent/` と `test:verify` に同時登録する。

## operational

移行、seed、cleanup、画像生成、メールpreview等は検証資産ではない。特にSQL・migration・seed・cleanupは `test:verify` から呼ばず、正典の承認規律に従う。
