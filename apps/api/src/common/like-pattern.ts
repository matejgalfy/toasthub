/** An `ILIKE` pattern that matches `text` literally anywhere in a value (`%`, `_` and `\` escaped). */
export function containsPattern(text: string): string {
  return `%${text.replace(/[\\%_]/g, '\\$&')}%`;
}
