/**
 * GENERATED CODE - DO NOT MODIFY
 */
import { HeadersMap, XRPCError } from '@atproto/xrpc'
import { ValidationResult, BlobRef } from '@atproto/lexicon'
import { CID } from 'multiformats/cid'
import { validate as _validate } from '../../../../lexicons'
import { $Typed, is$typed as _is$typed, OmitKey } from '../../../../util'
import type * as ToolsOzoneCommunicationDefs from './defs.js'

const is$typed = _is$typed,
  validate = _validate
const id = 'tools.ozone.communication.createTemplate'

export interface QueryParams {}

export interface InputSchema {
  /** Name of the template. */
  name: string
  /** Content of the template, markdown supported, can contain variable placeholders. */
  contentMarkdown: string
  /** Subject of the message, used in emails. */
  subject: string
  /** Message language. */
  lang?: string
  /** DID of the user who is creating the template. */
  createdBy?: string
}

export type OutputSchema = ToolsOzoneCommunicationDefs.TemplateView

export interface CallOptions {
  signal?: AbortSignal
  headers?: HeadersMap
  qp?: QueryParams
  encoding?: 'application/json'
}

export interface Response {
  success: boolean
  headers: HeadersMap
  data: OutputSchema
}

export class DuplicateTemplateNameError extends XRPCError {
  constructor(src: XRPCError) {
    super(src.status, src.error, src.message, src.headers, { cause: src })
  }
}

export function toKnownErr(e: any) {
  if (e instanceof XRPCError) {
    if (e.error === 'DuplicateTemplateName')
      return new DuplicateTemplateNameError(e)
  }

  return e
}
