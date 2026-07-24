# 完全撤去 台帳（2026-07-24・リード作成・read-only抽出）

> 目的: デモ/テストデータの完全撤去→「デモ投入前ハッシュ」への復帰→高さん実招待。
> 規律: deals-cleanup-rule＝CC/デモ起源のみ撤去・勝彦(bfb3c027)/実パートナー作成分は残置。
> 実行: 勝彦GO後に Codex（撤去は完全自走の例外＝GO必須）。撤去順はマニフェスト記載の逆順が正典。

## 1. 撤去確定セット

### 1a. マニフェスト92（機械可読・全数生存確認済 2026-07-24）
- `docs/reports/demo_seed_manifest_20260712.json`（40）＋ `_v2`（52）。
- 内訳: deals13・deal_items10・funnel_events26・payout_items6・mail_log4・invites3・partners3（ZZ3169/ZZ4292/ZZ5926＝demo.*@mb-system.internal）・profiles/auth3・expense_claims3・supplier_charges3・menu_rewards2・reward_overrides2・continuous_payouts2・assignments2・payout_batches2・applications2・inquiries2・broadcasts2（【デモ】夏季draft/【デモ】新ブランドsent）・delivery1・omnis月額行含む。
- 撤去順: v2記載 funnel_events→expense_claims→payout_items→payout_batches→mail_log→broadcasts→…→v1逆順（マニフェストが正典）。

### 1b. マニフェスト外の確定撤去
| 対象 | ID/コード | 根拠 |
|---|---|---|
| 「あきら」deal 一式（items/events含む） | deals ca14416d… | 勝彦裁定済（2026-07-14「あきらはテスト」） |
| 計測用配信（throwaway）下書き | broadcasts 83f5a82d… | CC検証残骸（第3巡発見） |
| ZZ3782 神原勝彦（is_frontier・mediabirth.project@gmail.com） | partners/profiles/auth | RESUME撤去台帳に明記済のテスト |
| ZZ6153 デモsupplier本体「株式会社オムニス」（test.kambara@gmail.com・7751b302） | partners/profiles/auth＋services「オムニス」(omnis・active=false)＋招待リンク等の付随 | デモsupplier機構の土台（manifest の company_name 変異対象・配下=デモpartners3） |

## 2. 残置確定（削除禁止）
- **勝彦deals 3件**（田中太郎/神原勝彦×2・created_by=bfb3c027）＝money正典の錨。
- **ZZ6347（kthk.kmbr@gmail.com・勝彦本人のパートナー行）**＝上記3件の親。撤去不可。
- **MBHOUSE パートナー＋mb-house@mb-system.internal**＝直営業の恒久構造。
- **cc-monitor / cc-monitor-ops**＝監視インフラ（非接触規律）。
- MB6サービス（MOOM/MatchHub/RESONATION/PRAGMATION/EMANATION/ENTERSOLOGY LIVE）とMB seed報酬16行/¥340,100。

## 3. 勝彦裁定（2026-07-24 確定＝全て撤去・案B採用）
| # | 対象 | 内容 | 裁定 |
|---|---|---|---|
| R1 | 米井2口: ZZ3493・ZZ8882＋飯田deals2件 | 実スタッフのテストパートナー | **撤去（勝彦裁定）** |
| R2 | 日本ハウジング deal（MBHOUSE・paid） | 直営テスト起票 | **撤去（勝彦裁定・MBHOUSE構造は残置） |
| R3 | ZZ6392 高 明 | 高さんの試用アカウント | **撤去（勝彦裁定・実招待はクリーンに） |

## 4. 期待ハッシュ（事前計算済・除外SELECTで検証済 2026-07-24）
| シナリオ | deals | menu_rewards | fee | override |
|---|---|---|---|---|
| 案A=1a+1b のみ（R1-R3残置） | `c75ac4dfc6e5f693240e7b24ca8e256e` **＝v1マニフェスト「デモ投入前」と全桁一致** | `c5317c594d08ee0afea4a4764082876c` **＝同・投入前一致** | `(empty)` | `(empty)` |
| **案B=採用（R1-R3全撤去）** | `f0cda850919327978126ece73d303434`（残=勝彦3件のみ） | 同上 | 同上 | 同上 |
- MB seed補助: どちらでも 16行/¥340,100 不変（検証済）。
- R3はdealsハッシュ非影響（あきらdeal撤去は両案共通）。

## 5. 実行バッチへの要求
- tag: deploy-demo-teardown-20260724 ／ rollback: 事前に **pg_dump 対象テーブルのバックアップ**（撤去は不可逆のため、コードrollbackタグに加えデータ側の復元手段を必ず確保）。
- 撤去SQL全文を統合レポートに記載（deploy-footer-protocol）。
- 終了時: 上表の期待ハッシュと**全桁一致**を証明＋通知フィード/配信/ダッシュボードから【デモ】表示が消えたことを実ブラウザ実測＋残置確定リスト（§2）の生存確認。
- 撤去後の紹介ファネル・分析はゼロ近傍に戻る（funnel_events26撤去）＝勝彦へ事前周知。
