export function formatValidationIssues(
  issues: Array<{ path: PropertyKey[]; message: string }>,
  messages: Readonly<Record<string, string>> = {}
): string {
  return issues
    .map(({ path, message }) => {
      const field = path.map(String).join(".") || "config"
      return `${field}: ${messages[message] ?? message}`
    })
    .join("\n")
}
