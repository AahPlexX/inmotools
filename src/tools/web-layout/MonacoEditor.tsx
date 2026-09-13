import { useEffect, useRef } from 'react';
import * as monaco from 'monaco-editor/editor/editor.api';
import 'monaco-editor/languages/definitions/html/register';
import 'monaco-editor/languages/definitions/css/register';
import 'monaco-editor/languages/definitions/javascript/register';
import EditorWorker from 'monaco-editor/editor/editor.worker?worker';

self.MonacoEnvironment = { getWorker: () => new EditorWorker() };
export default function MonacoEditor({ value, language, onChange }: { value: string; language: string; onChange: (value: string) => void }) {
  const host = useRef<HTMLDivElement>(null);
  const editor = useRef<monaco.editor.IStandaloneCodeEditor | null>(null);
  const callback = useRef(onChange); callback.current = onChange;
  useEffect(() => {
    if (!host.current) return;
    const instance = monaco.editor.create(host.current, { value, language, automaticLayout: true, minimap: { enabled: false }, wordWrap: 'on', scrollBeyondLastLine: false, ariaLabel: `${language} code editor`, accessibilitySupport: 'on', tabFocusMode: true });
    editor.current = instance;
    const change = instance.onDidChangeModelContent(() => callback.current(instance.getValue()));
    return () => { change.dispose(); const model = instance.getModel(); instance.dispose(); model?.dispose(); editor.current = null; };
  }, [language]);
  useEffect(() => { if (editor.current && editor.current.getValue() !== value) editor.current.setValue(value); }, [value]);
  return <div ref={host} className="wl-monaco" />;
}
