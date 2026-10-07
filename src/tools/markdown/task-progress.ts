import type { Nodes, Root } from 'mdast';

export interface TaskProgress {
  readonly completed: number;
  readonly total: number;
}

export const countMarkdownTasks = (tree: Root): TaskProgress => {
  let completed = 0;
  let total = 0;
  const stack: Nodes[] = [tree];
  while (stack.length) {
    const node = stack.pop()!;
    if (node.type === 'listItem' && typeof node.checked === 'boolean') {
      total += 1;
      if (node.checked) completed += 1;
    }
    if ('children' in node) for (const child of node.children) stack.push(child);
  }
  return { completed, total };
};
