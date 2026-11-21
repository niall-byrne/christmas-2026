import { normalizeWhitespace } from "@/shared/text/normalize"

export function redisLookupKey(value: string): string {
  return normalizeWhitespace(value).toLowerCase()
}
