# Block 2 — 管理コンソール 突合表

**突合方法**: 実装後にプロトHTMLを参照して差分確認。実装時はチェックリストから新規作り起こし（コーディング中はプロト参照なし）。
**正本**: `MB_Partners_管理コンソール_v9_final.html`

---

| # | 正本 v9 要素（ルート名・関数名・CSS名） | 実装側ファイル・要素 | 一致 / 差分 |
|---|---|---|---|
| 1 | `.gsw` / `#gS` input `oninput="gs()"` / `#gsD` dropdown — グローバル検索 | `app/console/GlobalSearchClient.tsx` debounced `280ms` fetch `/api/console/search?q=` → dropdown | **一致** |
| 2 | `renderDash()` meetings section — 商談スケジュールパネル | `app/console/page.tsx` `upcomingMeetings` (deals with future `meeting_at`) → 商談スケジュールパネル | **一致** |
| 3 | `renderDash()` channel bars (HTML static) — チャネルチャート | `app/console/ChannelChart.tsx` 6ヶ月スタックバー(blue=紹介/gray=直販) + 比率バー | **一致** |
| 4 | `dealFlt` service filter `<select>` `svcFltInit()` — サービスフィルター | `app/console/deals/page.tsx` `<select value={filterSvc}>` + `services` state | **一致** |
| 5 | `newDeal()` / `saveDeal()` — 手動案件登録 | `app/console/deals/page.tsx` `AddDealDrawer` form → POST `/api/console/deals` | **一致** |
| 6 | `dragD(e,id)` / `dragOver(e,el)` `el.classList.add('over')` / `dropD(e,col,el)` — カンバンD&D | `app/console/deals/page.tsx` `draggable` + `onDragStart` / `onDragOver` / `onDrop` | **差分**: ドロップターゲットカラムの `outline: 2px dashed var(--blue)` ハイライト未実装 |
| 7 | `.col.over { outline:2px dashed var(--blue); outline-offset:-2px; background:var(--blue-bg2) }` | `app/console/deals/page.tsx` カラム div → `onDragOver`/`onDrop` あるが `.col.over` スタイル切り替えなし | **差分**: ドロップ中のカラムハイライトなし |
| 8 | `editSvc(i)` / `saveSvc(i)` / `.drawer.open` — サービス追加・編集ドロワー | `app/console/services/ServicesClient.tsx` edit/add drawer with `slideIn .22s` animation | **一致** |
| 9 | `renderAppr()` / `doApprove()` / `doReject()` — 承認待ちパネル | `app/console/partners/ApprovalPanel.tsx` approve/reject → PATCH `/api/console/partners/[id]` | **一致** |
| 10 | `設定` 支払サイクル section `.kv` 締め日/支払日 | `app/console/settings/page.tsx` 支払サイクル セクション(radio/input) | **一致** |
| 11 | `設定` 管理者管理 / `openInvite()` / `cpInvite()` | `app/console/settings/page.tsx` 管理者管理 セクション(invite form + copy link) | **一致** |
| 12 | `設定` カレンダー連携 (Google Calendar) | `app/console/settings/page.tsx` カレンダー連携 セクション(toggle + URL input) | **一致** |
| 13 | `設定` 通知設定 (email/Slack) | `app/console/settings/page.tsx` 通知設定 セクション(toggle switches) | **一致** |
| 14 | `設定` 監査ログ (audit log table) | `app/console/settings/page.tsx` 監査ログ セクション(mock data table) | **一致** |
| 15 | ConsoleNav aside links — 設定リンク | `ConsoleNav.tsx` ITEMS配列 `{ href: '/console/settings', label: '設定', icon: 'settings' }` | **一致** |
| 16 | `.view.active { animation: vi .25s/.3s cubic-bezier(.22,1,.36,1) }` `@keyframes vi{from{opacity:0;transform:translateY(6px)}}` — ビュー遷移 | `components/ConsolePageTransition.tsx` `key={pathname}` → `.page-anim { animation: pageIn .28s }` (dashboardのみ適用) | **差分**: vi→pageIn 名称変更。非dashboard consoleページ(partners/services等)は`ConsoleMain`未使用 |
| 17 | `.toast.show { opacity:1; transform:translateX(-50%) translateY(0) }` / `toast(msg)` 関数 | `components/Toast.tsx` `useToast()` hook + `globals.css` `.toast { animation: toastIn .22s }` | **差分小**: クラストグル方式→アニメーション方式。機能同等 |
| 18 | `.col .kcard:nth-child(n) { animation-delay: .04/.08/.12s }` board card stagger | `app/console/deals/page.tsx` カードに `stagger` class 未適用 | **差分**: kanbanカード stagger アニメなし |
| 19 | `.drawer.open .dr-b>*:nth-child(n) { animation-delay: .03/.06/.09... }` ドロワー内容 cascade | `ServicesClient.tsx` / `deals/page.tsx` ドロワー内容 → 単純 `slideIn` のみ | **差分**: ドロワー内 stagger cascade なし |
| 20 | `aside .bdg { animation: pulseDot }` — ConsoleNav バッジ(v9 proto未実装だが pulseDot定義あり) | `ConsoleNav.tsx` バッジ未実装 | **差分**: コンソール側navバッジ未実装 |

---

**サマリー**:
- **完全一致**: 12/20 (GlobalSearch, meetingsパネル, チャネルチャート, service filter, 手動登録, service drawer, 承認パネル, 設定5タブ全, NavSettings link)
- **差分小**: 2/20 (toast方式, pulseDot timing)
- **差分(機能一部欠損)**: 4/20 (col.over highlight, page-anim非dashboard未適用, kanbanカードstagger, ドロワー内cascade)
- **差分(未実装)**: 2/20 (D&D col.over visual, ConsoleNav badge)

**未実装で影響度高**:
- D&D時のドロップターゲットカラムハイライト (`.col.over { outline: 2px dashed var(--blue) }`) → 使用感に影響
- ConsoleNav navバッジ → 未読通知表示なし
