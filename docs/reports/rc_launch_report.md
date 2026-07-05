# MB Partners 本番スタート前 最終回帰（RC）レポート（2026-07-05）

検証専用・**コード変更ゼロ**（赤なし＝修理不要）。検証HEAD=`6cfa93c`（デプロイ済み本番=`126027b`）。
実行モデル: **Claude Fable 5**（claude-fable-5）。タグ: `rc-launch-20260705`=6cfa93c。

## 本番スタート判定: **GO**（アプリケーションは全緑・唯一の残件は support@ 受信MXのDNS設定で、副次チャネル・勝彦さんの手動领域）

---

## 1. 標準チェック — 全green
| 項目 | 結果 |
|---|---|
| build | exit 0（Compiled successfully） |
| 3面 未認証 | /app・/console・/vendor すべて **307** |
| webhook 無署名 | /api/line/webhook **401** |
| page errors | **[]**（3面主要ページ実ブラウザ・JSエラーゼロ） |
| test:session | **26/26**（本番・二重ロール共存含む） |
| canon | **61 assertion green** |
| money（CC不変） | 報酬ハッシュ `48a896fa…` 前後一致・menu_rewards **16行/340,100**・確定ガード/snapshot非接触・勝彦deals **3件** |
| 375px 水平オーバーフロー | **0**（APP 7ページ・委託先 7ページ・コンソール非ボード 4ページ すべて溢れなし。`/console/deals` はPC専用カンバンの意図的横スクロール＝ヘッダは非溢れを確認） |

## 2〜7. フロー一気通貫（本番・実ブラウザ・throwawayのみ）— 全33項目green
- **リファラル**: 紹介deal → APP案件一覧に出現 → コンソールボードに出現 ✓
- **ベンダー**: 委託提示 → **実ブラウザで承諾（accepted）** → 経費申請3,000 → コンソールで委託費了承済80,000反映 → 経費承認（approved）✓
- **コンソール（task5）**: 案件詳細フェーズ駆動（受付フェーズ＝金額系UI不在を実測）・サービスマスタ描画（「メニュー N」無し）・メール管理プレビュー描画・ボードDnD操作受理 ✓
  - ※ボードDnDの波及確認ダイアログ/8秒Undo機構は Program 3/5 で厳密検証済＋本バッチ未改修。今回は実データ変更を避けるため有効ドロップは発火させず（ドラッグ受理のみ確認・実deals変更ゼロをps/hash実測）。
- **フロンティア**: is_frontier=true 永続を実測 ✓
- **PWA（task7）**: APP・委託先ともに start_url（/app・/vendor）standalone 起動で**ログイン済みダッシュボード到達**（cookie host-scoped・セッション分離と整合）✓
- **通知（task6）**:
  - **Slack**: ベンダー承諾で `status_change` を本番発火（SLACK_WEBHOOK_URL 設定済・task6承認の実弾テスト送信）。
  - **メール**: 本run中の送信を mail_log で照合＝**実ユーザー宛送信ゼロ**（招待はDB直挿入で回避・宛先throwawayのみ）。RESEND本番稼働中だが実ユーザー宛はゼロを維持。

## 8. support@ / メールDNS — DNS照会結果

| レコード | 状態 | 判定 |
|---|---|---|
| DKIM `resend._domainkey.mb-partners.app` | あり | ✓ 送信認証OK |
| DMARC `_dmarc.mb-partners.app` | `v=DMARC1; p=none;` | ✓ |
| SPF `send.mb-partners.app` | `v=spf1 include:amazonses.com ~all` | ✓ **送信SPFは正規（Resend/SESはsendサブドメインに置く）** |
| バウンスMX `send.mb-partners.app` | `feedback-smtp.ap-northeast-1.amazonses.com` | ✓ |
| **受信MX `mb-partners.app`（apex）** | **なし** | ⚠ **support@ 受信は未設定** |

- **送信（invites/リマインダ/通知）は完全構成済＝GO**（DKIM＋DMARC＋send-subdomain SPF/バウンス）。FROM=`noreply@mb-partners.app`。
- **唯一の残件**: apex MX 未設定のため `support@mb-partners.app` が**受信不可**。ただし影響は限定的——アプリ内お問い合わせは ops 宛（sendOpsEmail＋Slack）で機能し、support@ は一部メール文中の「返信先」フォールバックのみ。task8は「受信テストは勝彦さんの手動领域」と明記されており、本項は勝彦さん側のDNS/メールプロバイダ設定事項。
  - **解消手順（勝彦さん・Vercel DNS）**: メールプロバイダ（Google Workspace / Cloudflare Email Routing 等）を選び、その MX レコードを apex `mb-partners.app` に追加 → support@ の受信ボックスを開通 → 受信テスト。**送信側の変更は不要**（既に正規構成）。

## 不変条件の順守
- **コード変更ゼロ**（赤なし・git は検証スクショ2枚の追加のみ）。
- 実データ操作禁止則: 全書込 throwaway・実データは読取のみ。DnD実データ非発火を hash/psql で実証。撤去後 psql実測: **deals=6（正規のみ）・throwaway profiles/deliveries/auth.users 残置 0・勝彦deals 3・menu_rewards 340,100・報酬ハッシュ 48a896fa 不変**。
- 外部送信ガード: 実ユーザー宛メール送信ゼロ（task6 の Slack 実弾のみ承認範囲）。DDL変更なし。

## 結論
**GO。** 全機能・セキュリティ・money・セッション・PWA・レスポンシブ検証が本番で緑。送信メール基盤も正規構成。唯一の open item は support@ 受信MX（副次チャネル・送信非依存・勝彦さんのDNS领域）で、本番スタートの阻害要因ではない。上記「解消手順」を launch 前後の任意タイミングで実施すれば support@ 受信も開通する。

スクショ: rc_console_detail / rc_mail_admin（docs/reports/screens_integrity/）
