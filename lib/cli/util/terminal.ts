export function getTerminalWidth(
  columns: number | undefined,
  defaultWidth: number
): number {
  return columns && columns > 0 ? columns : defaultWidth
}

export function createTerminalDivider(
  character: string,
  columns: number | undefined,
  defaultWidth: number,
  minimumWidth: number
): string {
  return character.repeat(
    Math.max(minimumWidth, getTerminalWidth(columns, defaultWidth))
  )
}
