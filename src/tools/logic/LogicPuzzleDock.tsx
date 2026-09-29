import { useState } from 'react';
import type { LogicDocument } from './logic-types';
import {
  evaluatePuzzle,
  nextUnsolved,
  parseProgress,
  PUZZLE_LEVELS,
  recordResult,
  serializeProgress,
  type PuzzleEvaluation,
  type PuzzleLevel,
  type PuzzleProgress,
} from './puzzle-engine';
import './LogicPuzzleDock.css';

export const PUZZLE_PROGRESS_KEY = 'inmotools_logic_puzzle_progress';

export interface LogicPuzzleDockProps {
  readonly document: LogicDocument;
  /** Replaces the circuit on screen with the level's starter (the workspace confirms first). */
  readonly onStartLevel: (level: PuzzleLevel) => void;
  readonly onClose: () => void;
}

const loadProgress = (): PuzzleProgress => {
  try {
    return parseProgress(window.localStorage.getItem(PUZZLE_PROGRESS_KEY));
  } catch {
    return {};
  }
};

const saveProgress = (progress: PuzzleProgress): void => {
  try {
    window.localStorage.setItem(PUZZLE_PROGRESS_KEY, serializeProgress(progress));
  } catch {
    /* Progress is a convenience; a full or blocked store just means it is not remembered. */
  }
};

const stars = (count: number): string => (count === 2 ? '★★' : count === 1 ? '★' : '');

const bitsOf = (mask: number, count: number): number[] => Array.from({ length: count }, (_, index) => (mask >> index) & 1);

export function LogicPuzzleDock({ document: doc, onStartLevel, onClose }: LogicPuzzleDockProps) {
  const [progress, setProgress] = useState<PuzzleProgress>(loadProgress);
  const [levelId, setLevelId] = useState<string>(() => (nextUnsolved(loadProgress()) ?? PUZZLE_LEVELS[0]!).id);
  const [evaluation, setEvaluation] = useState<PuzzleEvaluation | null>(null);
  const [hintOpen, setHintOpen] = useState(false);

  const level = PUZZLE_LEVELS.find((entry) => entry.id === levelId) ?? PUZZLE_LEVELS[0]!;
  const solvedCount = PUZZLE_LEVELS.filter((entry) => progress[entry.id]?.solved).length;
  // A result belongs to the level it was checked for; switching levels clears it.
  const shown = evaluation && evaluation.levelId === level.id ? evaluation : null;

  const chooseLevel = (id: string) => {
    setLevelId(id);
    setEvaluation(null);
    setHintOpen(false);
  };

  const check = () => {
    const result = evaluatePuzzle(doc, level);
    setEvaluation(result);
    if (result.passed) {
      const next = recordResult(progress, result);
      setProgress(next);
      saveProgress(next);
    }
  };

  const following = shown?.passed ? PUZZLE_LEVELS[PUZZLE_LEVELS.findIndex((entry) => entry.id === level.id) + 1] : undefined;

  return (
    <section className="logic-dock logic-puzzles" aria-label="Logic puzzles" data-testid="logic-puzzle-dock">
      <div className="logic-puzzles-toolbar">
        <strong>Puzzles</strong>
        <span className="logic-puzzles-count" data-testid="logic-puzzle-count">{solvedCount} of {PUZZLE_LEVELS.length} solved</span>
        <button type="button" className="logic-puzzles-close" onClick={onClose} aria-label="Close the puzzles">Close</button>
      </div>

      <div className="logic-puzzles-body">
        <ol className="logic-puzzles-levels" aria-label="Levels">
          {PUZZLE_LEVELS.map((entry, index) => {
            const result = progress[entry.id];
            return (
              <li key={entry.id}>
                <button type="button" aria-current={entry.id === level.id ? 'true' : undefined} onClick={() => chooseLevel(entry.id)}>
                  <span className="logic-puzzles-number">{index + 1}</span>
                  <span className="logic-puzzles-title">{entry.title}</span>
                  {result?.solved ? <span className="logic-puzzles-stars" aria-label={`Solved, ${result.stars} star${result.stars === 1 ? '' : 's'}`}>{stars(result.stars)}</span> : null}
                </button>
              </li>
            );
          })}
        </ol>

        <div className="logic-puzzles-detail">
          <h3>{level.title}</h3>
          <p className="logic-puzzles-goal">{level.goal}</p>
          <p className="logic-puzzles-rules">
            Inputs: <code>{level.inputs.join(', ')}</code>. Outputs: <code>{level.outputs.join(', ')}</code>.{' '}
            {level.allowedParts.length === 0 ? 'Use wires only.' : `You may use: ${level.allowedParts.join(', ')}.`} Reference solution: {level.par} part{level.par === 1 ? '' : 's'}.
          </p>
          <div className="logic-puzzles-actions">
            <button type="button" onClick={() => onStartLevel(level)}>Start this level</button>
            <button type="button" onClick={check}>Check my circuit</button>
            <button type="button" aria-pressed={hintOpen} onClick={() => setHintOpen((open) => !open)}>{hintOpen ? 'Hide hint' : 'Show hint'}</button>
          </div>
          {hintOpen ? <p className="logic-puzzles-hint">{level.hint}</p> : null}

          {shown ? (
            <div className={shown.passed ? 'logic-puzzles-result logic-puzzles-pass' : 'logic-puzzles-result logic-puzzles-fail'} role="status" data-testid="logic-puzzle-result">
              {shown.passed ? (
                <>
                  <strong>Solved! {stars(shown.stars)}</strong>{' '}
                  {shown.gateCount} part{shown.gateCount === 1 ? '' : 's'} used
                  {shown.stars === 2 ? ', matching the reference solution.' : `; the reference solution uses ${level.par}. Can you match it?`}
                  {following ? <button type="button" onClick={() => chooseLevel(following.id)}>Next level</button> : null}
                </>
              ) : shown.issues.length > 0 ? (
                <>
                  <strong>Not ready to check.</strong>
                  <ul>{shown.issues.map((issue) => <li key={issue}>{issue}</li>)}</ul>
                </>
              ) : (
                <strong>Not yet. {shown.rows.filter((row) => !row.ok).length} of {shown.rows.length} rows are wrong; they are marked below.</strong>
              )}
            </div>
          ) : null}

          <table className="logic-puzzles-table" data-testid="logic-puzzle-table">
            <caption>Truth table to match</caption>
            <thead>
              <tr>
                {level.inputs.map((label) => <th key={label} scope="col">{label}</th>)}
                {level.outputs.map((label) => <th key={label} scope="col">{label} (want)</th>)}
                {shown && shown.rows.length > 0 ? level.outputs.map((label) => <th key={`got-${label}`} scope="col">{label} (yours)</th>) : null}
              </tr>
            </thead>
            <tbody>
              {Array.from({ length: 1 << level.inputs.length }, (_, mask) => {
                const row = shown?.rows[mask];
                return (
                  <tr key={mask} className={row ? (row.ok ? 'logic-puzzles-row-ok' : 'logic-puzzles-row-bad') : undefined}>
                    {bitsOf(mask, level.inputs.length).map((value, index) => <td key={index}>{value}</td>)}
                    {level.expected(mask).map((value, index) => <td key={`w${index}`}>{value}</td>)}
                    {row ? row.actual.map((value, index) => <td key={`g${index}`}>{String(value)}{row.ok ? '' : ' ✗'}</td>) : null}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}
