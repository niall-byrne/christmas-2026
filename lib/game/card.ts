import { normalizeWhitespace } from "@/lib/text/normalize"

export function serializeCardEntry(
  recipient: string,
  identifier: string
): string {
  return JSON.stringify({
    recipient: normalizeWhitespace(recipient),
    identifier: normalizeWhitespace(identifier),
  })
}
