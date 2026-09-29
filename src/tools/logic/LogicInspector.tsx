import { blockSizeLabel, hasSelectableSize, isBlockType, MAX_SELECT_BITS, MIN_SELECT_BITS, selectBitsOf, supportsEnable, type BlockType } from './block-engine';
import { clampInputCount, isVariadicGate } from './component-library';
import { bitWidthOf, isRegisterType, MAX_BIT_WIDTH, MIN_BIT_WIDTH, registerSizeLabel } from './register-engine';
import type { ComponentInstance, LicenseOption, LogicDocument, ThemeName } from './logic-types';

const LICENSES: readonly LicenseOption[] = ['MIT', 'CERN-OHL-P-2.0', 'CC-BY-4.0', 'CC-BY-SA-4.0', 'Unlicensed'];
const THEMES: readonly { readonly value: ThemeName; readonly label: string }[] = [
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'OLED dark' },
  { value: 'high-contrast', label: 'High contrast' },
  { value: 'color-vision-safe', label: 'Color-vision safe' },
];

export interface LogicInspectorProps {
  readonly document: LogicDocument;
  readonly onRelabel: (id: string, label: string) => void;
  readonly onUpdateParams: (id: string, params: Partial<ComponentInstance['params']>) => void;
  readonly onUpdateMetadata: (metadata: Partial<LogicDocument['metadata']>) => void;
  readonly onSetTheme: (theme: ThemeName) => void;
}

export function LogicInspector({ document: doc, onRelabel, onUpdateParams, onUpdateMetadata, onSetTheme }: LogicInspectorProps) {
  const selected = doc.selectedIds.length === 1 ? doc.components.find((component) => component.id === doc.selectedIds[0]) : undefined;

  return (
    <aside className="logic-inspector" data-testid="logic-inspector" aria-label="Component inspector">
      {selected ? (
        <ComponentInspector component={selected} onRelabel={onRelabel} onUpdateParams={onUpdateParams} />
      ) : doc.selectedIds.length > 1 ? (
        <p className="logic-inspector-hint">{doc.selectedIds.length} components selected. Right-click for group actions.</p>
      ) : (
        <MetadataInspector document={doc} onUpdateMetadata={onUpdateMetadata} onSetTheme={onSetTheme} />
      )}
    </aside>
  );
}

function ComponentInspector({ component, onRelabel, onUpdateParams }: { component: ComponentInstance; onRelabel: LogicInspectorProps['onRelabel']; onUpdateParams: LogicInspectorProps['onUpdateParams'] }) {
  return (
    <div>
      <h3>{component.type.replace(/_/g, ' ')}</h3>
      <label className="logic-field">
        <span>Label</span>
        <input type="text" value={component.label} onChange={(event) => onRelabel(component.id, event.target.value)} maxLength={40} />
      </label>

      {isVariadicGate(component.type) ? (
        <label className="logic-field">
          <span>Inputs ({clampInputCount(component.params.inputCount)})</span>
          <input
            type="range"
            min={2}
            max={8}
            step={1}
            value={clampInputCount(component.params.inputCount)}
            onChange={(event) => onUpdateParams(component.id, { inputCount: Number(event.target.value) })}
          />
        </label>
      ) : null}

      {isBlockType(component.type) && hasSelectableSize(component.type) ? (
        <label className="logic-field">
          <span>Size</span>
          <select
            value={selectBitsOf(component.type, component.params)}
            onChange={(event) => onUpdateParams(component.id, { selectBits: Number(event.target.value) })}
          >
            {Array.from({ length: MAX_SELECT_BITS - MIN_SELECT_BITS + 1 }, (_, index) => MIN_SELECT_BITS + index).map((bits) => (
              <option key={bits} value={bits}>{blockSizeLabel(component.type as BlockType, bits)}</option>
            ))}
          </select>
        </label>
      ) : null}

      {isBlockType(component.type) && supportsEnable(component.type) ? (
        <label className="logic-field logic-field-inline">
          <input type="checkbox" checked={component.params.hasEnable === true} onChange={(event) => onUpdateParams(component.id, { hasEnable: event.target.checked })} />
          <span>Enable (EN) input</span>
        </label>
      ) : null}

      {component.type === 'DECODER' || component.type === 'BCD_7SEG' ? (
        <label className="logic-field">
          <span>Output polarity</span>
          <select value={component.params.activeHigh === false ? 'low' : 'high'} onChange={(event) => onUpdateParams(component.id, { activeHigh: event.target.value !== 'low' })}>
            <option value="high">{component.type === 'BCD_7SEG' ? 'Active high (lit segment = 1)' : 'Active high (selected line = 1)'}</option>
            <option value="low">{component.type === 'BCD_7SEG' ? 'Active low (lit segment = 0)' : 'Active low (selected line = 0)'}</option>
          </select>
        </label>
      ) : null}

      {isRegisterType(component.type) ? (
        <>
          <label className="logic-field">
            <span>Width</span>
            <select value={bitWidthOf(component.params)} onChange={(event) => onUpdateParams(component.id, { bitWidth: Number(event.target.value) })}>
              {Array.from({ length: MAX_BIT_WIDTH - MIN_BIT_WIDTH + 1 }, (_, index) => MIN_BIT_WIDTH + index).map((bits) => (
                <option key={bits} value={bits}>{registerSizeLabel(bits)}</option>
              ))}
            </select>
          </label>
          {component.type === 'COUNTER' ? (
            <>
              <label className="logic-field">
                <span>Direction</span>
                <select value={component.params.countDown === true ? 'down' : 'up'} onChange={(event) => onUpdateParams(component.id, { countDown: event.target.value === 'down' })}>
                  <option value="up">Count up</option>
                  <option value="down">Count down</option>
                </select>
              </label>
              <label className="logic-field">
                <span>Clocking</span>
                <select value={component.params.asyncRipple === true ? 'ripple' : 'sync'} onChange={(event) => onUpdateParams(component.id, { asyncRipple: event.target.value === 'ripple' })}>
                  <option value="sync">Synchronous (all bits together)</option>
                  <option value="ripple">Asynchronous ripple (bits change in turn)</option>
                </select>
              </label>
              <label className="logic-field logic-field-inline">
                <input type="checkbox" checked={component.params.hasLoad === true} onChange={(event) => onUpdateParams(component.id, { hasLoad: event.target.checked })} />
                <span>Synchronous load (LOAD and D pins)</span>
              </label>
            </>
          ) : null}
          <label className="logic-field logic-field-inline">
            <input type="checkbox" checked={component.params.hasEnable === true} onChange={(event) => onUpdateParams(component.id, { hasEnable: event.target.checked })} />
            <span>Enable (EN) input</span>
          </label>
          <label className="logic-field">
            <span>Clock edge</span>
            <select value={component.params.edge ?? 'rising'} onChange={(event) => onUpdateParams(component.id, { edge: event.target.value as 'rising' | 'falling' })}>
              <option value="rising">Rising edge</option>
              <option value="falling">Falling edge</option>
            </select>
          </label>
          <label className="logic-field">
            <span>{component.type === 'COUNTER' ? 'RST / LOAD polarity' : 'RST polarity'}</span>
            <select value={component.params.activeHigh === false ? 'low' : 'high'} onChange={(event) => onUpdateParams(component.id, { activeHigh: event.target.value !== 'low' })}>
              <option value="high">Active high</option>
              <option value="low">Active low</option>
            </select>
          </label>
        </>
      ) : null}

      {component.type !== 'SWITCH' && component.type !== 'PUSH_BUTTON' && component.type !== 'LED' && component.type !== 'PROBE' && component.type !== 'CLOCK' && !isRegisterType(component.type) ? (
        <label className="logic-field">
          <span>Propagation delay (ns)</span>
          <input
            type="number"
            min={1}
            max={2000}
            value={component.params.delayNs ?? 5}
            onChange={(event) => onUpdateParams(component.id, { delayNs: Math.max(1, Number(event.target.value)) })}
          />
        </label>
      ) : null}

      {component.type === 'CLOCK' ? (
        <label className="logic-field">
          <span>Frequency (Hz)</span>
          <select value={component.params.frequencyHz ?? 1} onChange={(event) => onUpdateParams(component.id, { frequencyHz: Number(event.target.value) })}>
            {[0.5, 1, 2, 5, 10, 100, 1000, 10000].map((value) => (
              <option key={value} value={value}>{value} Hz</option>
            ))}
          </select>
        </label>
      ) : null}

      {component.type === 'PUSH_BUTTON' ? (
        <label className="logic-field logic-field-inline">
          <input type="checkbox" checked={component.params.bounce ?? false} onChange={(event) => onUpdateParams(component.id, { bounce: event.target.checked })} />
          <span>Mechanical switch bounce</span>
        </label>
      ) : null}

      {component.type === 'D_FLIP_FLOP' || component.type === 'JK_FLIP_FLOP' || component.type === 'T_FLIP_FLOP' ? (
        <label className="logic-field">
          <span>Clock edge</span>
          <select value={component.params.edge ?? 'rising'} onChange={(event) => onUpdateParams(component.id, { edge: event.target.value as 'rising' | 'falling' })}>
            <option value="rising">Rising edge</option>
            <option value="falling">Falling edge</option>
          </select>
        </label>
      ) : null}

      {component.type === 'D_FLIP_FLOP' || component.type === 'JK_FLIP_FLOP' || component.type === 'T_FLIP_FLOP' || component.type === 'SR_LATCH' ? (
        <label className="logic-field">
          <span>{component.type === 'SR_LATCH' ? 'S / R polarity' : 'SET / RST polarity'}</span>
          <select value={component.params.activeHigh === false ? 'low' : 'high'} onChange={(event) => onUpdateParams(component.id, { activeHigh: event.target.value !== 'low' })}>
            <option value="high">Active high</option>
            <option value="low">Active low</option>
          </select>
        </label>
      ) : null}
    </div>
  );
}

function MetadataInspector({ document: doc, onUpdateMetadata, onSetTheme }: { document: LogicDocument; onUpdateMetadata: LogicInspectorProps['onUpdateMetadata']; onSetTheme: LogicInspectorProps['onSetTheme'] }) {
  return (
    <div>
      <h3>Project metadata</h3>
      <p className="logic-inspector-hint">Select a component to edit its properties, or fill in these fields for export.</p>
      <label className="logic-field">
        <span>Title</span>
        <input type="text" value={doc.metadata.title} onChange={(event) => onUpdateMetadata({ title: event.target.value })} />
      </label>
      <label className="logic-field">
        <span>Author</span>
        <input type="text" value={doc.metadata.author} onChange={(event) => onUpdateMetadata({ author: event.target.value })} />
      </label>
      <label className="logic-field">
        <span>Description</span>
        <textarea value={doc.metadata.description} onChange={(event) => onUpdateMetadata({ description: event.target.value })} rows={3} />
      </label>
      <label className="logic-field">
        <span>Version</span>
        <input type="text" value={doc.metadata.version} onChange={(event) => onUpdateMetadata({ version: event.target.value })} />
      </label>
      <label className="logic-field">
        <span>License</span>
        <select value={doc.metadata.license} onChange={(event) => onUpdateMetadata({ license: event.target.value as LicenseOption })}>
          {LICENSES.map((license) => <option key={license} value={license}>{license}</option>)}
        </select>
      </label>
      <label className="logic-field">
        <span>Theme</span>
        <select value={doc.theme} onChange={(event) => onSetTheme(event.target.value as ThemeName)}>
          {THEMES.map((theme) => <option key={theme.value} value={theme.value}>{theme.label}</option>)}
        </select>
      </label>
    </div>
  );
}
