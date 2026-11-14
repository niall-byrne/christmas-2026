import type { ApiEndpointLogger } from "@/contracts/api/logger"

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
