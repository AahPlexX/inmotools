/** Unfold a navigation target from the outside inward, including named groups. */
export function revealDisclosureTarget(target: HTMLElement) {
  const ancestors: HTMLDetailsElement[] = [];
  for (let parent = target.parentElement; parent; parent = parent.parentElement) {
    if (parent instanceof HTMLDetailsElement) ancestors.unshift(parent);
  }
  ancestors.forEach(parent => { parent.open = true; });
}

export function uniqueDisclosureStates(host: HTMLElement) {
  const states = new Map<string, { open: boolean; defaultOpen: string | undefined }>();
  const duplicates = new Set<string>();
  for (const node of host.querySelectorAll<HTMLDetailsElement>('details.markdown-disclosure')) {
    const caption = node.querySelector(':scope > summary')?.textContent?.trim();
    if (!caption || duplicates.has(caption)) continue;
    if (states.has(caption)) { states.delete(caption); duplicates.add(caption); }
    else states.set(caption, { open: node.open, defaultOpen: node.dataset.disclosureDefaultOpen });
  }
  return states;
}
