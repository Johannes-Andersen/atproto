export const tableName = 'list'

export interface List {
  uri: string
  cid: string
  creator: string
  name: string
  description: string | null
  avatarCid: string | null
  createdAt: string
  indexedAt: string
}

export type PartialDB = { [tableName]: List }
