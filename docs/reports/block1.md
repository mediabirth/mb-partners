# Block 1 — パートナーアプリ 突合表

**突合方法**: 実装後にプロトHTMLを参照して差分確認。実装時はチェックリストから新規作り起こし（コーディング中はプロト参照なし）。
**正本**: `MB_Partners_プロトタイプ_v12_final.html`

---

| # | 正本 v12 要素（ルート名・関数名・CSS名） | 実装側ファイル・要素 | 一致 / 差分 |
|---|---|---|---|
| 1 | `nav button#n-inbox .bdg.on` + `@keyframes pulseDot{0%,100%{opacity:1}50%{opacity:.45}}` 2.6s — ナビバッジ点滅 | `AppNav.tsx` `hasUnread` state → `<span className="nav-bdg"/>` + inline CSS `pulseDot 2.8s` | **差分小**: タイミング 2.6s→2.8s |
| 2 | `#v-msg` section / `openMsg(id)` / `.a-hero.g1/g2/g3` バナー (`g1=blue gradient, g2=amber, g3=dark`) | `app/app/inbox/page.tsx` `detail` state toggle + `HERO_COLORS: {news: blue-gradient, tips: amber}` | **差分小**: クラス名 `.g1/.g2/.g3` → `kind: 'news'/'tips'`。g3(dark)なし |
| 3 | `.bal-row > .bal-item` 「次回振込`<b>6/30 — ¥71,832</b>`」`今月の確定` `累計` 3列 | `app/app/page.tsx` `nextPayLabel` + balance row 3列(`次回振込` / `今月の確定` / `累計`) | **一致** |
| 4 | `saveQR()` → `canvas.toDataURL('image/png')` → `<a download>` クリック | `app/app/refer/page.tsx` `QRModal.saveQR()` → `canvas.toDataURL('image/png')` → `a.download = 'MB_Partners_QR.png'` | **一致** |
| 5 | `.view.active { animation: viewIn .34s cubic-bezier(.22,1,.36,1) }` — ビュー切り替えアニメ | `ConsolePageTransition.tsx` + `PageTransition.tsx` `key={pathname}` → class `.page-anim { animation: pageIn .28s }` | **差分**: v12はクラストグル方式、実装はReact route-keyed re-mount方式。エフェクト同等 |
| 6 | `.stagger > *:nth-child(n) { animation-delay: .03/.09/.15/.21/.27s }` `up .42s` | `globals.css` `.stagger > *:nth-child(n)` delays `0/50/95/135/170/200/226/248ms` `pageIn .32s` | **差分小**: アニメ名`up`→`pageIn`、delay値微調整、8段階まで拡張 |
| 7 | `.svc-list.stagger` サービス一覧フェードイン | `app/app/refer/page.tsx` サービスリスト div に `.stagger` class | **一致** |
| 8 | `#v-cases` ケースリスト `.stagger` / `#caseList.stagger` | `app/app/cases/page.tsx` ケースリスト div に `.row-hover` | **差分**: staggerなし(rowのfade-inのみ) |
| 9 | `#v-rewards .bal-row` 報酬ページのバランス行(支払済/未払/成約数) | `app/app/page.tsx` (homeページに統合、ホームにのみbalance表示) | **差分**: 報酬ページ(`/app/rewards`)にbal-rowなし |
| 10 | `renderInbox()` → `.msg.unread b::after { animation: pulseDot }` — 未読メッセージ点滅 | `app/app/inbox/page.tsx` 未読 notif に `background: 'var(--blue-bg2)'` highlight | **差分**: `.msg.unread b::after` pulseDot afterなし。既読/未読の視覚差分は背景色で代替 |
| 11 | `go(v)` ルーター / `const map={home:'n-home',...}` でナビ active 連動 | `AppNav.tsx` `usePathname()` + `active(path)` 関数 | **一致** |
| 12 | `.card-hover` 相当 → v12ではインラインスタイルが主体 | `globals.css` `.card-hover { transition: box-shadow .2s, transform .2s } :hover { translateY(-2px) }` | **改善**: 実装側がより洗練 |
| 13 | `.row-hover` 相当 → v12ではインライン | `globals.css` `.row-hover { transition: background .15s } :hover { background: var(--bg2) }` | **改善**: 実装側がより洗練 |

---

**サマリー**:
- **完全一致**: 4/13 (saveQR, バランス行, ナビルーター, card/row-hover)
- **差分小(軽微)**: 3/13 (pulseDot timing, a-hero class名, stagger delay値)
- **差分(同等機能・実装方式異なる)**: 4/13 (viewIn方式, stagger名, caseList stagger不足, reportページbal-row)
- **差分(未実装)**: 2/13 (`.msg.unread b::after` pulseDot, 報酬ページbal-row)

**未実装で影響度高**:
- 報酬ページ(`/app/rewards`)に `bal-row`(支払済/未払/成約数)が存在しない → homeページに代替バランス表示あり
- `inbox` 未読メッセージの `b::after pulseDot` が存在しない → 背景色ハイライトで代替中
