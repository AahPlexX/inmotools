import { blockSizeLabel, hasSelectableSize, isBlockType, MAX_SELECT_BITS, MIN_SELECT_BITS, selectBitsOf, supportsEnable, type BlockType } from './block-engine';
import { ALU_OPERATION_HELP, ALU_OPERATIONS, ALU_WIDTHS, aluSizeLabel, aluWidthOf } from './alu-engine';
import { clampBusWidth, clampSignalWidth, MAX_BUS_WIDTH, MIN_BUS_WIDTH } from './bus-engine';
import { clampInputCount, isVariadicGate, paletteLabel } from './component-library';
import { isDisplayType } from './display-engine';
import { SUBCIRCUIT_ICONS } from './subcircuit-engine';
import { isPortMarker, markerWidthOf, MAX_ICON_LENGTH, MAX_NAME_LENGTH, subcircuitPorts } from './subcircuit-ports';
import { clampMatrixSize, isMatrixType, MATRIX_SIZES, matrixSizeLabel } from './matrix-engine';
import { addressBitsOf, DATA_WIDTHS, dataBitsOf, fillOf, formatWord, formatWordCount, isMemoryType, MAX_ADDRESS_BITS, MIN_ADDRESS_BITS, parseHexWord, wordCount } from './memory-engine';
import { bitWidthOf, isRegisterType, MAX_BIT_WIDTH, MIN_BIT_WIDTH, registerSizeLabel } from './register-engine';
import type { ComponentInstance, LicenseOption, LogicDocument, ThemeName } from './logic-types';

const LICENSES: readonly LicenseOption[] = ['MIT', 'CERN-OHL-P-2.0', 'CC-BY-4.0', 'CC-BY-SA-4.0', 'Unlicensed'];
const THEMES: readonly { readonly value: ThemeName; readonly label: string }[] = [
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'OLED dark' },
  { value: 'high-contrast', label: 'High contrast' },
  { value: 'color-vision-safe', label: 'Color-vision safe' },
  { value: 'junior-explorer', label: 'Junior Explorer' },
];

export interface LogicInspectorProps {
  readonly document: LogicDocument;
  readonly onRelabel: (id: string, label: string) => void;
  readonly onUpdateParams: (id: string, params: Partial<ComponentInstance['params']>) => void;
  readonly onUpdateMetadata: (metadata: Partial<LogicDocument['metadata']>) => void;
  readonly onSetTheme: (theme: ThemeName) => void;
  /** Opens the memory editor on one RAM or ROM. */
  readonly onOpenMemoryEditor: (componentId: string) => void;
  /** Opens a subcircuit part to edit the circuit inside it. */
  readonly onOpenSubcircuit: (componentId: string) => void;
  readonly onRenameSubcircuit: (componentId: string, name: string) => void;
  readonly onSetSubcircuitIcon: (componentId: string, icon: string) => void;
  readonly onRelabelPort: (componentId: string, portId: string, label: string) => void;
}

export function LogicInspector({ document: doc, onRelabel, onUpdateParams, onUpdateMetadata, onSetTheme, onOpenMemoryEditor, onOpenSubcircuit, onRenameSubcircuit, onSetSubcircuitIcon, onRelabelPort }: LogicInspectorProps) {
  const selected = doc.selectedIds.length === 1 ? doc.components.find((component) => component.id === doc.selectedIds[0]) : undefined;

  return (
    <aside className="logic-inspector" data-testid="logic-inspector" aria-label="Component inspector">
      {selected ? (
        <ComponentInspector component={selected} onRelabel={onRelabel} onUpdateParams={onUpdateParams} onOpenMemoryEditor={onOpenMemoryEditor} onOpenSubcircuit={onOpenSubcircuit} onRenameSubcircuit={onRenameSubcircuit} onSetSubcircuitIcon={onSetSubcircuitIcon} onRelabelPort={onRelabelPort} />
      ) : doc.selectedIds.length > 1 ? (
        <p className="logic-inspector-hint">{doc.selectedIds.length} components selected. Right-click for group actions.</p>
      ) : (
        <MetadataInspector document={doc} onUpdateMetadata={onUpdateMetadata} onSetTheme={onSetTheme} />
      )}
    </aside>
  );
}

function ComponentInspector({ component, onRelabel, onUpdateParams, onOpenMemoryEditor, onOpenSubcircuit, onRenameSubcircuit, onSetSubcircuitIcon, onRelabelPort }: Pick<LogicInspectorProps, 'onRelabel' | 'onUpdateParams' | 'onOpenMemoryEditor' | 'onOpenSubcircuit' | 'onRenameSubcircuit' | 'onSetSubcircuitIcon' | 'onRelabelPort'> & { component: ComponentInstance }) {
  return (
    <div>
      <h3>{paletteLabel(component.type)}</h3>
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

      {component.type === 'BUS_SPLITTER' ? (
        <label className="logic-field">
          <span>Bus width</span>
          <select value={clampBusWidth(component.params.busWidth)} onChange={(event) => onUpdateParams(component.id, { busWidth: Number(event.target.value) })}>
            {Array.from({ length: MAX_BUS_WIDTH - MIN_BUS_WIDTH + 1 }, (_, index) => MIN_BUS_WIDTH + index).map((bits) => (
              <option key={bits} value={bits}>{bits} bits</option>
            ))}
          </select>
        </label>
      ) : null}

      {component.type === 'ALU' ? (
        <>
          <label className="logic-field">
            <span>Operand width</span>
            <select value={aluWidthOf(component.params)} onChange={(event) => onUpdateParams(component.id, { aluWidth: Number(event.target.value) })}>
              {ALU_WIDTHS.map((bits) => (
                <option key={bits} value={bits}>{aluSizeLabel(bits)}</option>
              ))}
            </select>
          </label>
          <dl className="logic-alu-operations" aria-label="Operation codes (OP2 OP1 OP0)">
            {ALU_OPERATIONS.map((operation, code) => (
              <div key={operation}>
                <dt>{code.toString(2).padStart(3, '0')} {operation}</dt>
                <dd>{ALU_OPERATION_HELP[operation]}</dd>
              </div>
            ))}
          </dl>
          <p className="logic-inspector-hint">EQ, LT, and GT compare A with B (unsigned) whatever the operation is.</p>
        </>
      ) : null}

      {isMemoryType(component.type) ? (
        <>
          <label className="logic-field">
            <span>Address width</span>
            <select value={addressBitsOf(component.params)} onChange={(event) => onUpdateParams(component.id, { addressBits: Number(event.target.value) })}>
              {Array.from({ length: MAX_ADDRESS_BITS - MIN_ADDRESS_BITS + 1 }, (_, index) => MIN_ADDRESS_BITS + index).map((bits) => (
                <option key={bits} value={bits}>{bits}-bit ({formatWordCount(wordCount(bits))} words)</option>
              ))}
            </select>
          </label>
          <label className="logic-field">
            <span>Word width</span>
            <select value={dataBitsOf(component.params)} onChange={(event) => onUpdateParams(component.id, { dataBits: Number(event.target.value) })}>
              {DATA_WIDTHS.map((bits) => (
                <option key={bits} value={bits}>{bits}-bit words</option>
              ))}
            </select>
          </label>
          <label className="logic-field">
            <span>Fill value (hex, every unwritten word)</span>
            <input
              key={`${component.id}-${dataBitsOf(component.params)}-${fillOf(component.params)}`}
              type="text"
              inputMode="text"
              spellCheck={false}
              defaultValue={formatWord(fillOf(component.params), dataBitsOf(component.params))}
              onBlur={(event) => {
                const parsed = parseHexWord(event.target.value, dataBitsOf(component.params));
                if (parsed === undefined) event.target.value = formatWord(fillOf(component.params), dataBitsOf(component.params));
                else onUpdateParams(component.id, { memoryFill: parsed });
              }}
            />
          </label>
          <label className="logic-field logic-field-inline">
            <input type="checkbox" checked={component.params.hasEnable === true} onChange={(event) => onUpdateParams(component.id, { hasEnable: event.target.checked })} />
            <span>Output enable (OE) pin</span>
          </label>
          {component.type === 'RAM' ? (
            <label className="logic-field">
              <span>Write clock edge</span>
              <select value={component.params.edge ?? 'rising'} onChange={(event) => onUpdateParams(component.id, { edge: event.target.value as 'rising' | 'falling' })}>
                <option value="rising">Rising edge</option>
                <option value="falling">Falling edge</option>
              </select>
            </label>
          ) : null}
          <label className="logic-field">
            <span>{component.type === 'RAM' ? 'WE / OE polarity' : 'OE polarity'}</span>
            <select value={component.params.activeHigh === false ? 'low' : 'high'} onChange={(event) => onUpdateParams(component.id, { activeHigh: event.target.value !== 'low' })}>
              <option value="high">Active high</option>
              <option value="low">Active low</option>
            </select>
          </label>
          <button type="button" className="logic-inspector-action" onClick={() => onOpenMemoryEditor(component.id)}>Open memory editor</button>
        </>
      ) : null}

      {isRegisterType(component.type) ? (
        <>
          <label className="logic-field logic-field-inline">
            <input type="checkbox" checked={component.params.busPins === true} onChange={(event) => onUpdateParams(component.id, { busPins: event.target.checked })} />
            <span>Bus pins (D and Q as single buses)</span>
          </label>
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

      {component.type === 'SUBCIRCUIT' && component.params.subcircuit ? (
        <>
          <label className="logic-field">
            <span>Subcircuit name</span>
            <input type="text" maxLength={MAX_NAME_LENGTH} value={component.params.subcircuit.name} onChange={(event) => onRenameSubcircuit(component.id, event.target.value)} />
          </label>
          <label className="logic-field">
            <span>Icon (up to {MAX_ICON_LENGTH} characters)</span>
            <input type="text" maxLength={MAX_ICON_LENGTH * 2} value={component.params.subcircuit.icon} onChange={(event) => onSetSubcircuitIcon(component.id, event.target.value)} />
          </label>
          <div className="logic-icon-presets" role="group" aria-label="Icon presets">
            {SUBCIRCUIT_ICONS.map((icon) => (
              <button key={icon} type="button" aria-label={`Use icon ${icon}`} aria-pressed={component.params.subcircuit?.icon === icon} onClick={() => onSetSubcircuitIcon(component.id, icon)}>{icon}</button>
            ))}
          </div>
          <fieldset className="logic-port-list">
            <legend>Ports</legend>
            {subcircuitPorts(component.params).map((port) => (
              <label key={port.id} className="logic-field logic-field-inline">
                <span>{port.direction === 'input' ? 'In' : 'Out'}</span>
                <input
                  type="text"
                  maxLength={MAX_NAME_LENGTH}
                  aria-label={`${port.direction === 'input' ? 'Input' : 'Output'} port name`}
                  value={component.params.subcircuit?.components.find((marker) => marker.id === port.id)?.label ?? port.label}
                  onChange={(event) => onRelabelPort(component.id, port.id, event.target.value)}
                />
              </label>
            ))}
          </fieldset>
          <button type="button" className="logic-inspector-action" onClick={() => onOpenSubcircuit(component.id)}>Open subcircuit</button>
          <p className="logic-inspector-hint">Double-click the part to open it. Ports are the input and output port markers inside; add or remove them there.</p>
        </>
      ) : null}

      {isPortMarker(component.type) ? (
        <>
          <label className="logic-field">
            <span>Signal width</span>
            <select value={markerWidthOf(component.params)} onChange={(event) => onUpdateParams(component.id, { signalWidth: clampSignalWidth(Number(event.target.value)) })}>
              <option value={1}>1 bit (single signal)</option>
              {Array.from({ length: MAX_BUS_WIDTH - 1 }, (_, index) => index + 2).map((bits) => (
                <option key={bits} value={bits}>{bits}-bit bus</option>
              ))}
            </select>
          </label>
          {component.type === 'PORT_IN' && markerWidthOf(component.params) > 1 ? (
            <label className="logic-field">
              <span>Test value (decimal, used only outside a subcircuit)</span>
              <input type="number" min={0} step={1} value={component.params.portValue ?? 0} onChange={(event) => onUpdateParams(component.id, { portValue: Math.max(0, Math.trunc(Number(event.target.value) || 0)) })} />
            </label>
          ) : null}
          <p className="logic-inspector-hint">A port is where a subcircuit connects to the circuit that uses it. Its name is shown on the subcircuit's pin.</p>
        </>
      ) : null}

      {isMatrixType(component.type) ? (
        <>
          <label className="logic-field">
            <span>Matrix size</span>
            <select value={clampMatrixSize(component.params.matrixSize)} onChange={(event) => onUpdateParams(component.id, { matrixSize: Number(event.target.value) })}>
              {MATRIX_SIZES.map((size) => (
                <option key={size} value={size}>{matrixSizeLabel(size)}</option>
              ))}
            </select>
          </label>
          <label className="logic-field">
            <span>Row and column polarity</span>
            <select value={component.params.activeHigh === false ? 'low' : 'high'} onChange={(event) => onUpdateParams(component.id, { activeHigh: event.target.value !== 'low' })}>
              <option value="high">Active high</option>
              <option value="low">Active low</option>
            </select>
          </label>
          <p className="logic-inspector-hint">A pixel lights where an asserted column crosses the selected row, in the color the R, G and B pins show. It keeps its state until its row is selected again, so scanning rows in turn draws a steady picture.</p>
        </>
      ) : null}

      {isDisplayType(component.type) ? (
        <>
          <label className="logic-field">
            <span>Segment polarity</span>
            <select value={component.params.activeHigh === false ? 'low' : 'high'} onChange={(event) => onUpdateParams(component.id, { activeHigh: event.target.value !== 'low' })}>
              <option value="high">Active high (common cathode)</option>
              <option value="low">Active low (common anode)</option>
            </select>
          </label>
          {component.type === 'SEVEN_SEGMENT_4' ? (
            <label className="logic-field">
              <span>Digit-select polarity</span>
              <select value={component.params.digitActiveHigh === false ? 'low' : 'high'} onChange={(event) => onUpdateParams(component.id, { digitActiveHigh: event.target.value !== 'low' })}>
                <option value="high">Active high</option>
                <option value="low">Active low</option>
              </select>
            </label>
          ) : null}
        </>
      ) : null}

      {component.type !== 'SWITCH' && component.type !== 'PUSH_BUTTON' && component.type !== 'LED' && component.type !== 'PROBE' && component.type !== 'CLOCK' && component.type !== 'BUS_SPLITTER' && !isRegisterType(component.type) && !isDisplayType(component.type) && !isMatrixType(component.type) && component.type !== 'SUBCIRCUIT' && !isPortMarker(component.type) ? (
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
