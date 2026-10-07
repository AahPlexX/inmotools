import { describe, expect, it } from 'vitest';
import type { Root } from 'mdast';
import { parseMarkdown } from '../../src/tools/markdown/parse-engine';
import { countMarkdownTasks } from '../../src/tools/markdown/task-progress';

const progress = (source: string) => countMarkdownTasks(parseMarkdown(source).tree as Root);

describe('MDW-R38 native document task progress', () => {
  it('reports explicit zero counts for empty documents and ordinary lists', () => {
    expect(progress('')).toEqual({ completed: 0, total: 0 });
    expect(progress('- Plain item\n- Another item')).toEqual({ completed: 0, total: 0 });
  });

  it('counts mixed native markers once across nested ordered lists and quotes', () => {
    expect(progress('- [x] Done\n  - [ ] Nested\n\n1. [X] Also done\n\n> - [ ] Quoted')).toEqual({ completed: 2, total: 4 });
  });

  it('includes closed disclosure and footnote tasks', () => {
    expect(progress('<details>\n<summary>Closed</summary>\n\n- [X] Hidden completed\n\n</details>\n\nReference[^note].\n\n[^note]: note\n\n    - [ ] Footnote task')).toEqual({ completed: 1, total: 2 });
  });

  it('ignores code, metadata, escaped markers and malformed disclosure fallback', () => {
    const source = '---\ntitle: "- [x] metadata"\n---\n\n`- [x] inline`\n\n```text\n- [x] fenced\n```\n\n    - [x] indented\n\n- \\[x] Escaped\n\n<details>\n<summary>Literal</summary>\n\n- [x] Fallback task\n';
    expect(progress(source)).toEqual({ completed: 0, total: 0 });
  });

  it('uses native parser semantics for tabs, spanning whitespace and CRLF', () => {
    expect(progress('- [\t] Tab\r\n- [\r\n] Spanning\r\n- [X] Complete\r\n- [yes] Plain\r\n')).toEqual({ completed: 1, total: 3 });
  });

  it('tracks replaced sources without retaining prior document counts', () => {
    expect(progress('- [x] A\n- [x] B')).toEqual({ completed: 2, total: 2 });
    expect(progress('- [ ] C')).toEqual({ completed: 0, total: 1 });
    expect(progress('No tasks.')).toEqual({ completed: 0, total: 0 });
  });
});
