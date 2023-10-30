import { Server } from '../../../../lexicon'
import AppContext from '../../../../context'
import { authPassthru } from './util'

export default function (server: Server, ctx: AppContext) {
  server.com.atproto.admin.reverseModerationAction({
    auth: ctx.authVerifier.role,
    handler: async ({ req, input }) => {
      const { data: result } =
        await ctx.appViewAgent.com.atproto.admin.reverseModerationAction(
          input.body,
          authPassthru(req, true),
        )

      return {
        encoding: 'application/json',
        body: result,
      }
    },
  })
}
