// Adds controls only to the live preview. Detached export rendering does not
// call this enhancer, so line numbers and copy UI never enter exported HTML.
export function addCodePreviewControls(host: HTMLElement, includeRemainingDiagrams = false): () => void {
  const cleanups: Array<() => void> = [];
  const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver((entries) => {
    for (const entry of entries) updates.get(entry.target)?.();
  });
  const updates = new Map<Element, () => void>();
  let index = host.querySelectorAll('.markdown-code-frame').length;
  for (const code of host.querySelectorAll<HTMLElement>('pre > code')) {
    const pre = code.parentElement!;
    if (pre.closest('.markdown-code-frame')) continue;
    if (!includeRemainingDiagrams && ['mermaid', 'dot', 'graphviz'].some((language) => code.classList.contains(`language-${language}`))) continue;
    index++;
    const text = code.textContent ?? '';
    const withoutFinalBreak = text.endsWith('\n') ? text.slice(0, -1) : text;
    let count = text ? 1 : 0;
    for (let offset = 0; offset < withoutFinalBreak.length; offset++) if (withoutFinalBreak.charCodeAt(offset) === 10) count++;
    const frame = document.createElement('div');
    frame.className = 'markdown-code-frame';
    // Code selection and controls inside a task item must not toggle its checkbox.
    frame.onclick = (event) => event.stopPropagation();
    const sourceLine = pre.getAttribute('data-source-line');
    // The outer anchor stays fixed when code is scrolled inside its own frame.
    if (sourceLine) frame.setAttribute('data-source-line', sourceLine);
    const header = document.createElement('div');
    header.className = 'markdown-code-header';
    const label = document.createElement('span');
    label.textContent = `Code · ${count} ${count === 1 ? 'line' : 'lines'}`;
    const copy = document.createElement('button');
    copy.type = 'button';
    copy.textContent = 'Copy code';
    copy.setAttribute('aria-label', `Copy code block ${index}`);
    copy.title = 'Copy every code line, without line numbers.';
    const select = document.createElement('button');
    select.type = 'button';
    select.textContent = 'Select code';
    select.hidden = true;
    const status = document.createElement('span');
    status.setAttribute('role', 'status');
    status.hidden = true;
    const fallback = document.createElement('div');
    fallback.className = 'markdown-code-fallback';
    fallback.hidden = true;
    const fallbackText = document.createElement('textarea');
    fallbackText.readOnly = true;
    fallbackText.wrap = 'off';
    fallbackText.setAttribute('aria-label', `Code ready to copy from block ${index}`);
    fallback.append(fallbackText);
    copy.onclick = async (event) => {
      event.stopPropagation();
      copy.disabled = true;
      status.hidden = false;
      status.textContent = 'Copying…';
      try {
        await navigator.clipboard.writeText(text);
        if (copy.isConnected) {
          status.textContent = 'Code copied.';
          select.hidden = true;
          fallback.hidden = true;
          fallbackText.value = '';
        }
      } catch {
        if (copy.isConnected) {
          status.textContent = 'Clipboard blocked. Select the code and copy with your browser.';
          select.hidden = false;
          fallbackText.value = text;
          fallback.hidden = false;
        }
      } finally { copy.disabled = false; }
    };
    select.onclick = (event) => {
      event.stopPropagation();
      fallbackText.focus();
      fallbackText.select();
      status.textContent = 'Code selected. Copy with your browser or keyboard.';
    };
    header.append(label, copy, select, status);
    const body = document.createElement('div');
    body.className = 'markdown-code-body';
    body.tabIndex = 0;
    body.setAttribute('role', 'region');
    body.setAttribute('aria-label', `Scrollable code block ${index}`);
    const gutter = document.createElement('div');
    gutter.className = 'markdown-code-gutter';
    gutter.setAttribute('aria-hidden', 'true');
    gutter.style.minWidth = `${Math.max(2, String(count).length) + 2}ch`;
    const numbers = document.createElement('span');
    numbers.className = 'markdown-code-line-numbers';
    gutter.append(numbers);
    pre.replaceWith(frame);
    body.append(gutter, pre);
    frame.append(header, body, fallback);
    const update = () => {
      const height = Number.parseFloat(getComputedStyle(code).lineHeight) || 22.4;
      const first = Math.max(0, Math.min(count - 1, Math.floor(body.scrollTop / height)));
      const last = Math.min(count, first + Math.ceil(body.clientHeight / height) + 2);
      const visible: string[] = [];
      for (let line = first + 1; line <= last; line++) visible.push(String(line));
      numbers.textContent = visible.join('\n');
      numbers.style.transform = `translateY(${first * height}px)`;
    };
    updates.set(body, update);
    observer?.observe(body);
    body.addEventListener('scroll', update, { passive: true });
    window.addEventListener('resize', update);
    update();
    cleanups.push(() => {
      body.removeEventListener('scroll', update);
      window.removeEventListener('resize', update);
      frame.onclick = null;
      copy.onclick = null;
      select.onclick = null;
    });
  }
  return () => { observer?.disconnect(); cleanups.forEach((cleanup) => cleanup()); };
}
