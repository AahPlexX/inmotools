export interface StructuredLogs {
  columns: string[];
  rows: Array<Record<string, string>>;
  unmatched: string[];
}

export function structureLogLines(input: string, pattern: string): StructuredLogs {
  const regex = new RegExp(pattern);
  const columns = Object.keys(regex.exec('')?.groups ?? {});
  const rows: Array<Record<string, string>> = [];
  const unmatched: string[] = [];
  let discovered = columns;

  for (const line of input.split(/\r?\n/).filter(Boolean)) {
    regex.lastIndex = 0;
    const match = regex.exec(line);
    if (!match) { unmatched.push(line); continue; }
    const groups = match.groups ?? {};
    if (discovered.length === 0) discovered = Object.keys(groups);
    rows.push(Object.fromEntries(discovered.map((column) => [column, groups[column] ?? ''])));
  }
  return { columns: discovered, rows, unmatched };
}

function csvCell(value: unknown): string {
  const text = String(value ?? '');
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function rowsToCsv(rows: Array<Record<string, unknown>>, columns: string[]): string {
  return [columns.map(csvCell).join(','), ...rows.map((row) => columns.map((column) => csvCell(row[column])).join(','))].join('\r\n');
}

export function rowsToMarkdown(rows: Array<Record<string, unknown>>, columns: string[]): string {
  const escape = (value: unknown) => String(value ?? '').replace(/\|/g, '\\|').replace(/\r?\n/g, '<br>');
  return [`| ${columns.join(' | ')} |`, `| ${columns.map(() => '---').join(' | ')} |`, ...rows.map((row) => `| ${columns.map((column) => escape(row[column])).join(' | ')} |`)].join('\n');
}
