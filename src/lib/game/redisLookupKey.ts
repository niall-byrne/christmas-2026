import { normalizeWhitespace } from "@/lib/text/normalize"

export function redisLookupKey(value: string): string {
  return normalizeWhitespace(value).toLowerCase()
}
