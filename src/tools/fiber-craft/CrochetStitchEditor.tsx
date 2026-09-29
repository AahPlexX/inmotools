import type { CrochetLoopMode } from './fiber-craft-types';

export type CrochetLoopChoice = 'both' | CrochetLoopMode;

/**
 * Inspector section for editing one stitch position in a crochet round chart. It is presentational:
 * every action is a callback so the workspace stays the single owner of history and status messages.
 */
export function CrochetStitchEditor({
  round,
  positions,
  selectedAngle,
  selectedLabel,
  sharedBase,
  loop,
  canRemoveRound,
  onSelectAngle,
  onSharedBaseChange,
  onLoopChange,
  onPlaceSelected,
  onClearSelected,
  onFillRound,
  onClearRound,
  onRemoveLastRound,
}: {
  round: number;
  positions: number;
  selectedAngle: number;
  selectedLabel: string;
  sharedBase: boolean;
  loop: CrochetLoopChoice;
  canRemoveRound: boolean;
  onSelectAngle: (angle: number) => void;
  onSharedBaseChange: (value: boolean) => void;
  onLoopChange: (value: CrochetLoopChoice) => void;
  onPlaceSelected: () => void;
  onClearSelected: () => void;
  onFillRound: () => void;
  onClearRound: () => void;
  onRemoveLastRound: () => void;
}) {
  return (
    <section aria-labelledby="fiber-position-heading" data-testid="stitch-position-editor">
      <h3 id="fiber-position-heading">Edit a stitch</h3>
      <p className="fiber-craft-muted">
        Click a stitch on the chart, or focus the chart and use the arrow keys. Enter places the chosen stitch, Delete clears it.
      </p>
      <label className="fiber-craft-field" htmlFor="fiber-position-number">
        <span>Stitch position in round {round + 1} (1–{positions})</span>
        <input
          id="fiber-position-number"
          type="number"
          min="1"
          max={positions}
          step="1"
          inputMode="numeric"
          value={selectedAngle + 1}
          onChange={(event) => {
            const value = Number(event.target.value);
            if (Number.isInteger(value) && value >= 1 && value <= positions) onSelectAngle(value - 1);
          }}
        />
      </label>
      <p className="fiber-craft-muted" data-testid="selected-stitch-summary">{selectedLabel}</p>
      <label className="fiber-craft-check" htmlFor="fiber-shared-base">
        <input
          id="fiber-shared-base"
          type="checkbox"
          checked={sharedBase}
          onChange={(event) => onSharedBaseChange(event.target.checked)}
        />
        <span>Same base stitch as the previous position (increase leg)</span>
      </label>
      <p className="fiber-craft-muted">
        Turn this on to chart increases. Position 1 always starts a new base stitch, and “Fill round” then works every second position into the base before it.
      </p>
      <label className="fiber-craft-field" htmlFor="fiber-loop-mode">
        <span>Worked in</span>
        <select id="fiber-loop-mode" value={loop} onChange={(event) => onLoopChange(event.target.value as CrochetLoopChoice)}>
          <option value="both">Both loops</option>
          <option value="back">Back loop only (BLO)</option>
          <option value="front">Front loop only (FLO)</option>
        </select>
      </label>
      <button className="action-button fiber-craft-wide" type="button" onClick={onPlaceSelected}>Place at selected position</button>
      <button className="action-button secondary fiber-craft-wide" type="button" onClick={onClearSelected}>Clear selected position</button>
      <button className="action-button secondary fiber-craft-wide" type="button" onClick={onFillRound}>Fill round {round + 1} with this stitch</button>
      <button className="action-button secondary fiber-craft-wide" type="button" onClick={onClearRound}>Clear round {round + 1}</button>
      <button className="action-button secondary fiber-craft-wide" type="button" disabled={!canRemoveRound} onClick={onRemoveLastRound}>Remove last round</button>
    </section>
  );
}
