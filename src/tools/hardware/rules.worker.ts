/// <reference lib="webworker" />
import type { LineRule } from './packet-engine';
import type { RuleEntry, RuleLabels } from './rule-runner';

self.onmessage = (event: MessageEvent<{ entries: RuleEntry[]; rules: LineRule[] }>) => {
  try {
    const rules = event.data.rules.flatMap((rule) => {
      if (!rule.label.trim() || !rule.pattern.trim()) return [];
      try { return [{ label: rule.label, regex: new RegExp(rule.pattern) }]; }
      catch { return []; }
    });
    const labels: RuleLabels = event.data.entries.map((entry) => [
      entry.id,
      rules.find((rule) => rule.regex.test(`${entry.text} ${entry.hex}`))?.label ?? '',
    ]);
    self.postMessage({ labels });
  } catch {
    self.postMessage({ error: 'Could not match capture rules.' });
  }
};
