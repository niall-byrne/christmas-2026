import type { ApiEndpointLogger } from "@/contracts/api/logger"
import type { z } from "zod"

export type ApiEndpointResult<TData = unknown> =
  | {
      status?: number
      data?: TData
      headers?: HeadersInit
    }
  | Response

export interface ApiEndpointContext<Params = Record<string, unknown>> {
  params?: Params | Promise<Params>
}

export interface ApiEndpointInput<Params, Body> {
  params: Params
  body: Body
  request: Request
  logger: ApiEndpointLogger
}

export interface ApiEndpointOptions<
  TParams extends z.ZodType = z.ZodType,
  TBody extends z.ZodType = z.ZodType,
> {
  paramsSchema?: TParams
  bodySchema?: TBody
  auth?: boolean
}
