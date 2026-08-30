import { useEffect, type ReactNode } from 'react';
import type { ToolDefinition } from '../catalog';
import { useWorkspace } from '../lib/workspace-context';

export function ToolLayout({ tool, children }: { tool: ToolDefinition; children: ReactNode }) {
  const { isFavorite, toggleFavorite, markRecent } = useWorkspace();
  const favorite = isFavorite(tool.slug);

  useEffect(() => { markRecent(tool.slug); }, [markRecent, tool.slug]);

  return (
    <div className="suite-page">
      <div className="suite-topline">
        <a className="back-link" href="#/">← All tools</a>
        <button className="favorite-button" type="button" onClick={() => toggleFavorite(tool.slug)} aria-pressed={favorite}>
          {favorite ? 'Remove from favorites' : 'Add to favorites'}
        </button>
      </div>

      <section className="suite-intro" aria-labelledby="suite-title">
        <div>
          <p className="audience">{tool.audience}</p>
          <h1 id="suite-title" data-testid="suite-title">{tool.title}</h1>
          <p className="suite-summary">{tool.summary}</p>
        </div>
        <aside className="local-note" data-testid="privacy-status" aria-label="Privacy status">
          <span className="local-note-label">Runs locally</span>
          <p>{tool.privacy}</p>
        </aside>
      </section>

      <section className="suite-guide" aria-labelledby="how-to-use">
        <div>
          <h2 id="how-to-use">How to use this tool</h2>
          <ol>{tool.steps.map((step) => <li key={step}>{step}</li>)}</ol>
        </div>
        <dl className="suite-facts">
          <div><dt>Input</dt><dd>{tool.accepts}</dd></div>
          <div><dt>Output</dt><dd>{tool.outputs}</dd></div>
          <div><dt>Useful hint</dt><dd>{tool.hint}</dd></div>
        </dl>
      </section>

      <section className="suite-workspace" data-testid="suite-workspace" aria-label={`${tool.shortTitle} workspace`}>
        {children}
      </section>
    </div>
  );
}
