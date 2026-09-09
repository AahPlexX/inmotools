import { useEffect, useRef, useState } from 'react';
import { startEcmaReplacementPreview, type ReplacementPreviewTask } from './regex-substitution-worker-client';

interface Props {
  readonly flavor: string;
  readonly pattern: string;
  readonly flags: string;
  readonly subject: string;
  readonly replacement: string;
}

const WATCHDOG_MS = 500;

const RegexReplacementPreview = ({ flavor, pattern, flags, subject, replacement }: Props) => {
  const [output, setOutput] = useState('Preparing replacement preview…');
  const [phase, setPhase] = useState('idle');
  const taskRef = useRef<ReplacementPreviewTask | null>(null);

  useEffect(() => {
    taskRef.current?.cancel();
    taskRef.current = null;

    if (flavor !== 'ecmascript') {
      setOutput('Replacement preview is available for the ECMAScript execution flavor.');
      setPhase('unavailable');
      return;
    }

    let active = true;
    setPhase('running');
    const task = startEcmaReplacementPreview(pattern, flags, subject, replacement, WATCHDOG_MS);
    taskRef.current = task;
    void task.promise.then((result) => {
      if (!active) return;
      setOutput(result.output ?? result.error ?? 'Replacement preview returned no output.');
      setPhase(result.timedOut ? 'timed out' : result.cancelled ? 'cancelled' : result.error ? 'error' : `complete · ${result.durationMs.toFixed(2)} ms`);
      if (taskRef.current === task) taskRef.current = null;
    });

    return () => {
      active = false;
      task.cancel();
      if (taskRef.current === task) taskRef.current = null;
    };
  }, [flavor, flags, pattern, replacement, subject]);

  const cancel = () => {
    const task = taskRef.current;
    if (!task) return;
    task.cancel();
    taskRef.current = null;
    setOutput('Replacement preview cancelled.');
    setPhase('cancelled');
  };

  return <>
    <div className="regex-preview-meta">
      <span data-testid="replacement-preview-status">Worker isolated · {WATCHDOG_MS} ms watchdog · {phase}</span>
      <button type="button" onClick={cancel} disabled={!taskRef.current} aria-label="Cancel replacement preview">Cancel preview</button>
    </div>
    <pre data-testid="replacement-preview-output" tabIndex={0}>{output}</pre>
  </>;
};

export default RegexReplacementPreview;
