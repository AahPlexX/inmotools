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
});
