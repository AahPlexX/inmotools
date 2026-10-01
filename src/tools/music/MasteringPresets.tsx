/**
 * Master-chain presets (ledger 81): save the current chain under a name, apply
 * a saved one as a single undo step, or delete it. Presets live in this
 * browser's IndexedDB through {@link MasteringStore}; when storage is not
 * available the panel says so instead of offering controls that cannot work.
 */
import { useCallback, useEffect, useState } from 'react';
import type { MasterSettings } from './dsp/master-chain';
import type { MasterPreset, MasteringStore } from './mastering-persistence';
import { messageOf } from './mastering-ui';

interface Props {
  store: MasteringStore | null;
  master: MasterSettings;
  disabled: boolean;
  onApply: (settings: MasterSettings, name: string) => void;
  onStatus: (status: string) => void;
}

export default function MasteringPresets({ store, master, disabled, onApply, onStatus }: Props) {
  const [presets, setPresets] = useState<MasterPreset[]>([]);
  const [selectedId, setSelectedId] = useState('');
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async (select?: string) => {
    if (!store) return;
    const list = await store.listPresets();
    setPresets(list);
    setSelectedId((current) => select ?? (list.some((preset) => preset.id === current) ? current : list[0]?.id ?? ''));
  }, [store]);

  useEffect(() => { refresh().catch((error: unknown) => onStatus(`Could not read saved presets: ${messageOf(error)}`)); }, [refresh, onStatus]);

  if (!store) return <p className="help-text">Presets are saved in this browser's storage, which is not available here (for example in some private windows).</p>;

  const selected = presets.find((preset) => preset.id === selectedId) ?? null;

  const save = async () => {
    setBusy(true);
    try {
      const preset = await store.savePreset(name, master);
      await refresh(preset.id);
      setName('');
      onStatus(`Saved the current chain as the preset "${preset.name}".`);
    } catch (error) { onStatus(`Could not save the preset: ${messageOf(error)}`); }
    finally { setBusy(false); }
  };

  const remove = async () => {
    if (!selected) return;
    setBusy(true);
    try {
      await store.deletePreset(selected.id);
      await refresh();
      onStatus(`Deleted the preset "${selected.name}".`);
    } catch (error) { onStatus(`Could not delete the preset: ${messageOf(error)}`); }
    finally { setBusy(false); }
  };

  return <div className="mastering-presets">
    <div className="mastering-preset-row">
      <label className="field">
        <span className="field-label">Saved presets</span>
        <select value={selectedId} onChange={(event) => setSelectedId(event.target.value)} disabled={busy || !presets.length}>
          {presets.length ? presets.map((preset) => <option key={preset.id} value={preset.id}>{preset.name}</option>) : <option value="">No presets yet</option>}
        </select>
      </label>
      <button type="button" disabled={disabled || busy || !selected} onClick={() => selected && onApply(selected.settings, selected.name)}>Apply preset</button>
      <button type="button" disabled={busy || !selected} onClick={() => void remove()}>Delete preset</button>
    </div>
    <div className="mastering-preset-row">
      <label className="field">
        <span className="field-label">Save the current chain as</span>
        <input type="text" value={name} maxLength={80} placeholder="Preset name" onChange={(event) => setName(event.target.value)}
          onKeyDown={(event) => { if (event.key === 'Enter' && name.trim()) { event.preventDefault(); void save(); } }} disabled={busy} />
      </label>
      <button type="button" disabled={busy || !name.trim()} onClick={() => void save()}>Save preset</button>
    </div>
    <p className="help-text">Saving with an existing name replaces that preset. Applying one can be undone like any other change.</p>
  </div>;
}
