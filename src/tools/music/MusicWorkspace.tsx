import { useState } from 'react';
import HarmonyWorkspace from './HarmonyWorkspace';
import MasteringWorkspace from './MasteringWorkspace';

type Surface = 'mastering' | 'harmony';

export default function MusicWorkspace() {
  const [surface, setSurface] = useState<Surface>('mastering');
  return <>
    <div className="music-surface-tabs" role="tablist" aria-label="Music workspace">
      <button type="button" role="tab" id="music-tab-mastering" aria-selected={surface === 'mastering'} aria-controls="music-panel-mastering" onClick={() => setSurface('mastering')}>Mastering & audio editor</button>
      <button type="button" role="tab" id="music-tab-harmony" aria-selected={surface === 'harmony'} aria-controls="music-panel-harmony" onClick={() => setSurface('harmony')}>Harmony & MIDI</button>
    </div>
    <div role="tabpanel" id={surface === 'mastering' ? 'music-panel-mastering' : 'music-panel-harmony'} aria-labelledby={surface === 'mastering' ? 'music-tab-mastering' : 'music-tab-harmony'}>
      {surface === 'mastering' ? <MasteringWorkspace /> : <HarmonyWorkspace />}
    </div>
  </>;
}
