import { describe, expect, it } from 'vitest';
import { toggleTaskListMarker } from '../../src/tools/markdown/task-toggle';

describe('task list marker toggle', () => {
  it('checks an open task and unchecks a completed one', () => {
    expect(toggleTaskListMarker('- [ ] Buy milk', 1)).toBe('- [x] Buy milk');
    expect(toggleTaskListMarker('- [x] Buy milk', 1)).toBe('- [ ] Buy milk');
    expect(toggleTaskListMarker('1. [ ] First', 1)).toBe('1. [x] First');
  });

  it('leaves non-task lines unchanged and preserves CRLF', () => {
    expect(toggleTaskListMarker('Just a paragraph', 1)).toBeNull();
    expect(toggleTaskListMarker('- [ ] One\r\n- [x] Two', 2)).toBe('- [ ] One\r\n- [ ] Two');
  });

  it('rejects a line that is not in the document', () => {
    expect(toggleTaskListMarker('- [ ] One', 4)).toBeNull();
    expect(toggleTaskListMarker('- [ ] One', 0)).toBeNull();
  });

  it('toggles quoted tasks without changing their quote prefixes or mixed line endings', () => {
    const source = '> > - [ ] Quoted\r\n\n- [x] Other\r';
    expect(toggleTaskListMarker(source, 1)).toBe(source.replace('[ ]', '[x]'));
  });

  it('uses native task positions after metadata and ignores task-looking code', () => {
    const source = '---\r\ntitle: Tasks\r\n---\r\n\r\n> - [ ] Task';
    expect(toggleTaskListMarker(source, 5)).toBe(source.replace('[ ]', '[x]'));
    expect(toggleTaskListMarker('```md\n- [ ] Literal\n```', 2)).toBeNull();
  });
  it.each([
    ['- [\t] Task\r\nAfter', '- [x] Task\r\nAfter'],
    ['- [\n] Task\rAfter', '- [x] Task\rAfter'],
    ['> - [\r\n> ] Task\n> After', '> - [x] Task\n> After'],
  ])('toggles native whitespace markers and preserves all source outside their marker: %s', (source, expected) => {
    expect(toggleTaskListMarker(source, 1)).toBe(expected);
  });
  it('rejects task-shaped literals and malformed disclosure fallbacks', () => {
    expect(toggleTaskListMarker('- [ ]Not a task', 1)).toBeNull();
    expect(toggleTaskListMarker('    - [ ] Code', 1)).toBeNull();
    expect(toggleTaskListMarker('<details>\n\n- [ ] Literal task', 3)).toBeNull();
  });
});
