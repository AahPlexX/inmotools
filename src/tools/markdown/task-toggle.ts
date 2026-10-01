// Flips a GitHub-flavored task marker on one source line. Returns null when
// that line is not a task, so a preview click cannot rewrite unrelated text.
// Newline style is preserved so a Windows draft does not get rewritten to LF.

const TASK_LINE = /^(\s*(?:[-*+]|\d+[.)])\s+)\[([ xX])\](.*)$/;

export const toggleTaskListMarker = (source: string, line: number): string | null => {
  if (!Number.isInteger(line) || line < 1) return null;
  const newline = source.includes('\r\n') ? '\r\n' : '\n';
  const lines = source.split(/\r\n|\r|\n/);
  const current = lines[line - 1];
  if (current == null) return null;
  const match = TASK_LINE.exec(current);
  if (!match) return null;
  const nextMark = match[2].toLowerCase() === 'x' ? ' ' : 'x';
  lines[line - 1] = `${match[1]}[${nextMark}]${match[3]}`;
  return lines.join(newline);
};
