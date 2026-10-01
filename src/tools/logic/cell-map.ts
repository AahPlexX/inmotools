import { aluWidthOf } from './alu-engine';
import { hasEnablePin as blockHasEnable, selectBitsOf, type BlockType } from './block-engine';
import type { ComponentParams } from './logic-types';
import { addressBitsOf, dataBitsOf, fillOf, hasOutputEnable, wordCount } from './memory-engine';
import type { NetlistPart } from './netlist-engine';
import { bitWidthOf, hasEnablePin as registerHasEnable, hasLoadPin } from './register-engine';

/**
 * How each part of the workstation maps onto a cell of the generated HDL
 * library: which cell, its generics, and which of the part's pins go to which
 * port of the cell. Both HDL exporters are written against this description,
 * so a part is wired identically in Verilog and VHDL.
 */

export interface CellPort {
  /** The port's name on the cell. */
  readonly name: string;
  readonly direction: 'input' | 'output';
  /** The part's pins to connect, least significant bit first. `null` ties that bit off (high-impedance) because the part has no such pin. */
  readonly pins: readonly (string | null)[];
  /** A port written as a vector even when it is one bit wide (a gate's input list). */
  readonly vector: boolean;
}

export interface CellUse {
  /** The cell's name; a memory gets a module of its own that holds its contents. */
  readonly cell: string;
  readonly generics: Readonly<Record<string, number>>;
  readonly ports: readonly CellPort[];
  /** A one-off module for this part, in each language, when the cell cannot be shared (a memory with its contents). */
  readonly inline?: { readonly verilog: string; readonly vhdl: string };
  /** What an exporter must tell the person about how this part is represented. */
  readonly notes: readonly string[];
}

const range = (count: number): number[] => Array.from({ length: count }, (_, index) => index);
const pinsNamed = (prefix: string, count: number): string[] => range(count).map((index) => `${prefix}${index}`);
const scalar = (name: string, direction: 'input' | 'output', pin: string | null): CellPort => ({ name, direction, pins: [pin], vector: false });
const bus = (name: string, direction: 'input' | 'output', pins: readonly (string | null)[]): CellPort => ({ name, direction, pins, vector: true });
const flag = (value: boolean): number => (value ? 1 : 0);
const has = (part: NetlistPart, pin: string): string | null => (part.pins.some((candidate) => candidate.id === pin) ? pin : null);

const GATE_CELLS: Readonly<Record<string, string>> = { AND: 'lw_and', OR: 'lw_or', NAND: 'lw_nand', NOR: 'lw_nor', XOR: 'lw_xor', XNOR: 'lw_xnor' };

export const GATE_CELL_NAMES: readonly string[] = [...Object.values(GATE_CELLS), 'lw_not', 'lw_buf', 'lw_tribuf'];

// --- SECTION: memory modules ---

/** The most words a RAM the exporter writes may hold; a larger array is not something a tool or a chip can hold. */
export const MAX_EXPORT_RAM_ADDRESS_BITS = 20;

const binaryLiteral = (value: number, width: number): string => value.toString(2).padStart(width, '0');
const hexLiteral = (value: number, width: number): string => `${width}'h${value.toString(16)}`;

const sortedCells = (params: ComponentParams): [number, number][] =>
  Object.entries(params.memoryCells ?? {}).map(([address, value]) => [Number(address), value] as [number, number]).sort((a, b) => a[0] - b[0]);

const romVerilog = (name: string, params: ComponentParams): string => {
  const addressBits = addressBitsOf(params);
  const dataBits = dataBitsOf(params);
  const activeHigh = params.activeHigh !== false;
  const cases = sortedCells(params).map(([address, value]) => `      ${hexLiteral(address, addressBits)}: word = ${hexLiteral(value, dataBits)};`).join('\n');
  return [
    `module ${name} (`,
    `  input [${addressBits - 1}:0] addr,`,
    `  input oe,`,
    `  output [${dataBits - 1}:0] dout`,
    `);`,
    `  reg [${dataBits - 1}:0] word;`,
    `  wire enabled = ${hasOutputEnable(params) ? (activeHigh ? 'oe' : '~oe') : "1'b1"};`,
    `  always @* begin`,
    `    case (addr)`,
    ...(cases ? [cases] : []),
    `      default: word = ${hexLiteral(fillOf(params), dataBits)};`,
    `    endcase`,
    `  end`,
    `  // An unknown address gives unknown data; a released output enable gives high impedance.`,
    `  assign dout = (^addr === 1'bx) ? {${dataBits}{1'bx}} : (enabled === 1'b1) ? word : (enabled === 1'b0) ? {${dataBits}{1'bz}} : {${dataBits}{1'bx}};`,
    `endmodule`,
  ].join('\n');
};

const romVhdl = (name: string, params: ComponentParams): string => {
  const addressBits = addressBitsOf(params);
  const dataBits = dataBitsOf(params);
  const activeHigh = params.activeHigh !== false;
  const cases = sortedCells(params).map(([address, value]) => `        when "${binaryLiteral(address, addressBits)}" => word := "${binaryLiteral(value, dataBits)}";`).join('\n');
  return [
    `library ieee;`,
    `use ieee.std_logic_1164.all;`,
    ``,
    `entity ${name} is`,
    `  port (`,
    `    addr : in std_logic_vector(${addressBits - 1} downto 0);`,
    `    oe   : in std_logic;`,
    `    dout : out std_logic_vector(${dataBits - 1} downto 0)`,
    `  );`,
    `end entity ${name};`,
    ``,
    `architecture rtl of ${name} is`,
    `begin`,
    `  process (addr, oe)`,
    `    variable word : std_logic_vector(${dataBits - 1} downto 0);`,
    `    variable enabled : std_logic;`,
    `  begin`,
    `    if (${range(addressBits).map((index) => `(addr(${index}) = '0' or addr(${index}) = '1')`).join(' and ')}) then`,
    `      case addr is`,
    ...(cases ? [cases] : []),
    `        when others => word := "${binaryLiteral(fillOf(params), dataBits)}";`,
    `      end case;`,
    `      ${hasOutputEnable(params) ? `enabled := ${activeHigh ? 'oe' : 'not oe'};` : `enabled := '1';`}`,
    `      if enabled = '1' then`,
    `        dout <= word;`,
    `      elsif enabled = '0' then`,
    `        dout <= (others => 'Z');`,
    `      else`,
    `        dout <= (others => 'X');`,
    `      end if;`,
    `    else`,
    `      dout <= (others => 'X');`,
    `    end if;`,
    `  end process;`,
    `end architecture rtl;`,
  ].join('\n');
};

const ramVerilog = (name: string, params: ComponentParams): string => {
  const addressBits = addressBitsOf(params);
  const dataBits = dataBitsOf(params);
  const activeHigh = params.activeHigh !== false;
  const falling = params.edge === 'falling';
  const fill = fillOf(params);
  const stores = sortedCells(params).map(([address, value]) => `    mem[${hexLiteral(address, addressBits)}] = ${hexLiteral(value, dataBits)};`).join('\n');
  return [
    `module ${name} (`,
    `  input [${addressBits - 1}:0] addr,`,
    `  input [${dataBits - 1}:0] din,`,
    `  input clk,`,
    `  input we,`,
    `  input oe,`,
    `  output [${dataBits - 1}:0] dout`,
    `);`,
    `  reg [${dataBits - 1}:0] mem [0:${wordCount(addressBits) - 1}];`,
    `  integer i;`,
    `  initial begin`,
    `    for (i = 0; i < ${wordCount(addressBits)}; i = i + 1) mem[i] = ${hexLiteral(fill, dataBits)};`,
    ...(stores ? [stores] : []),
    `  end`,
    `  wire clk_e = ${falling ? '~clk' : 'clk'};`,
    `  wire we_a = ${activeHigh ? 'we' : '~we'};`,
    `  wire enabled = ${hasOutputEnable(params) ? (activeHigh ? 'oe' : '~oe') : "1'b1"};`,
    `  // A write needs a known address, data and write enable at the clock edge; otherwise nothing is written.`,
    `  always @(posedge clk_e) begin`,
    `    if (we_a === 1'b1 && ^addr !== 1'bx && ^din !== 1'bx) mem[addr] <= din;`,
    `  end`,
    `  assign dout = (^addr === 1'bx) ? {${dataBits}{1'bx}} : (enabled === 1'b1) ? mem[addr] : (enabled === 1'b0) ? {${dataBits}{1'bz}} : {${dataBits}{1'bx}};`,
    `endmodule`,
  ].join('\n');
};

const ramVhdl = (name: string, params: ComponentParams): string => {
  const addressBits = addressBitsOf(params);
  const dataBits = dataBitsOf(params);
  const activeHigh = params.activeHigh !== false;
  const falling = params.edge === 'falling';
  const fill = fillOf(params);
  const stores = sortedCells(params).map(([address, value]) => `    m(${address}) := "${binaryLiteral(value, dataBits)}";`).join('\n');
  return [
    `library ieee;`,
    `use ieee.std_logic_1164.all;`,
    `use ieee.numeric_std.all;`,
    ``,
    `entity ${name} is`,
    `  port (`,
    `    addr : in std_logic_vector(${addressBits - 1} downto 0);`,
    `    din  : in std_logic_vector(${dataBits - 1} downto 0);`,
    `    clk  : in std_logic;`,
    `    we   : in std_logic;`,
    `    oe   : in std_logic;`,
    `    dout : out std_logic_vector(${dataBits - 1} downto 0)`,
    `  );`,
    `end entity ${name};`,
    ``,
    `architecture rtl of ${name} is`,
    `  type memory_t is array (0 to ${wordCount(addressBits) - 1}) of std_logic_vector(${dataBits - 1} downto 0);`,
    `  impure function initial_contents return memory_t is`,
    `    variable m : memory_t := (others => "${binaryLiteral(fill, dataBits)}");`,
    `  begin`,
    ...(stores ? [stores] : []),
    `    return m;`,
    `  end function;`,
    `  signal mem : memory_t := initial_contents;`,
    `  function known (v : std_logic_vector) return boolean is`,
    `  begin`,
    `    for k in v'range loop`,
    `      if v(k) /= '0' and v(k) /= '1' then return false; end if;`,
    `    end loop;`,
    `    return true;`,
    `  end function;`,
    `  signal clk_e, we_a, enabled : std_logic;`,
    `begin`,
    `  clk_e   <= ${falling ? 'not clk' : 'clk'};`,
    `  we_a    <= ${activeHigh ? 'we' : 'not we'};`,
    `  enabled <= ${hasOutputEnable(params) ? (activeHigh ? 'oe' : 'not oe') : "'1'"};`,
    `  -- A write needs a known address, data and write enable at the clock edge; otherwise nothing is written.`,
    `  process (clk_e)`,
    `  begin`,
    `    if rising_edge(clk_e) then`,
    `      if we_a = '1' and known(addr) and known(din) then`,
    `        mem(to_integer(unsigned(addr))) <= din;`,
    `      end if;`,
    `    end if;`,
    `  end process;`,
    `  process (addr, enabled, mem)`,
    `  begin`,
    `    if not known(addr) then`,
    `      dout <= (others => 'X');`,
    `    elsif enabled = '1' then`,
    `      dout <= mem(to_integer(unsigned(addr)));`,
    `    elsif enabled = '0' then`,
    `      dout <= (others => 'Z');`,
    `    else`,
    `      dout <= (others => 'X');`,
    `    end if;`,
    `  end process;`,
    `end architecture rtl;`,
  ].join('\n');
};

// --- SECTION: the map ---

/**
 * The cell for a part, or `undefined` for a part that is not part of the exported logic: sources and sinks
 * become the module's ports, and display parts have no logic at all. `error` explains a part that cannot be
 * exported at all.
 */
export const cellFor = (part: NetlistPart): { readonly use: CellUse } | { readonly error: string } | undefined => {
  const params = part.params;
  const inputs = part.pins.filter((pin) => pin.direction === 'input').map((pin) => pin.id);

  switch (part.type) {
    case 'AND': case 'OR': case 'NAND': case 'NOR': case 'XOR': case 'XNOR':
      return { use: { cell: GATE_CELLS[part.type]!, generics: { N: inputs.length }, ports: [bus('a', 'input', inputs), scalar('y', 'output', 'Y')], notes: [] } };
    case 'NOT':
      return { use: { cell: 'lw_not', generics: {}, ports: [scalar('a', 'input', 'A'), scalar('y', 'output', 'Y')], notes: [] } };
    case 'BUFFER':
      return { use: { cell: 'lw_buf', generics: {}, ports: [scalar('a', 'input', 'A'), scalar('y', 'output', 'Y')], notes: [] } };
    case 'TRI_BUFFER':
      return { use: { cell: 'lw_tribuf', generics: {}, ports: [scalar('a', 'input', 'A'), scalar('en', 'input', 'EN'), scalar('y', 'output', 'Y')], notes: [] } };
    case 'D_FLIP_FLOP':
      return { use: { cell: 'lw_dff', generics: { FALLING: flag(params.edge === 'falling'), ACTIVE_HIGH: flag(params.activeHigh !== false) }, ports: [scalar('clk', 'input', 'CLK'), scalar('d', 'input', 'D'), scalar('set', 'input', 'SET'), scalar('rst', 'input', 'RST'), scalar('q', 'output', 'Q'), scalar('qn', 'output', 'QN')], notes: [] } };
    case 'JK_FLIP_FLOP':
      return { use: { cell: 'lw_jkff', generics: { FALLING: flag(params.edge === 'falling'), ACTIVE_HIGH: flag(params.activeHigh !== false) }, ports: [scalar('clk', 'input', 'CLK'), scalar('j', 'input', 'J'), scalar('k', 'input', 'K'), scalar('set', 'input', 'SET'), scalar('rst', 'input', 'RST'), scalar('q', 'output', 'Q'), scalar('qn', 'output', 'QN')], notes: [] } };
    case 'T_FLIP_FLOP':
      return { use: { cell: 'lw_tff', generics: { FALLING: flag(params.edge === 'falling'), ACTIVE_HIGH: flag(params.activeHigh !== false) }, ports: [scalar('clk', 'input', 'CLK'), scalar('t', 'input', 'T'), scalar('set', 'input', 'SET'), scalar('rst', 'input', 'RST'), scalar('q', 'output', 'Q'), scalar('qn', 'output', 'QN')], notes: [] } };
    case 'SR_LATCH':
      return { use: { cell: 'lw_srlatch', generics: { ACTIVE_HIGH: flag(params.activeHigh !== false) }, ports: [scalar('s', 'input', 'S'), scalar('r', 'input', 'R'), scalar('q', 'output', 'Q'), scalar('qn', 'output', 'QN')], notes: [] } };
    case 'MUX': {
      const select = selectBitsOf(part.type as BlockType, params);
      return { use: { cell: 'lw_mux', generics: { SEL: select, HAS_EN: flag(blockHasEnable(part.type as BlockType, params)) }, ports: [bus('d', 'input', pinsNamed('D', 1 << select)), bus('s', 'input', pinsNamed('S', select)), scalar('en', 'input', has(part, 'EN')), scalar('y', 'output', 'Y')], notes: [] } };
    }
    case 'DEMUX': {
      const select = selectBitsOf(part.type as BlockType, params);
      return { use: { cell: 'lw_demux', generics: { SEL: select, HAS_EN: flag(blockHasEnable(part.type as BlockType, params)) }, ports: [scalar('d', 'input', 'D'), bus('s', 'input', pinsNamed('S', select)), scalar('en', 'input', has(part, 'EN')), bus('y', 'output', pinsNamed('Y', 1 << select))], notes: [] } };
    }
    case 'DECODER': {
      const select = selectBitsOf(part.type as BlockType, params);
      return { use: { cell: 'lw_decoder', generics: { SEL: select, HAS_EN: flag(blockHasEnable(part.type as BlockType, params)), ACTIVE_HIGH: flag(params.activeHigh !== false) }, ports: [bus('a', 'input', pinsNamed('A', select)), scalar('en', 'input', has(part, 'EN')), bus('y', 'output', pinsNamed('Y', 1 << select))], notes: [] } };
    }
    case 'PRIORITY_ENCODER': {
      const bits = selectBitsOf(part.type as BlockType, params);
      return { use: { cell: 'lw_prienc', generics: { BITS: bits }, ports: [bus('i', 'input', pinsNamed('I', 1 << bits)), bus('y', 'output', pinsNamed('Y', bits)), scalar('v', 'output', 'V')], notes: [] } };
    }
    case 'BCD_7SEG':
      return { use: { cell: 'lw_bcd7seg', generics: { HAS_EN: flag(blockHasEnable(part.type as BlockType, params)), ACTIVE_HIGH: flag(params.activeHigh !== false) }, ports: [bus('d', 'input', pinsNamed('D', 4)), scalar('en', 'input', has(part, 'EN')), bus('seg', 'output', ['A', 'B', 'C', 'D', 'E', 'F', 'G'])], notes: [] } };
    case 'COUNTER': {
      const width = bitWidthOf(params);
      const loads = hasLoadPin('COUNTER', params);
      return {
        use: {
          cell: 'lw_counter',
          generics: { WIDTH: width, DOWN: flag(params.countDown === true), HAS_LOAD: flag(loads), HAS_EN: flag(registerHasEnable(params)), FALLING: flag(params.edge === 'falling'), ACTIVE_HIGH: flag(params.activeHigh !== false) },
          ports: [scalar('clk', 'input', 'CLK'), scalar('en', 'input', has(part, 'EN')), scalar('rst', 'input', 'RST'), scalar('load', 'input', has(part, 'LOAD')), bus('d', 'input', loads ? pinsNamed('D', width) : range(width).map(() => null)), bus('q', 'output', pinsNamed('Q', width)), scalar('tc', 'output', 'TC')],
          notes: params.asyncRipple === true ? ['An asynchronous ripple counter is exported as a synchronous counter: HDL cells have no delay between bits.'] : [],
        },
      };
    }
    case 'REGISTER': {
      const width = bitWidthOf(params);
      return { use: { cell: 'lw_register', generics: { WIDTH: width, HAS_EN: flag(registerHasEnable(params)), FALLING: flag(params.edge === 'falling'), ACTIVE_HIGH: flag(params.activeHigh !== false) }, ports: [scalar('clk', 'input', 'CLK'), scalar('en', 'input', has(part, 'EN')), scalar('rst', 'input', 'RST'), bus('d', 'input', pinsNamed('D', width)), bus('q', 'output', pinsNamed('Q', width))], notes: [] } };
    }
    case 'ALU': {
      const width = aluWidthOf(params);
      return { use: { cell: 'lw_alu', generics: { W: width }, ports: [bus('a', 'input', pinsNamed('A', width)), bus('b', 'input', pinsNamed('B', width)), bus('op', 'input', ['OP0', 'OP1', 'OP2']), scalar('cin', 'input', 'CIN'), bus('y', 'output', pinsNamed('Y', width)), scalar('cout', 'output', 'COUT'), scalar('z', 'output', 'Z'), scalar('n', 'output', 'N'), scalar('v', 'output', 'V'), scalar('eq', 'output', 'EQ'), scalar('lt', 'output', 'LT'), scalar('gt', 'output', 'GT')], notes: [] } };
    }
    case 'ROM': {
      const addressBits = addressBitsOf(params);
      const name = `lw_rom_${part.ref.toLowerCase()}`;
      return { use: { cell: name, generics: {}, ports: [bus('addr', 'input', pinsNamed('ADDR', addressBits)), scalar('oe', 'input', has(part, 'OE')), bus('dout', 'output', pinsNamed('DOUT', dataBitsOf(params)))], inline: { verilog: romVerilog(name, params), vhdl: romVhdl(name, params) }, notes: [] } };
    }
    case 'RAM': {
      const addressBits = addressBitsOf(params);
      if (addressBits > MAX_EXPORT_RAM_ADDRESS_BITS) return { error: `${part.ref} (${part.label}) is a RAM with a ${addressBits}-bit address space; the exporter writes RAMs up to ${MAX_EXPORT_RAM_ADDRESS_BITS} address bits (${(2 ** MAX_EXPORT_RAM_ADDRESS_BITS).toLocaleString('en-US')} words) and leaves this one out.` };
      const name = `lw_ram_${part.ref.toLowerCase()}`;
      return { use: { cell: name, generics: {}, ports: [bus('addr', 'input', pinsNamed('ADDR', addressBits)), bus('din', 'input', pinsNamed('DIN', dataBitsOf(params))), scalar('clk', 'input', 'CLK'), scalar('we', 'input', 'WE'), scalar('oe', 'input', has(part, 'OE')), bus('dout', 'output', pinsNamed('DOUT', dataBitsOf(params)))], inline: { verilog: ramVerilog(name, params), vhdl: ramVhdl(name, params) }, notes: [] } };
    }
    default:
      // Sources and sinks are the module's ports; displays and matrices only show signals the design already produces.
      return undefined;
  }
};

