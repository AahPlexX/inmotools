/**
 * @file MusicWorkspace.tsx — route entry for the `audio-mastering` suite.
 * @description Loads the tool-scoped stylesheet with the lazy chunk and renders the mastering
 * workstation. The harmony and MIDI lab keeps its own `midi-harmony-lab` route
 * (HarmonyWorkspace.tsx) so each suite has a distinct address, title and first screen.
 */
import MasteringWorkspace from './MasteringWorkspace';
import './mastering.css';

export default function MusicWorkspace() {
  return <MasteringWorkspace />;
}
