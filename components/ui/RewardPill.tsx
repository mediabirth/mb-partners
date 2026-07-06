// v3で廃止: 旧「報酬ピル（薄紫地＋999px）」は RewardFigure（インディゴ下線付き等幅数字）へ統合。
// 後方互換のため名称のみ残置し、実体は RewardFigure を再エクスポート（全呼び出し元が自動で新署名へ）。
export { default } from './RewardFigure'
