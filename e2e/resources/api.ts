import { type APIRequestContext, type APIResponse } from "@playwright/test"

export interface PlaywrightTestHost {
  request: {
    newContext(options: { baseURL: string }): Promise<APIRequestContext>
  }
}

export function requireGameSession(
  context: APIRequestContext | undefined
): APIRequestContext {
  if (!context) {
    throw new Error("Game session was not initialized")
  }
  return context
}

export async function createApiContext(
  playwright: PlaywrightTestHost
): Promise<APIRequestContext> {
  return playwright.request.newContext({ baseURL: "http://127.0.0.1:3000" })
}

export async function captureResponse(response: APIResponse) {
  return {
    status: response.status(),
    body: await response.json(),
  }
}

export async function sendRequest(
  context: APIRequestContext,
  path: string,
  method: "get" | "post" | "patch" | "delete",
  data?: unknown
) {
  const options = data === undefined ? undefined : { data }
  switch (method) {
    case "get":
      return context.get(path)
    case "post":
      return context.post(path, options)
    case "patch":
      return context.patch(path, options)
    case "delete":
      return context.delete(path, options)
  }
}
