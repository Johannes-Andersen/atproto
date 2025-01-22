import {
  BlockMap,
  CidSet,
  CommitData,
  WriteOpAction,
  cborToLexRecord,
  parseDataKey,
  readCar,
} from '@atproto/repo'
import { CommitEvt, SeqEvt, AccountEvt, Sequencer } from '../../sequencer'
import {
  PreparedWrite,
  prepareCreate,
  prepareDelete,
  prepareUpdate,
} from '../../repo'
import { Secp256k1Keypair } from '@atproto/crypto'
import { UserQueues } from './user-queues'
import { AccountManager, AccountStatus } from '../../account-manager'
import { ActorStore, ActorStoreTransactor } from '../../actor-store'
import { rmIfExists } from '@atproto/common'

export type RecovererContext = {
  sequencer: Sequencer
  accountManager: AccountManager
  actorStore: ActorStore
}

export class Recoverer {
  cursor: number
  queues: UserQueues

  constructor(
    public ctx: RecovererContext,
    opts: { cursor: number; concurrency: number },
  ) {
    this.cursor = opts.cursor
    this.queues = new UserQueues(opts.concurrency)
  }

  async run() {
    let done = false
    while (!done) {
      done = await this.loadNextPage()
      await this.queues.onEmpty()
    }
    await this.queues.processAll()
  }

  async processAll() {
    await this.queues.processAll()
  }

  async destroy() {
    await this.queues.destroy()
  }

  private async loadNextPage(): Promise<boolean> {
    const page = await this.ctx.sequencer.requestSeqRange({
      earliestSeq: this.cursor,
      limit: 5000,
    })
    console.log('PAGE: ', page.at(-1)?.seq)
    page.forEach((evt) => this.processEvent(evt))
    const lastEvt = page.at(-1)
    if (!lastEvt) {
      return true
    } else {
      this.cursor = lastEvt.seq
      return false
    }
  }

  processEvent(evt: SeqEvt) {
    // only need to process commits & tombstones
    if (evt.type === 'account') {
      this.processAccountEvt(evt.evt)
    }
    if (evt.type === 'commit') {
      this.processCommit(evt.evt)
    }
  }

  processCommit(evt: CommitEvt) {
    const did = evt.repo
    this.queues.addToUser(did, async () => {
      try {
        const { writes, blocks } = await parseCommitEvt(evt)
        if (evt.since === null) {
          const actorExists = await this.ctx.actorStore.exists(did)
          if (!actorExists) {
            await this.processRepoCreation(evt, writes, blocks)
            return
          }
        }
        await this.ctx.actorStore.transact(did, async (actorTxn) => {
          const root = await actorTxn.repo.storage.getRootDetailed()
          if (root.rev >= evt.rev) {
            return
          }
          const commit = await actorTxn.repo.formatCommit(writes)
          commit.newBlocks = blocks
          commit.cid = evt.commit
          commit.rev = evt.rev
          await Promise.all([
            actorTxn.repo.storage.applyCommit(commit),
            actorTxn.repo.indexWrites(writes, commit.rev),
            this.trackBlobs(actorTxn, writes),
          ])
        })
      } catch (err) {
        console.log('DID: ', did)
        throw err
      }
    })
  }

  async trackBlobs(store: ActorStoreTransactor, writes: PreparedWrite[]) {
    await store.repo.blob.deleteDereferencedBlobs(writes, true)

    for (const write of writes) {
      if (
        write.action === WriteOpAction.Create ||
        write.action === WriteOpAction.Update
      ) {
        for (const blob of write.blobs) {
          await store.db.db
            .insertInto('record_blob')
            .values({
              blobCid: blob.cid.toString(),
              recordUri: write.uri.toString(),
            })
            .onConflict((oc) => oc.doNothing())
            .execute()
          await store.db.db
            .insertInto('blob')
            .values({
              cid: blob.cid.toString(),
              mimeType: blob.mimeType,
              size: blob.size,
              createdAt: store.repo.now,
            })
            .onConflict((oc) => oc.doNothing())
            .execute()
        }
      }
    }
  }

  async processRepoCreation(
    evt: CommitEvt,
    writes: PreparedWrite[],
    blocks: BlockMap,
  ) {
    const did = evt.repo
    const keypair = await Secp256k1Keypair.create({ exportable: true })
    await this.ctx.actorStore.create(did, keypair)
    const commit: CommitData = {
      cid: evt.commit,
      rev: evt.rev,
      since: evt.since,
      prev: evt.prev,
      newBlocks: blocks,
      relevantBlocks: new BlockMap(),
      removedCids: new CidSet(),
    }
    await this.ctx.actorStore.transact(did, (actorTxn) =>
      Promise.all([
        actorTxn.repo.storage.applyCommit(commit, true),
        actorTxn.repo.indexWrites(writes, commit.rev),
        actorTxn.repo.blob.processWriteBlobs(commit.rev, writes),
      ]),
    )
    console.log(`created repo and keypair for ${did}`)
  }

  processAccountEvt(evt: AccountEvt) {
    // do not need to process deactivation/takedowns because we backup account DB as well
    if (evt.status !== AccountStatus.Deleted) {
      return
    }
    const did = evt.did
    this.queues.addToUser(did, async () => {
      try {
        const { directory } = await this.ctx.actorStore.getLocation(did)
        await rmIfExists(directory, true)
        await this.ctx.accountManager.deleteAccount(did)
      } catch (err) {
        console.log('DID:', did)
        throw err
      }
    })
  }
}

const parseCommitEvt = async (
  evt: CommitEvt,
): Promise<{
  writes: PreparedWrite[]
  blocks: BlockMap
}> => {
  const did = evt.repo
  const evtCar = await readCar(evt.blocks)
  const writesUnfiltered = await Promise.all(
    evt.ops.map(async (op) => {
      const { collection, rkey } = parseDataKey(op.path)
      if (op.action === 'delete') {
        return prepareDelete({ did, collection, rkey })
      }
      if (!op.cid) return undefined
      const recordBytes = evtCar.blocks.get(op.cid)
      if (!recordBytes) return undefined
      const record = cborToLexRecord(recordBytes)

      if (op.action === 'create') {
        return prepareCreate({
          did,
          collection,
          rkey,
          record,
          validate: false,
        })
      } else {
        return prepareUpdate({
          did,
          collection,
          rkey,
          record,
          validate: false,
        })
      }
    }),
  )
  const writes = writesUnfiltered.filter(
    (w) => w !== undefined,
  ) as PreparedWrite[]
  return {
    writes,
    blocks: evtCar.blocks,
  }
}
