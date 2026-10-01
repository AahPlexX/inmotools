/**
 * The behavioral cell library the exported HDL is written against: one module
 * (Verilog) or entity (VHDL) for every kind of part that is not a plain gate
 * primitive, with the same names, generics and ports in both languages.
 *
 * Only the cells a circuit uses are written into its file, so an export of a
 * few gates stays a few lines long. The behavior follows the workstation's own
 * simulator: asynchronous set and reset that override the clock, edge-clocked
 * storage that starts at 0, unknown values that stay unknown (a floating data
 * input is stored as unknown, never as a guess), and a write that cannot be
 * carried out is not carried out.
 */

// --- SECTION: Verilog ---

export const VERILOG_CELLS: Readonly<Record<string, string>> = {
  lw_dff: `module lw_dff #(parameter FALLING = 0, parameter ACTIVE_HIGH = 1) (
  input clk, input d, input set, input rst,
  output reg q, output qn
);
  wire clk_e = FALLING ? ~clk : clk;
  wire set_a = ACTIVE_HIGH ? set : ~set;
  wire rst_a = ACTIVE_HIGH ? rst : ~rst;
  initial q = 1'b0;
  // Set wins over reset, and both override the clock, as in the workstation.
  always @(posedge clk_e or posedge set_a or posedge rst_a) begin
    if (set_a === 1'b1) q <= 1'b1;
    else if (rst_a === 1'b1) q <= 1'b0;
    else q <= (d === 1'bz) ? 1'bx : d;
  end
  assign qn = ~q;
endmodule`,

  lw_jkff: `module lw_jkff #(parameter FALLING = 0, parameter ACTIVE_HIGH = 1) (
  input clk, input j, input k, input set, input rst,
  output reg q, output qn
);
  wire clk_e = FALLING ? ~clk : clk;
  wire set_a = ACTIVE_HIGH ? set : ~set;
  wire rst_a = ACTIVE_HIGH ? rst : ~rst;
  initial q = 1'b0;
  always @(posedge clk_e or posedge set_a or posedge rst_a) begin
    if (set_a === 1'b1) q <= 1'b1;
    else if (rst_a === 1'b1) q <= 1'b0;
    else case ({j, k})
      2'b11: q <= ~q;
      2'b10: q <= 1'b1;
      2'b01: q <= 1'b0;
      2'b00: q <= q;
      default: q <= 1'bx;
    endcase
  end
  assign qn = ~q;
endmodule`,

  lw_tff: `module lw_tff #(parameter FALLING = 0, parameter ACTIVE_HIGH = 1) (
  input clk, input t, input set, input rst,
  output reg q, output qn
);
  wire clk_e = FALLING ? ~clk : clk;
  wire set_a = ACTIVE_HIGH ? set : ~set;
  wire rst_a = ACTIVE_HIGH ? rst : ~rst;
  initial q = 1'b0;
  always @(posedge clk_e or posedge set_a or posedge rst_a) begin
    if (set_a === 1'b1) q <= 1'b1;
    else if (rst_a === 1'b1) q <= 1'b0;
    else if (t === 1'b1) q <= ~q;
    else if (t !== 1'b0) q <= 1'bx;
  end
  assign qn = ~q;
endmodule`,

  lw_srlatch: `module lw_srlatch #(parameter ACTIVE_HIGH = 1) (
  input s, input r,
  output reg q, output qn
);
  wire s_a = ACTIVE_HIGH ? s : ~s;
  wire r_a = ACTIVE_HIGH ? r : ~r;
  initial q = 1'b0;
  // Level-sensitive: both asserted is an invalid input and leaves the state unknown.
  always @* begin
    if (s_a === 1'b1 && r_a === 1'b1) q = 1'bx;
    else if (s_a === 1'b1) q = 1'b1;
    else if (r_a === 1'b1) q = 1'b0;
  end
  assign qn = ~q;
endmodule`,

  lw_mux: `module lw_mux #(parameter SEL = 2, parameter HAS_EN = 0) (
  input [(1<<SEL)-1:0] d, input [SEL-1:0] s, input en,
  output y
);
  wire v = d[s];
  assign y = HAS_EN ? (en & v) : v;
endmodule`,

  lw_demux: `module lw_demux #(parameter SEL = 2, parameter HAS_EN = 0) (
  input d, input [SEL-1:0] s, input en,
  output [(1<<SEL)-1:0] y
);
  wire data = HAS_EN ? (d & en) : d;
  genvar g;
  generate
    for (g = 0; g < (1<<SEL); g = g + 1) begin : lane
      assign y[g] = (s == g) ? data : 1'b0;
    end
  endgenerate
endmodule`,

  lw_decoder: `module lw_decoder #(parameter SEL = 2, parameter HAS_EN = 0, parameter ACTIVE_HIGH = 1) (
  input [SEL-1:0] a, input en,
  output [(1<<SEL)-1:0] y
);
  wire data = HAS_EN ? en : 1'b1;
  genvar g;
  generate
    for (g = 0; g < (1<<SEL); g = g + 1) begin : lane
      wire hot = (a == g) ? data : 1'b0;
      assign y[g] = ACTIVE_HIGH ? hot : ~hot;
    end
  endgenerate
endmodule`,

  lw_prienc: `module lw_prienc #(parameter BITS = 3) (
  input [(1<<BITS)-1:0] i,
  output reg [BITS-1:0] y, output reg v
);
  integer k;
  // The highest asserted request wins.
  always @* begin
    y = {BITS{1'b0}};
    v = 1'b0;
    for (k = 0; k < (1<<BITS); k = k + 1) begin
      if (i[k] === 1'b1) begin
        y = k;
        v = 1'b1;
      end
    end
  end
endmodule`,

  lw_bcd7seg: `module lw_bcd7seg #(parameter HAS_EN = 0, parameter ACTIVE_HIGH = 1) (
  input [3:0] d, input en,
  output [6:0] seg
);
  // seg[0] is segment A ... seg[6] is segment G; 1 means lit before the polarity is applied.
  reg [6:0] lit;
  always @* begin
    if (HAS_EN && en === 1'b0) lit = 7'b0000000;
    else if ((HAS_EN && en !== 1'b1) || (^d === 1'bx)) lit = 7'bxxxxxxx;
    else case (d)
      4'd0: lit = 7'b0111111;
      4'd1: lit = 7'b0000110;
      4'd2: lit = 7'b1011011;
      4'd3: lit = 7'b1001111;
      4'd4: lit = 7'b1100110;
      4'd5: lit = 7'b1101101;
      4'd6: lit = 7'b1111101;
      4'd7: lit = 7'b0000111;
      4'd8: lit = 7'b1111111;
      4'd9: lit = 7'b1101111;
      default: lit = 7'b0000000;
    endcase
  end
  assign seg = ACTIVE_HIGH ? lit : ~lit;
endmodule`,

  lw_counter: `module lw_counter #(parameter WIDTH = 4, parameter DOWN = 0, parameter HAS_LOAD = 0, parameter HAS_EN = 0, parameter FALLING = 0, parameter ACTIVE_HIGH = 1) (
  input clk, input en, input rst, input load, input [WIDTH-1:0] d,
  output reg [WIDTH-1:0] q, output tc
);
  wire clk_e = FALLING ? ~clk : clk;
  wire rst_a = ACTIVE_HIGH ? rst : ~rst;
  wire load_a = ACTIVE_HIGH ? load : ~load;
  initial q = {WIDTH{1'b0}};
  always @(posedge clk_e or posedge rst_a) begin
    if (rst_a === 1'b1) q <= {WIDTH{1'b0}};
    else if (HAS_EN && en !== 1'b1) begin
      if (en !== 1'b0) q <= {WIDTH{1'bx}};
    end
    else if (HAS_LOAD && load_a === 1'b1) q <= d;
    else q <= DOWN ? q - 1'b1 : q + 1'b1;
  end
  // Terminal count: all ones counting up, all zeros counting down.
  assign tc = (^q === 1'bx) ? 1'bx : (DOWN ? (q == {WIDTH{1'b0}}) : (q == {WIDTH{1'b1}}));
endmodule`,

  lw_register: `module lw_register #(parameter WIDTH = 4, parameter HAS_EN = 0, parameter FALLING = 0, parameter ACTIVE_HIGH = 1) (
  input clk, input en, input rst, input [WIDTH-1:0] d,
  output reg [WIDTH-1:0] q
);
  wire clk_e = FALLING ? ~clk : clk;
  wire rst_a = ACTIVE_HIGH ? rst : ~rst;
  initial q = {WIDTH{1'b0}};
  always @(posedge clk_e or posedge rst_a) begin
    if (rst_a === 1'b1) q <= {WIDTH{1'b0}};
    else if (HAS_EN && en !== 1'b1) begin
      if (en !== 1'b0) q <= {WIDTH{1'bx}};
    end
    else q <= d;
  end
endmodule`,

  lw_alu: `module lw_alu #(parameter W = 4) (
  input [W-1:0] a, input [W-1:0] b, input [2:0] op, input cin,
  output reg [W-1:0] y, output reg cout, output z, output n, output reg v,
  output eq, output lt, output gt
);
  localparam SH = $clog2(W);
  reg [W:0] wide;
  reg [SH-1:0] amount;
  // 0 add, 1 subtract, 2 and, 3 or, 4 xor, 5 shift left, 6 shift right, 7 arithmetic shift right.
  always @* begin
    wide = {(W+1){1'b0}};
    y = {W{1'b0}};
    cout = 1'b0;
    v = 1'b0;
    amount = b[SH-1:0];
    case (op)
      3'd0: begin
        wide = {1'b0, a} + {1'b0, b} + cin;
        y = wide[W-1:0];
        cout = wide[W];
        v = (a[W-1] == b[W-1]) && (y[W-1] != a[W-1]);
      end
      3'd1: begin
        wide = {1'b0, a} - {1'b0, b} - cin;
        y = wide[W-1:0];
        cout = wide[W];
        v = (a[W-1] != b[W-1]) && (y[W-1] != a[W-1]);
      end
      3'd2: y = a & b;
      3'd3: y = a | b;
      3'd4: y = a ^ b;
      3'd5: begin
        y = a << amount;
        cout = (amount == 0) ? 1'b0 : a[W-amount];
      end
      3'd6: begin
        y = a >> amount;
        cout = (amount == 0) ? 1'b0 : a[amount-1];
      end
      3'd7: begin
        y = $signed(a) >>> amount;
        cout = (amount == 0) ? 1'b0 : a[amount-1];
      end
      default: begin
        y = {W{1'bx}};
        cout = 1'bx;
        v = 1'bx;
      end
    endcase
  end
  assign z = (y == {W{1'b0}});
  assign n = y[W-1];
  // The comparison flags depend only on A and B, whatever the operation is.
  assign eq = (a == b);
  assign lt = (a < b);
  assign gt = (a > b);
endmodule`,
};

// --- SECTION: VHDL ---

const vhdlGate = (name: string, seed: string, combine: string, invert: boolean): string => `library ieee;
use ieee.std_logic_1164.all;

entity ${name} is
  generic (N : positive := 2);
  port (a : in std_logic_vector(N - 1 downto 0); y : out std_logic);
end entity ${name};

architecture rtl of ${name} is
begin
  process (a)
    variable r : std_logic;
  begin
    r := ${seed};
    for k in a'range loop
      r := ${combine};
    end loop;
    y <= ${invert ? 'not r' : 'r'};
  end process;
end architecture rtl;`;

const VHDL_HEADER = `library ieee;
use ieee.std_logic_1164.all;
use ieee.numeric_std.all;
`;

/** A helper each sequential cell needs: whether every bit of a vector is a definite 0 or 1. */
const KNOWN_FUNCTION = `  function known (v : std_logic_vector) return boolean is
  begin
    for k in v'range loop
      if v(k) /= '0' and v(k) /= '1' then return false; end if;
    end loop;
    return true;
  end function;`;

export const VHDL_CELLS: Readonly<Record<string, string>> = {
  lw_and: vhdlGate('lw_and', "'1'", 'r and a(k)', false),
  lw_or: vhdlGate('lw_or', "'0'", 'r or a(k)', false),
  lw_nand: vhdlGate('lw_nand', "'1'", 'r and a(k)', true),
  lw_nor: vhdlGate('lw_nor', "'0'", 'r or a(k)', true),
  lw_xor: vhdlGate('lw_xor', "'0'", 'r xor a(k)', false),
  lw_xnor: vhdlGate('lw_xnor', "'0'", 'r xor a(k)', true),

  lw_not: `library ieee;
use ieee.std_logic_1164.all;

entity lw_not is
  port (a : in std_logic; y : out std_logic);
end entity lw_not;

architecture rtl of lw_not is
begin
  y <= not a;
end architecture rtl;`,

  lw_buf: `library ieee;
use ieee.std_logic_1164.all;

entity lw_buf is
  port (a : in std_logic; y : out std_logic);
end entity lw_buf;

architecture rtl of lw_buf is
begin
  y <= to_x01(a);
end architecture rtl;`,

  lw_tribuf: `library ieee;
use ieee.std_logic_1164.all;

entity lw_tribuf is
  port (a : in std_logic; en : in std_logic; y : out std_logic);
end entity lw_tribuf;

architecture rtl of lw_tribuf is
begin
  y <= to_x01(a) when en = '1' else
       'Z'       when en = '0' else
       'X';
end architecture rtl;`,

  lw_dff: `library ieee;
use ieee.std_logic_1164.all;

entity lw_dff is
  generic (FALLING : natural := 0; ACTIVE_HIGH : natural := 1);
  port (clk, d, set, rst : in std_logic; q, qn : out std_logic);
end entity lw_dff;

architecture rtl of lw_dff is
  signal clk_e, set_a, rst_a : std_logic;
  signal q_i : std_logic := '0';
begin
  clk_e <= clk when FALLING = 0 else not clk;
  set_a <= set when ACTIVE_HIGH = 1 else not set;
  rst_a <= rst when ACTIVE_HIGH = 1 else not rst;
  -- Set wins over reset, and both override the clock, as in the workstation.
  process (clk_e, set_a, rst_a)
  begin
    if set_a = '1' then
      q_i <= '1';
    elsif rst_a = '1' then
      q_i <= '0';
    elsif rising_edge(clk_e) then
      q_i <= to_x01(d);
    end if;
  end process;
  q <= q_i;
  qn <= not q_i;
end architecture rtl;`,

  lw_jkff: `library ieee;
use ieee.std_logic_1164.all;

entity lw_jkff is
  generic (FALLING : natural := 0; ACTIVE_HIGH : natural := 1);
  port (clk, j, k, set, rst : in std_logic; q, qn : out std_logic);
end entity lw_jkff;

architecture rtl of lw_jkff is
  signal clk_e, set_a, rst_a : std_logic;
  signal q_i : std_logic := '0';
begin
  clk_e <= clk when FALLING = 0 else not clk;
  set_a <= set when ACTIVE_HIGH = 1 else not set;
  rst_a <= rst when ACTIVE_HIGH = 1 else not rst;
  process (clk_e, set_a, rst_a)
  begin
    if set_a = '1' then
      q_i <= '1';
    elsif rst_a = '1' then
      q_i <= '0';
    elsif rising_edge(clk_e) then
      if j = '1' and k = '1' then
        q_i <= not q_i;
      elsif j = '1' and k = '0' then
        q_i <= '1';
      elsif j = '0' and k = '1' then
        q_i <= '0';
      elsif j = '0' and k = '0' then
        null;
      else
        q_i <= 'X';
      end if;
    end if;
  end process;
  q <= q_i;
  qn <= not q_i;
end architecture rtl;`,

  lw_tff: `library ieee;
use ieee.std_logic_1164.all;

entity lw_tff is
  generic (FALLING : natural := 0; ACTIVE_HIGH : natural := 1);
  port (clk, t, set, rst : in std_logic; q, qn : out std_logic);
end entity lw_tff;

architecture rtl of lw_tff is
  signal clk_e, set_a, rst_a : std_logic;
  signal q_i : std_logic := '0';
begin
  clk_e <= clk when FALLING = 0 else not clk;
  set_a <= set when ACTIVE_HIGH = 1 else not set;
  rst_a <= rst when ACTIVE_HIGH = 1 else not rst;
  process (clk_e, set_a, rst_a)
  begin
    if set_a = '1' then
      q_i <= '1';
    elsif rst_a = '1' then
      q_i <= '0';
    elsif rising_edge(clk_e) then
      if t = '1' then
        q_i <= not q_i;
      elsif t /= '0' then
        q_i <= 'X';
      end if;
    end if;
  end process;
  q <= q_i;
  qn <= not q_i;
end architecture rtl;`,

  lw_srlatch: `library ieee;
use ieee.std_logic_1164.all;

entity lw_srlatch is
  generic (ACTIVE_HIGH : natural := 1);
  port (s, r : in std_logic; q, qn : out std_logic);
end entity lw_srlatch;

architecture rtl of lw_srlatch is
  signal s_a, r_a : std_logic;
  signal q_i : std_logic := '0';
begin
  s_a <= s when ACTIVE_HIGH = 1 else not s;
  r_a <= r when ACTIVE_HIGH = 1 else not r;
  -- Level-sensitive: both asserted is an invalid input and leaves the state unknown.
  process (s_a, r_a)
  begin
    if s_a = '1' and r_a = '1' then
      q_i <= 'X';
    elsif s_a = '1' then
      q_i <= '1';
    elsif r_a = '1' then
      q_i <= '0';
    end if;
  end process;
  q <= q_i;
  qn <= not q_i;
end architecture rtl;`,

  lw_mux: `${VHDL_HEADER}
entity lw_mux is
  generic (SEL : positive := 2; HAS_EN : natural := 0);
  port (d : in std_logic_vector(2 ** SEL - 1 downto 0); s : in std_logic_vector(SEL - 1 downto 0); en : in std_logic; y : out std_logic);
end entity lw_mux;

architecture rtl of lw_mux is
${KNOWN_FUNCTION}
begin
  process (d, s, en)
    variable v : std_logic;
  begin
    if known(s) then
      v := d(to_integer(unsigned(s)));
    else
      v := 'X';
    end if;
    if HAS_EN = 1 then
      y <= en and v;
    else
      y <= to_x01(v);
    end if;
  end process;
end architecture rtl;`,

  lw_demux: `${VHDL_HEADER}
entity lw_demux is
  generic (SEL : positive := 2; HAS_EN : natural := 0);
  port (d : in std_logic; s : in std_logic_vector(SEL - 1 downto 0); en : in std_logic; y : out std_logic_vector(2 ** SEL - 1 downto 0));
end entity lw_demux;

architecture rtl of lw_demux is
${KNOWN_FUNCTION}
begin
  process (d, s, en)
    variable data : std_logic;
  begin
    if HAS_EN = 1 then data := d and en; else data := to_x01(d); end if;
    for g in y'range loop
      if known(s) then
        if to_integer(unsigned(s)) = g then y(g) <= data; else y(g) <= '0'; end if;
      elsif data = '0' then
        y(g) <= '0';
      else
        y(g) <= 'X';
      end if;
    end loop;
  end process;
end architecture rtl;`,

  lw_decoder: `${VHDL_HEADER}
entity lw_decoder is
  generic (SEL : positive := 2; HAS_EN : natural := 0; ACTIVE_HIGH : natural := 1);
  port (a : in std_logic_vector(SEL - 1 downto 0); en : in std_logic; y : out std_logic_vector(2 ** SEL - 1 downto 0));
end entity lw_decoder;

architecture rtl of lw_decoder is
${KNOWN_FUNCTION}
begin
  process (a, en)
    variable data, hot : std_logic;
  begin
    if HAS_EN = 1 then data := to_x01(en); else data := '1'; end if;
    for g in y'range loop
      if known(a) then
        if to_integer(unsigned(a)) = g then hot := data; else hot := '0'; end if;
      elsif data = '0' then
        hot := '0';
      else
        hot := 'X';
      end if;
      if ACTIVE_HIGH = 1 then y(g) <= hot; else y(g) <= not hot; end if;
    end loop;
  end process;
end architecture rtl;`,

  lw_prienc: `${VHDL_HEADER}
entity lw_prienc is
  generic (BITS : positive := 3);
  port (i : in std_logic_vector(2 ** BITS - 1 downto 0); y : out std_logic_vector(BITS - 1 downto 0); v : out std_logic);
end entity lw_prienc;

architecture rtl of lw_prienc is
begin
  -- The highest asserted request wins.
  process (i)
    variable found : std_logic;
    variable index : natural;
  begin
    found := '0';
    index := 0;
    -- Ascending, so a later (higher) request overwrites an earlier one.
    for k in 0 to 2 ** BITS - 1 loop
      if i(k) = '1' then
        found := '1';
        index := k;
      end if;
    end loop;
    y <= std_logic_vector(to_unsigned(index, BITS));
    v <= found;
  end process;
end architecture rtl;`,

  lw_bcd7seg: `${VHDL_HEADER}
entity lw_bcd7seg is
  generic (HAS_EN : natural := 0; ACTIVE_HIGH : natural := 1);
  port (d : in std_logic_vector(3 downto 0); en : in std_logic; seg : out std_logic_vector(6 downto 0));
end entity lw_bcd7seg;

architecture rtl of lw_bcd7seg is
${KNOWN_FUNCTION}
begin
  -- seg(0) is segment A ... seg(6) is segment G; '1' means lit before the polarity is applied.
  process (d, en)
    variable lit : std_logic_vector(6 downto 0);
  begin
    if HAS_EN = 1 and en = '0' then
      lit := "0000000";
    elsif (HAS_EN = 1 and en /= '1') or not known(d) then
      lit := "XXXXXXX";
    else
      case to_integer(unsigned(d)) is
        when 0 => lit := "0111111";
        when 1 => lit := "0000110";
        when 2 => lit := "1011011";
        when 3 => lit := "1001111";
        when 4 => lit := "1100110";
        when 5 => lit := "1101101";
        when 6 => lit := "1111101";
        when 7 => lit := "0000111";
        when 8 => lit := "1111111";
        when 9 => lit := "1101111";
        when others => lit := "0000000";
      end case;
    end if;
    if ACTIVE_HIGH = 1 then seg <= lit; else seg <= not lit; end if;
  end process;
end architecture rtl;`,

  lw_counter: `${VHDL_HEADER}
entity lw_counter is
  generic (WIDTH : positive := 4; DOWN : natural := 0; HAS_LOAD : natural := 0; HAS_EN : natural := 0; FALLING : natural := 0; ACTIVE_HIGH : natural := 1);
  port (clk, en, rst, load : in std_logic; d : in std_logic_vector(WIDTH - 1 downto 0); q : out std_logic_vector(WIDTH - 1 downto 0); tc : out std_logic);
end entity lw_counter;

architecture rtl of lw_counter is
${KNOWN_FUNCTION}
  signal clk_e, rst_a, load_a : std_logic;
  signal q_i : std_logic_vector(WIDTH - 1 downto 0) := (others => '0');
begin
  clk_e  <= clk when FALLING = 0 else not clk;
  rst_a  <= rst when ACTIVE_HIGH = 1 else not rst;
  load_a <= load when ACTIVE_HIGH = 1 else not load;
  process (clk_e, rst_a)
    variable next_value : unsigned(WIDTH - 1 downto 0);
  begin
    if rst_a = '1' then
      q_i <= (others => '0');
    elsif rising_edge(clk_e) then
      if HAS_EN = 1 and en /= '1' then
        if en /= '0' then q_i <= (others => 'X'); end if;
      elsif HAS_LOAD = 1 and load_a = '1' then
        q_i <= to_x01(d);
      elsif known(q_i) then
        next_value := unsigned(q_i);
        if DOWN = 1 then next_value := next_value - 1; else next_value := next_value + 1; end if;
        q_i <= std_logic_vector(next_value);
      else
        q_i <= (others => 'X');
      end if;
    end if;
  end process;
  q <= q_i;
  -- Terminal count: all ones counting up, all zeros counting down.
  process (q_i)
  begin
    if not known(q_i) then
      tc <= 'X';
    elsif (DOWN = 1 and unsigned(q_i) = 0) or (DOWN = 0 and q_i = (q_i'range => '1')) then
      tc <= '1';
    else
      tc <= '0';
    end if;
  end process;
end architecture rtl;`,

  lw_register: `library ieee;
use ieee.std_logic_1164.all;

entity lw_register is
  generic (WIDTH : positive := 4; HAS_EN : natural := 0; FALLING : natural := 0; ACTIVE_HIGH : natural := 1);
  port (clk, en, rst : in std_logic; d : in std_logic_vector(WIDTH - 1 downto 0); q : out std_logic_vector(WIDTH - 1 downto 0));
end entity lw_register;

architecture rtl of lw_register is
  signal clk_e, rst_a : std_logic;
  signal q_i : std_logic_vector(WIDTH - 1 downto 0) := (others => '0');
begin
  clk_e <= clk when FALLING = 0 else not clk;
  rst_a <= rst when ACTIVE_HIGH = 1 else not rst;
  process (clk_e, rst_a)
  begin
    if rst_a = '1' then
      q_i <= (others => '0');
    elsif rising_edge(clk_e) then
      if HAS_EN = 1 and en /= '1' then
        if en /= '0' then q_i <= (others => 'X'); end if;
      else
        q_i <= to_x01(d);
      end if;
    end if;
  end process;
  q <= q_i;
end architecture rtl;`,

  lw_alu: `${VHDL_HEADER}
entity lw_alu is
  generic (W : positive := 4);
  port (
    a, b : in std_logic_vector(W - 1 downto 0);
    op   : in std_logic_vector(2 downto 0);
    cin  : in std_logic;
    y    : out std_logic_vector(W - 1 downto 0);
    cout, z, n, v, eq, lt, gt : out std_logic
  );
end entity lw_alu;

architecture rtl of lw_alu is
${KNOWN_FUNCTION}
  function clog2 (x : positive) return natural is
    variable r : natural := 0;
    variable p : positive := 1;
  begin
    while p < x loop p := p * 2; r := r + 1; end loop;
    return r;
  end function;
  constant SH : natural := clog2(W);
begin
  -- 0 add, 1 subtract, 2 and, 3 or, 4 xor, 5 shift left, 6 shift right, 7 arithmetic shift right.
  process (a, b, op, cin)
    variable wide : unsigned(W downto 0);
    variable r : std_logic_vector(W - 1 downto 0);
    variable amount : natural;
    variable c, ov : std_logic;
    variable all_known : boolean;
  begin
    r := (others => '0');
    c := '0';
    ov := '0';
    all_known := known(op) and (cin = '0' or cin = '1');
    if not all_known then
      r := (others => 'X'); c := 'X'; ov := 'X';
    else
      case to_integer(unsigned(op)) is
        when 0 | 1 =>
          if not (known(a) and known(b)) then
            r := (others => 'X'); c := 'X'; ov := 'X';
          else
            if to_integer(unsigned(op)) = 0 then
              wide := ('0' & unsigned(a)) + ('0' & unsigned(b));
              if cin = '1' then wide := wide + 1; end if;
              ov := (a(W - 1) xnor b(W - 1)) and (wide(W - 1) xor a(W - 1));
            else
              wide := ('0' & unsigned(a)) - ('0' & unsigned(b));
              if cin = '1' then wide := wide - 1; end if;
              ov := (a(W - 1) xor b(W - 1)) and (wide(W - 1) xor a(W - 1));
            end if;
            r := std_logic_vector(wide(W - 1 downto 0));
            c := wide(W);
          end if;
        when 2 => r := a and b;
        when 3 => r := a or b;
        when 4 => r := a xor b;
        when others =>
          if not (known(a) and known(b(SH - 1 downto 0))) then
            r := (others => 'X'); c := 'X'; ov := 'X';
          else
            amount := to_integer(unsigned(b(SH - 1 downto 0)));
            if to_integer(unsigned(op)) = 5 then
              r := std_logic_vector(shift_left(unsigned(a), amount));
              if amount /= 0 then c := a(W - amount); end if;
            elsif to_integer(unsigned(op)) = 6 then
              r := std_logic_vector(shift_right(unsigned(a), amount));
              if amount /= 0 then c := a(amount - 1); end if;
            else
              r := std_logic_vector(shift_right(signed(a), amount));
              if amount /= 0 then c := a(amount - 1); end if;
            end if;
          end if;
      end case;
    end if;
    y <= r;
    cout <= c;
    v <= ov;
    n <= r(W - 1);
    if known(r) then
      if unsigned(r) = 0 then z <= '1'; else z <= '0'; end if;
    else
      z <= 'X';
    end if;
  end process;
  -- The comparison flags depend only on A and B, whatever the operation is.
  process (a, b)
  begin
    if known(a) and known(b) then
      if unsigned(a) = unsigned(b) then eq <= '1'; else eq <= '0'; end if;
      if unsigned(a) < unsigned(b) then lt <= '1'; else lt <= '0'; end if;
      if unsigned(a) > unsigned(b) then gt <= '1'; else gt <= '0'; end if;
    else
      eq <= 'X'; lt <= 'X'; gt <= 'X';
    end if;
  end process;
end architecture rtl;`,
};
