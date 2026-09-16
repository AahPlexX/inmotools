import { useMemo } from 'react';
import { describeFiberCraftChart } from './engines/chart-description-engine';
import type { CrochetDialect } from './engines/symbol-library';
import type { FiberCraftDocument } from './fiber-craft-types';

export type FiberCraftTheme = 'light' | 'dark-room' | 'high-contrast';
export const FIBER_CRAFT_DESCRIPTION_ID = 'fiber-chart-description-summary';

export function FiberCraftChartDescription({ document, dialect, visible }: { document: FiberCraftDocument; dialect: CrochetDialect; visible: boolean; }) {
  const description = useMemo(() => describeFiberCraftChart(document, dialect), [dialect, document]);
  if (!visible) return <p id={FIBER_CRAFT_DESCRIPTION_ID} className="fiber-craft-visually-hidden">{description.summary}</p>;
  return (
    <section className="fiber-craft-analysis-card fiber-craft-description" aria-labelledby="fiber-description-heading" data-testid="chart-description">
      <div className="fiber-craft-analysis-heading"><div><h3 id="fiber-description-heading">Chart description</h3><p id={FIBER_CRAFT_DESCRIPTION_ID}>{description.summary}</p></div></div>
      <ol className="fiber-craft-plain-list">{description.details.map((detail, index) => <li key={index}>{detail}</li>)}</ol>
      {description.legend.length > 0 ? <div className="fiber-craft-description-legend" aria-label="Chart legend summary">{description.legend.map((item) => <p key={item}>{item}</p>)}</div> : null}
    </section>
  );
}
