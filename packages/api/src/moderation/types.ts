import {
  AppBskyActorDefs,
  AppBskyFeedDefs,
  AppBskyNotificationListNotifications,
  AppBskyGraphDefs,
  ComAtprotoLabelDefs,
} from '../client/index'
import { LabelGroupId } from './const/label-groups'
import { KnownLabelValue } from './const/labels'

// behaviors
// =

export interface ModerationBehavior {
  profileList?: 'blur' | 'alert' | 'inform'
  profileView?: 'blur' | 'alert' | 'inform'
  avatar?: 'blur' | 'alert'
  banner?: 'blur'
  displayName?: 'blur'
  contentList?: 'blur' | 'alert' | 'inform'
  contentView?: 'blur' | 'alert' | 'inform'
  contentMedia?: 'blur'
}
export const BLOCK_BEHAVIOR: ModerationBehavior = {
  profileList: 'blur',
  profileView: 'alert',
  avatar: 'blur',
  banner: 'blur',
  contentList: 'blur',
  contentView: 'blur',
}
export const MUTE_BEHAVIOR: ModerationBehavior = {
  profileList: 'inform',
  profileView: 'alert',
  contentList: 'blur',
  contentView: 'inform',
}
export const HIDE_BEHAVIOR: ModerationBehavior = {
  contentList: 'blur',
  contentView: 'blur',
}
export const NOOP_BEHAVIOR: ModerationBehavior = {}

// labels
// =

export type Label = ComAtprotoLabelDefs.Label

export type LabelPreference = 'ignore' | 'warn' | 'hide'
export type LabelDefinitionFlag =
  | 'no-override'
  | 'adult'
  | 'unauthed'
  | 'no-self'
export type LabelTarget = 'account' | 'profile' | 'content'

export interface LabelDefinitionLocalizedStrings {
  name: string
  description: string
}

export type LabelDefinitionLocalizedStringsMap = Record<
  string,
  LabelDefinitionLocalizedStrings
>

export interface LabelDefinition {
  id: KnownLabelValue
  groupId: string
  configurable: boolean
  targets: LabelTarget[]
  fixedPreference?: LabelPreference
  flags: LabelDefinitionFlag[]
  behaviors: {
    account?: ModerationBehavior
    profile?: ModerationBehavior
    content?: ModerationBehavior
  }
}

export interface LabelGroupDefinition {
  id: LabelGroupId
  configurable: boolean
  labels: LabelDefinition[]
}

export type LabelDefinitionMap = Record<KnownLabelValue, LabelDefinition>
export type LabelGroupDefinitionMap = Record<LabelGroupId, LabelGroupDefinition>

// subjects
// =

export type ModerationSubjectProfile =
  | AppBskyActorDefs.ProfileViewBasic
  | AppBskyActorDefs.ProfileView
  | AppBskyActorDefs.ProfileViewDetailed

export type ModerationSubjectPost = AppBskyFeedDefs.PostView

export type ModerationSubjectNotification =
  AppBskyNotificationListNotifications.Notification

export type ModerationSubjectFeedGenerator = AppBskyFeedDefs.GeneratorView

export type ModerationSubjectUserList =
  | AppBskyGraphDefs.ListViewBasic
  | AppBskyGraphDefs.ListView

export type ModerationSubject =
  | ModerationSubjectProfile
  | ModerationSubjectPost
  | ModerationSubjectNotification
  | ModerationSubjectFeedGenerator
  | ModerationSubjectUserList

// behaviors
// =

export type ModerationCauseSource =
  | { type: 'user' }
  | { type: 'list'; list: AppBskyGraphDefs.ListViewBasic }
  | { type: 'labeler'; did: string }

export type ModerationCause =
  | { type: 'blocking'; source: ModerationCauseSource; priority: 3 }
  | { type: 'blocked-by'; source: ModerationCauseSource; priority: 4 }
  | { type: 'block-other'; source: ModerationCauseSource; priority: 4 }
  | {
      type: 'label'
      source: ModerationCauseSource
      label: Label
      labelDef: LabelDefinition
      setting: LabelPreference
      behavior: ModerationBehavior
      noOverride: boolean
      priority: 1 | 2 | 5 | 7 | 8
    }
  | { type: 'muted'; source: ModerationCauseSource; priority: 6 }
  | { type: 'hidden'; source: ModerationCauseSource; priority: 6 }

export interface ModerationOpts {
  userDid: string
  adultContentEnabled: boolean
  labelGroups: Record<string, LabelPreference>
  mods: AppBskyActorDefs.ModsPref['mods']
}
