# Block 3 — デザイン・モーション 突合表

**突合方法**: 実装後にプロトHTMLを参照して差分確認。実装時はチェックリストから新規作り起こし（コーディング中はプロト参照なし）。
**正本**: `MB_Partners_プロトタイプ_v12_final.html` (v12) / `MB_Partners_管理コンソール_v9_final.html` (v9)

---

## ページ遷移 / ビュー切替

| # | 正本 keyframe / transition名 | 実装側 keyframe / CSS名 | 一致 / 差分 |
|---|---|---|---|
| 1 | v12 `.view.active { animation: viewIn .3s cubic-bezier(.2,.8,.3,1) }` / v12最終 `.34s cubic-bezier(.22,1,.36,1)` | `globals.css` `@keyframes viewIn` 定義あり(未使用)。`.page-anim { animation: pageIn .28s var(--ease-out) }` を使用 | **差分**: `viewIn`定義済みだが未使用。`pageIn`を採用。easing`cubic-bezier(.22,1,.36,1)`→`var(--ease-out)` |
| 2 | v9 `@keyframes vi { from{opacity:0;transform:translateY(6px)} }` `.view.active { animation: vi .25s → .3s }` | `globals.css` `@keyframes pageIn { from{opacity:0;transform:translateY(6px)} }` `.page-anim` | **差分小**: keyframe名 `vi`→`pageIn`。easing `.3s cubic-bezier(.22,1,.36,1)`→`.28s var(--ease-out)` |

---

## スタガー (stagger) アニメ

| # | 正本 keyframe / transition名 | 実装側 keyframe / CSS名 | 一致 / 差分 |
|---|---|---|---|
| 3 | v12 `@keyframes up{from{opacity:0;transform:translateY(12px)}to{opacity:1}}` `.stagger>*{animation:up .42s}` delays `.03/.09/.15/.21/.27s` | `globals.css` `@keyframes up` 定義あり。`.stagger>*{animation:pageIn .32s}` delays `0/50/95/135/170/200/226/248ms` (8段) | **差分小**: stagger実装に `pageIn` 使用(upではなく)。delay値微調整、8段階拡張 |
| 4 | v9 `.col .kcard:nth-child(3/4/5){ animation-delay:.04/.08/.12s }` boardカードstagger | 未実装 | **差分**: kanbanカード stagger なし |
| 5 | v9 `.drawer.open .dr-b>*:nth-child(-n+7){ animation:up8; delays .03→.18s }` | 未実装 | **差分**: ドロワー内 cascade stagger なし |

---

## ホバー・インタラクション

| # | 正本 keyframe / transition名 | 実装側 keyframe / CSS名 | 一致 / 差分 |
|---|---|---|---|
| 6 | v9 `.kcard:hover { border-color:var(--blue); box-shadow:0 6px 16px rgba(71,51,230,.1) }` | `globals.css` `.card-hover:hover { transform:translateY(-2px); box-shadow:0 6px 20px rgba(71,51,230,.1) }` | **差分小**: border-color変化なし。translateY追加 |
| 7 | v9 `.kcard:active { cursor:grabbing }` | `app/console/deals/page.tsx` `draggable` div に `cursor:'grab'` インライン。`:active`未指定 | **差分小**: grabbing cursor on :active 未設定 |
| 8 | v9 `.kpi { transition: border-color .2s, box-shadow .25s }` (kpi card hover) | `globals.css` `.card-hover { transition: box-shadow .2s, transform .2s }` + `console/page.tsx` KpiCard に `card-hover` class | **一致** (transition property差分あるが視覚同等) |
| 9 | v9 `aside button { transition: color .18s, background .18s }` | `ConsoleNav.tsx` inline `<style>` `.cnav-link { transition: background .15s, color .15s }` | **一致** |
| 10 | v9 `.row-hover` 相当 (v9はインライン) | `globals.css` `.row-hover { transition:background .15s } :hover { background:var(--bg2) }` | **一致** |
| 11 | `btn:active { transform: scale(.96) }` (v9/v12共通) | `globals.css` `.btn:active { transform: scale(.96) }` | **一致** |

---

## ドロワー / モーダル

| # | 正本 keyframe / transition名 | 実装側 keyframe / CSS名 | 一致 / 差分 |
|---|---|---|---|
| 12 | v9 `.drawer { right:-520px; transition:right .3s cubic-bezier(.2,.8,.2,1) }` `.drawer.open { right:0 }` | `globals.css` `@keyframes drawerIn { from{transform:translateX(100%)} to{transform:translateX(0)} }` + 各drawer inline `slideIn .22s` | **差分**: `right`プロパティ遷移→`translateX` keyframe方式。easing `.3s cubic-bezier(.2,.8,.2,1)`→`.22s/.24s ease` |
| 13 | v9 `.scrim { opacity:0; transition:opacity .25s } .scrim.show { opacity:1 }` | `globals.css` `.modal-fade { animation: modalBgIn .2s }` / `@keyframes modalBgIn {from{opacity:0}to{opacity:1}}` | **差分**: クラス名 `.scrim`→`.modal-fade`。toggle→animation方式 |

---

## トースト通知

| # | 正本 keyframe / transition名 | 実装側 keyframe / CSS名 | 一致 / 差分 |
|---|---|---|---|
| 14 | v9初期 `.toast { opacity:0; transform:translateY(16px); transition:all .28s }` `.toast.show { opacity:1; transform:translateY(0) }` | `globals.css` `@keyframes toastIn { from{opacity:0;transform:translateX(-50%) translateY(14px)} to{...translateY(0)} }` `.toast { animation: toastIn .22s var(--ease-spring) }` | **差分小**: transition→animation方式。easing `.28s`→`.22s spring` |
| 15 | v9最終 `.toast { transition: transform .38s cubic-bezier(.34,1.56,.64,1), opacity .22s }` (spring-like) | `globals.css` `var(--ease-spring): cubic-bezier(.34,1.56,.64,1)` を使用 | **一致** (同じcubic-bezier値) |

---

## ナビゲーション アニメ

| # | 正本 keyframe / transition名 | 実装側 keyframe / CSS名 | 一致 / 差分 |
|---|---|---|---|
| 16 | v12 `nav button .bdg.on { animation: pulseDot 2.6s ease-in-out infinite }` | `AppNav.tsx` inline `.nav-bdg { animation: pulseDot 2.8s ease-in-out infinite }` | **差分小**: 2.6s→2.8s |
| 17 | v12 `.msg.unread b::after { animation: pulseDot 2.6s }` | 未実装 (`inbox/page.tsx`に`b::after pulseDot`なし) | **差分**: 未実装 |
| 18 | (v12/v9共通) ナビ active インジケーター — v12では active class | `AppNav.tsx` `@keyframes navPop{...}` `.nav-item.is-active .nav-item-icon { animation: navPop .3s }` + `@keyframes navBarIn{...}` | **改善**: v12より洗練されたspring pop + top bar |

---

## スケルトン / ローディング

| # | 正本 keyframe / transition名 | 実装側 keyframe / CSS名 | 一致 / 差分 |
|---|---|---|---|
| 19 | v12 `@keyframes sheen{to{transform:translateX(130%)}}` | `globals.css` `@keyframes sheen { to{transform:translateX(130%)} }` | **一致** |
| 20 | スケルトンウェーブ (v12で `loading`状態に使用) | `globals.css` `@keyframes skeletonWave { 0%{background-position:200% 0} 100%{background-position:-200% 0} }` | **一致** |

---

## その他 CSS / UX

| # | 正本 keyframe / transition名 | 実装側 keyframe / CSS名 | 一致 / 差分 |
|---|---|---|---|
| 21 | v9 `.gauge i { transition: width .8s cubic-bezier(.22,1,.36,1) }` ゲージアニメ | 未実装 (gauge UI存在しない) | **該当なし** |
| 22 | カスタムスクロールバー (v12/v9 プロトはブラウザ標準) | `globals.css` `::-webkit-scrollbar{width:5px}` + `scrollbar-width:thin` | **改善**: 実装側がより洗練 |
| 23 | `@keyframes up8` v9 ログイン `.lcard { animation: up8 .5s }` | `globals.css` `@keyframes up { from{opacity:0;transform:translateY(12px)} }` (名称変更) | **一致** (内容同等、名称 `up8`→`up`) |
| 24 | v12 `@keyframes fill { from{transform:scaleX(0)} to{transform:scaleX(1)} }` | 未確認(fill keyframe未使用) | **差分**: `fill`定義なし |
| 25 | v12 `@keyframes stnPulse { 0%,100%{box-shadow:0 0 0 4px var(--blue-bg)} 50%{...7px} }` | `globals.css` `@keyframes pulseScale { 0%,100%{transform:scale(1)} 50%{transform:scale(1.08)} }` | **差分**: keyframe内容が異なる。stnPulseはbox-shadow pulsation、pulseScaleはscale |
| 26 | (追加) `@keyframes fadeUp` | `globals.css` `@keyframes fadeUp { from{opacity:0;transform:translateY(16px)} }` | **追加**: v12/v9にない新規keyframe |

---

**サマリー**:
- **完全一致**: 8/26
- **差分小(微調整)**: 7/26 (easing値, timing値, クラス名変更)
- **差分(同等機能・方式変更)**: 6/26 (viewIn→pageIn, drawer right→translateX, scrim→modal-fade, toast transition→animation, stagger up→pageIn, up8→up)
- **差分(未実装)**: 3/26 (inbox `b::after pulseDot`, kanbanカードstagger, ドロワーcascade)
- **該当なし/追加**: 2/26 (gauge未使用, fadeUp新規追加)

**未実装で影響度高**:
- ドロップターゲット `.col.over` アウトライン (block2重複)
- kanban カード stagger (`.col .kcard:nth-child(n)` delay)
- `inbox` 未読 `b::after pulseDot`
