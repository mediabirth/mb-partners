# MB Partners 案件ライフサイクル・プログラム 統合レポート（2026-07-05）

自走・無確認で完遂。土台=`e7b6d1a` → 2コミット → **デプロイHEAD=`bbe66a4`（READY・stamp実測一致）**。
実行モデル: **Claude Fable 5**（claude-fable-5）。

- タグ: `deploy-deal-lifecycle-20260705`=bbe66a4 ／ `rollback-deal-lifecycle-baseline`=e7b6d1a
- 検証green: build exit 0・status-effects 61 assertion green・3面307・LINE webhook無署名401・page errors []・stamp=bbe66a4=HEAD・money不変（§終）
- 一気通貫E2E（新水準・本番ビルドをローカルで認証実操作）: **43 passed / 0 failed**（RESEND/SLACK鍵不在＝ライブ送信ゼロを構造的に保証）
- モック（deal_detail_phase_driven_two_states）は環境内に実ファイル不在→ミッション本文を確定アンカーとして採用

## 中核の是正: 「粗利の実額を入力」の廃止

案件詳細は「全フェーズの全入力欄を並べた帳票」だった。最悪の症状＝**粗利を入力項目として持っていた**（`実績金額（利益）を入力`）を全廃。粗利は
**受注額 − 委託費(了承済) − 経費(承認済) − その他原価** の**計算結果**であり、画面には計算行としてのみ現れる。入力欄は売上・委託費・その他原価だけになった。

## フェーズ×表示マトリクス（実装原則＝画面のステートマシン）

| フェーズ | 金額ゾーン | 主CTA |
|---|---|---|
| nego（受付/商談） | **一切レンダリングしない**（金額・委託費・明細・P&LのDOM不在） | 受付→「連絡済みにして商談中へ」／商談→「成約にする」 |
| project（成約後） | ①デリバリー0〜N行（提示→了承）②計算式ブロック③明細 | 率×報酬未確定→「報酬を確定する」／成約→「支払済にする」 |
| settled（支払済） | 同構造の**読み取り専用** | なし（ステータス行が完了を語る） |
| lost（不成立） | 記録閲覧 | 90日内→「案件を再開する」 |

固定報酬×コスト無しは計算式ブロック自体を出さない（報酬はヘッダ素性行が語る）。全フェーズ×（固定/率/継続/直営）をE2Eで実測。

## 正典業務フローの画面化（勝彦定義どおり）

1. **ヘッダ素性行**: 「ブランド ─ メニュー・報酬条件・トリガー」を常時表示（例「PRAGMATION ─ DX・AI導入・粗利の10%・粗利確定時」「継続 粗利の10%/月・12ヶ月・月次確定」）。reward_snapshot／正典から導出。
2. **成約ダイアログ**: 率/継続/直営は受注額（売上）を入力して成約。明細0の相談案件はサービス/メニュー選択で明細作成も兼ねる（L3ガードを画面で満たす）。**固定・つなぐのみは金額入力なしで成約**（報酬は固定・成約で確定）。
3. **デリバリー提示→ベンダー了承**: 「＋ デリバリーを追加」→委託先（マスタ連携・前バッチoptgroup流用）＋委託費→**提示（status=proposed）**。ベンダーの `/vendor/cases/[id]` に提示カードが届き「受ける／辞退」。承諾で `accepted`。**委託費が原価に算入されるのは了承後のみ**（提示中は計算式に「（提示中・未確定）」として別行表示・粗利には含めない）。委託費変更は再提示（proposedへ戻る）。
4. **計算式ブロック**: 受注額 →−委託費（了承済N件）→−経費（未申請時「納品後に申請」）→−その他原価 →**MB粗利（税抜・見込み/確定）**→パートナー報酬（%）→手残り。
5. **経費フロー**: ベンダーが納品時に経費申請（既存 expense_claims 機構に接続）→console承認→承認済のみ粗利に算入し「見込み」が確定へ。
6. **報酬確定**: 粗利（計算値）×率＝報酬を確定ダイアログで提示して確定。既存API（base×率・snapshot追記）に計算値をbaseとして渡す＝**式の意味は不変**。率案件は**base未確定のまま成約可**（成約時は報酬条件のみ凍結・報酬額は後日確定）。

## moneyゾーン完成マップ（フェーズ×入力×計算×確定）

```
[nego]   入力なし（金額UIはDOM不在）
[project]
  入力: 受注額(売上)→deal_items.revenue   委託費→delivery_assignments.base_fee(status=proposed→accepted)
        その他原価→deals.other_cost         経費→expense_claims(vendor申請→approved)
  計算(表示専用): MB粗利 = Σrevenue − Σbase_fee(accepted) − Σexpense(approved) − other_cost − frontier_override
        パートナー報酬(見込み) = 粗利 × rate%
  確定: 「報酬を確定する」→ base_amount=粗利(計算値) / amount=round(base×rate) / reward_snapshot.computed
        （固定は成約時にamount確定・継続は月次 continuous_payouts）
  ガード: 率×報酬未確定のまま paid は 400 で拒否
[settled] 全て読み取り専用サマリ（確定値の凍結・確定ガード不変）
```

## ヒアリングの再修理（診断→是正）

- 真因: **サーバが超過を silent `slice(0,4000)` していた**（＝上限が「実効していない」ように見える）／保存後にフォームが再編集可能（追記でなく上書き・「何度も入力できた」の正体）。
- 是正: サーバで4000字超過を **400で拒否**（silent slice廃止・クライアント `maxLength=4000` と同値）／APPはサーバのエラー文言を表示。単一コンテンツ・編集制は既存どおり（追記型ではない＝上書き1件）。console表示は220字超で**折りたたみ＋「すべて表示」**。
- 実測: 4001字→400拒否・拒否時DB非保存・300字UI保存→note保存＋ヒヤリングタスク自動完了・console折りたたみ表示、すべてgreen。

## 削除・是正一覧（全MISSING実測）

- **粗利の入力欄**（実績金額（利益）を入力／baseModal／per-item実績入力）＝全廃・DOM MISSING
- **受付フェーズの金額系UI**（MB粗利・受注額・委託費・明細・P&L）＝nego で DOM不在
- **内部値の生露出**（source `partner_form` 等）＝「パートナーフォームから・M/D HH:MM」へ日本語化・生値 MISSING
- **ヒアリング多重入力の抜け穴**＝サーバ強制で是正
- 対応範囲（協力タスク）: 完了は打ち消し線→**チェック＋muted**、「必須」ピルは未達時のみ、「自動」ピルは廃止し title 属性へ（静音化原則）

## 不変条件・残置ゼロ（§終）

- money意味不変: 計算式の意味・reward_snapshot・確定ガード非接触・menu_rewards **16行/sum=340,100** ✓・deals報酬ハッシュ **`6e4c6047f6780bdb7497864b10db90a2`** ✓・勝彦deals **3件（読み取りのみ）** ✓
- DDL追加ゼロ（既存 `delivery_assignments.status` 列を提示ライフサイクルに活用＝proposed/accepted/declined。旧既定値 `assigned` は「了承済相当」として原価算入）
- **実データ操作禁止則の順守**: 全UI書込はCC自作throwaway（パートナー1・ベンダー2・deal2）で実施し撤去。実データ（田中/飯田/勝彦）は**読み取り表示確認のみ**。操作対象はダイアログ/ドロワー内の特定要素に固定（汎用セレクタ探索なし）。撤去後 psql実測: deals=5／deliveries=0／assignments=0／expense_claims=0／throwaway profiles・auth.users・partners 残置0
- ライブ送信ゼロ（mail_log の sent 0件・RESEND鍵不在）・実予約ゼロ・3面分離・v2.2＋静音化・copy-guideline順守

### インシデントと是正（誠実性のための開示）

検証期間中、実データ **飯田（f0616148・in_progress・率案件）の deals.amount が 50,000→0** に変化していた（更新時刻から本作業ウィンドウ内）。真因は**baselineに既存したドリフト**——deals.amount=50,000（legacy確定値）に対し deal_item.amount=0——で、`recomputeDealAmount`（deals.amount=Σitems）が走ると 0 へ「是正」される構造。money計算の意味としては in_progress×率で amount=0 はむしろ整合的だが、**定義済みinvariant（hash 6e4c6047）はamount=50,000を基準としている**ため、baselineへ復元（psqlで `amount=50000`・hash一致を実測）。本プログラムの新規コードはこのドリフトを**新たに生む経路を持たない**（成約時の単一明細同期は item←deal.amount 方向・confirmed中のrevenue修正はrecompute非実行）。

## 検証スクショ（docs/reports/screens_integrity/）

lc_nego / lc_hearing_app / lc_tasks_quiet / lc_confirm_dialog / lc_offers_proposed / lc_vendor_offer / lc_formula / lc_reward_dialog / lc_reward_settled / lc_continuous

## 提案（未実装・記録のみ）

- `delivery_assignments.status` の明示的CHECK制約（proposed/accepted/declined/assigned）はDDL additiveで将来追加可（現状はアプリ層で値域管理）。
- 率案件の「報酬を確定する」導線は、承諾待ちの委託提示が残る間はダイアログで警告表示済み。将来、全提示了承を成約→報酬確定の推奨ゲートにできる（強制はしない＝ゼロ委託の案件もあるため）。

## コミット（rollback-deal-lifecycle-baseline..deploy-deal-lifecycle-20260705）

7fbf909 委託提示ライフサイクル＋成約後アサイン＋率base無し成約＋支払済ガード＋ヒアリング上限サーバ強制 → bbe66a4 案件詳細フェーズ駆動再設計（素性行/計算式/デリバリー提示行/成約・報酬確定ダイアログ/紹介日本語化/対応範囲静音化）
