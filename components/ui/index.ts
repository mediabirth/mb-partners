/**
 * F-2 デザインシステム：components/ui バレル。3サーフェス共通の共有プリミティブ。
 * すべて BR-0 トークン由来。純プレゼンテーション層（ロジック/データ/お金/RLS/認証は不関与）。
 * 既存の ServiceAvatar / Toast / ChannelMark は実績があるためここから再エクスポートして集約する。
 */
export { default as Button } from './Button'
export type { ButtonProps } from './Button'
export { default as Card } from './Card'
export type { CardProps } from './Card'
export { default as StatusPill } from './StatusPill'
export type { StatusPillProps, Tone } from './StatusPill'
export { default as Avatar } from './Avatar'
export type { AvatarProps } from './Avatar'
export { default as AvatarEditor } from './AvatarEditor'
export { default as ProfileHeader } from './ProfileHeader'
export { default as RewardHero } from './RewardHero'
export type { RewardHeroItem } from './RewardHero'
export { default as StatCard } from './StatCard'
export { default as EmptyState } from './EmptyState'
export { default as Skeleton } from './Skeleton'
export { default as SegmentedControl } from './SegmentedControl'
export type { Segment } from './SegmentedControl'
export { default as ListRow } from './ListRow'
export { PageHeader, SectionHeader } from './Header'
export { Modal, Sheet } from './Modal'
export { Field, Input, Textarea, Select, FileField } from './Field'

// 既存の実績コンポーネントを集約（重複生成しない）
export { default as ServiceAvatar } from '../ServiceAvatar'
export { default as ChannelMark } from '../ChannelMark'
