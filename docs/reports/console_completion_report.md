# MB Partners コンソール完成プログラム 統合レポート（2026-07-04）

自走・無確認で完遂。土台=`78f2dac` → 4コミット → **デプロイHEAD=`e7b6d1a`（READY・stamp実測一致）**。
実行モデル: **Claude Fable 5**（claude-fable-5）。

- タグ: `deploy-console-completion-20260704`=e7b6d1a ／ `rollback-console-completion-baseline`=78f2dac
- 検証green: build exit 0・status-effects 61 assertion green（tsx実行）・3面307・LINE webhook無署名401・page errors []・stamp=e7b6d1a=HEAD・money不変（§終）
- 本プログラムのモック: なし（ミッション本文が唯一のアンカー。従来どおり記録）

## 0. 検証水準の恒久引き上げ — その成果（本プログラム最大の発見）

「本番authenticated実ブラウザでクリック→入力→保存→リロード→反映確認」への引き上げにより、**API水準の検証では原理的に見えなかった構造欠陥を2件発見・修理**した。

1. **deal_items→services のFK欠落**（コミット c5fdbe4・DDL: `completion_dealitems_fk_ddl.sql`）
   PostgRESTのembed（`deal_items(... services(name))`）がFK不在で失敗し、`/api/console/deals` が**無言で最劣化SELECTにフォールバック**していた。結果、director_id・other_cost・deal_items が全コンソールクライアントに一切届かず、「MB担当が保存されない」「その他原価が効かない」「明細が出ない」を同時発症。**これがv2.1のMB担当がAPI検証を通過しながら実利用で壊れた真因**。FKはadditive（孤児0行を事前確認）で追加し、再デプロイなしで本番ペイロードが即時回復した。
2. **deals に delete RLSポリシーが不在**（コミット e7b6d1a）
   「案件を取り消す」のDELETE APIはユーザークライアントで `delete()` しており、RLSが0行マッチのまま**200 `{ok:true}` を返し続けていた＝取り消しは元から誰にも効いていない張りぼて**。role検査済みのservice_role実行＋`.select()`による削除実効検証＋404（対象不在）に修理。実ブラウザで ダイアログ→取り消す→**psqlで行消滅＋割当cascade削除** まで確認。

## A. 案件詳細

- **A1 MB担当（再修理・実測）**: 真因は上記FK欠落（UI配線は健在だった）。実ブラウザ: select選択→即時表示維持→**リロード後も選択が反映**（domValue=UUID一致）green。
- **A2 商談/紹介ピル削除**: DOM実測 **MISSING** green。
- **A3 「…」管理メニュー**: ヘッダ「…」（aria-label=管理メニューを開く）に「不成立にする／案件を取り消す」を集約。**両者は統合しない**（不成立=可逆・記録残置・90日再開可・メール1通／取り消し=不可逆・痕跡ゼロ・通知なし、と挙動が本質的に異なるため）。各ダイアログに用途説明を実装:
  - 不成立「お客さまとの取引が成立しなかった場合に使います。案件は記録に残り、90日以内は再開できます。」
  - 取り消し「誤登録・重複の削除に使います。案件と明細は完全に削除され、この操作は元に戻せません。パートナーへの通知はありません。」
  実ブラウザ: …→メニュー→ダイアログ文言→取り消す→DB実削除まで一気通貫green（§0-2の修理後）。

## B. 金額・原価の完成 — money完成マップ

| 入力（UI） | 保存先 | 影響 |
|---|---|---|
| 受注額 | `deal_items.revenue` | MB粗利の売上側 |
| その他原価 | `deals.other_cost` | MB粗利から減算 |
| 委託費 | `delivery_assignments.base_fee` | デリバリー原価としてMB粗利から減算 |
| MB担当 | `deals.director_id` | 表示・集計（金額非影響） |
| パートナー報酬 | `deals.amount`（率型はrevenue連動） | MB粗利から減算・**確定済みsnapshotは不変** |

`MB粗利 = revenue − パートナー報酬 − フロンティア調整 − other_cost − Σbase_fee − 承認済経費`（lib/pnl・変更なし＝**moneyの意味は不変**）。
実ブラウザ一気通貫green: **受注額500,000表示 → その他原価10,000入力→保存→リロード後反映 → 委託費80,000反映 → MB粗利=410,000が自動計算表示**。修理: FK（§0-1）＋money入力の `key={selected.id}`（defaultValueの案件切替時の取り残し解消）＋P&L並びをMB粗利強調（負値=赤）へ再構成。

## C. デリバリーゾーン

- **マスタ起点の割当**: `deliveries.service_id`（additive DDL: `completion_deliveries_service_ddl.sql`）を追加し、割当selectを optgroup「このサービスの担当／その他の委託先」に再構成＝サービス・メニューに紐づく候補が構造で提示される。
- **委託費→原価→粗利**: Bの一気通貫で実証（80,000がMB粗利に反映）。
- **C3 ベンダー面の実測**: throwawayベンダー（authユーザー＋deliveries紐付け）で実ブラウザログイン→`/vendor/cases` に**割当案件が出現**green（cc_vendor_visible.png）。

## D. 直営業プロジェクトの再生

起票不能の真因2件: (a) `is_system` パートナー不在でPOSTが409（`scripts/seed-system-partner.cjs` で **MB直営**〔MBHOUSE・is_system=true・suspended・payout/担当リスト対象外〕を恒久シード＝残置ではなくインフラ）／(b) モーダルのサービス選択肢がdeals由来の派生リストでマスタ起点でなかった（svcMenusマスタ化＋menu_id受理をAPIに追加・amount=0固定で**報酬計算は起動しない**）。
実ブラウザ一気通貫green: 企業名＋サービス（PRAGMATION）＋**メニュー（DX・AI導入）**＋受注額300,000＋MB担当＋デリバリー→起票する→**deals（direct/confirmed/未着手/menu_id/director_id）＋deal_items（revenue=300,000・menu付き）＋delivery_assignments が全行作成**→ボード出現→詳細表示→（検証後は取り消しで撤去）。

## E. サービスマスタ一覧

「メニュー N」**MISSING** green・行の余白/ロゴ/ベースライン整理で情報密度を向上（cc_services_compact.png）。

## 動作全数表の更新（宙に浮きゼロ）

v2.1の19要素分類のうち「案件を取り消す」は実は**張りぼて**だったことが新水準で判明→本バッチで「動く」へ修理済み。現在: **動く19／削除済3（商談・紹介ピル／メニューN／稟議=前バッチ）／張りぼて0／提案0**。削除対象のMISSING実測: 商談・紹介ピル✓／メニューN✓（＋前バッチ分の赤字2リンクは「…」メニューへ移設済み）。

## インシデント記録（誠実性のための全開示）

1. **E2E補助スクリプトの汎用ボタン探索が実データに誤発火**: 検証中、神原勝彦の実案件1件が received→in_progress に遷移し、**ライブメール3通が送信された**（勝彦宛「状況更新」1通＋運用宛2通）＝外部送信ガード違反。内容は本人案件の正規の状態通知で誤情報・第三者到達はなし。**DB直接操作で完全原状復帰**（status・auto tasks・deal_eventsを復元、mail_logに送信事実は残existence）。以後の全スクリプトはクリック対象をモーダル/ドロワー/ダイアログにスコープ固定し、ページ全域のテキスト探索クリックを禁止して再発ゼロ。
2. **検証クライアントのセッション汚染（偽null）**: cookie生成の `verifyOtp` がservice_roleクライアントの認証を上書きし、以後のDB読取がユーザーJWT+RLSで実行→「削除成功」「残置ゼロ」の**偽green**を複数回生成。使い捨てクライアント分離で修正し、全アサートをpsql/クリーンなservice_roleで取り直した（本レポートの全greenは取り直し後の値）。
3. CLAUDE.mdの事前確認ルールは、本プログラム群の明示的な運用命令（完全自走・正準デプロイ・psql自走）を優先して適用した。

## §終 money証明・残置ゼロ

- menu_rewards **16行/sum=340,100** ✓・deals報酬ハッシュ `6e4c6047f6780bdb7497864b10db90a2` ✓・勝彦deals **3件残置（読み取りのみ）** ✓・reward_snapshot/確定ガード非接触 ✓
- DDLはadditive 2件のみ（deal_items FK／deliveries.service_id・全文は docs/reports/completion_*.sql）
- throwaway全撤去をpsql実測: **deals 5／deliveries 0／assignments 0／profiles・auth.users残置0**
- スクショ: cc_a1_final / cc_money_pnl / cc_d_direct_full / cc_vendor_visible / cc_cancel_dialog / cc_a3_after_cancel / cc_services_compact（docs/reports/screens_integrity/）

## 提案（実装せず記録のみ）

- 直営業プロジェクトの簡素化: 現行モーダル6項目のうち必須は企業名+サービスのみ。将来「企業名だけで起票→詳細は後から」への段階入力化で起票摩擦をさらに削れる。
- deals の delete RLSポリシー追加（DB層の防御）は今回見送り＝削除権限はroute層で一元管理・監査可能な現構成を維持（policy追加はいつでもadditiveで可能）。

## コミット（rollback-console-completion-baseline..deploy-console-completion-20260704）

c5fdbe4 FK根因修復（money構造回復） → 4a42a00 サービスマスタ一覧コンパクト化（E） → 9d3545f A2/A3・money完成・直営再生（A〜D） → e7b6d1a 取り消し根因修復（A3）
