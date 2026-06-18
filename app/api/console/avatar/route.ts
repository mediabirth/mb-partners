// F-4：プロフィール・アバター更新（本人のみ・お金系非接触）。共有ハンドラを surface 別パスで公開。
export { avatarPOST as POST, avatarDELETE as DELETE } from '@/lib/profile-avatar'
export const runtime = 'edge'
