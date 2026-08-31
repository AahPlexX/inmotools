import type { JsonValue } from './format-engine';

type Shape =
  | { readonly kind: 'string' | 'number' | 'boolean' | 'null' | 'unknown' }
  | { readonly kind: 'array'; readonly items: Shape }
  | { readonly kind: 'object'; readonly properties: Record<string, { readonly shape: Shape; readonly optional: boolean }> }
  | { readonly kind: 'union'; readonly variants: readonly Shape[] };

const isObject = (value: JsonValue): value is { [key: string]: JsonValue } => typeof value === 'object' && value !== null && !Array.isArray(value);
const shapeKey = (shape: Shape): string => JSON.stringify(shape);

const mergeShapes = (left: Shape, right: Shape): Shape => {
  if (shapeKey(left) === shapeKey(right)) return left;
  if (left.kind === 'object' && right.kind === 'object') {
    const keys = [...new Set([...Object.keys(left.properties), ...Object.keys(right.properties)])].sort();
    const properties: Record<string, { shape: Shape; optional: boolean }> = {};
    for (const key of keys) {
      const a = left.properties[key]; const b = right.properties[key];
      if (!a) properties[key] = { shape: b.shape, optional: true };
      else if (!b) properties[key] = { shape: a.shape, optional: true };
      else properties[key] = { shape: mergeShapes(a.shape, b.shape), optional: a.optional || b.optional };
    }
    return { kind: 'object', properties };
  }
  if (left.kind === 'array' && right.kind === 'array') return { kind: 'array', items: mergeShapes(left.items, right.items) };
  const variants = [...(left.kind === 'union' ? left.variants : [left]), ...(right.kind === 'union' ? right.variants : [right])];
  const unique = new Map(variants.map((variant) => [shapeKey(variant), variant]));
  return { kind: 'union', variants: [...unique.values()] };
};

const inferShape = (value: JsonValue): Shape => {
  if (value === null) return { kind: 'null' };
  if (typeof value === 'string') return { kind: 'string' };
  if (typeof value === 'number') return { kind: 'number' };
  if (typeof value === 'boolean') return { kind: 'boolean' };
  if (Array.isArray(value)) return { kind: 'array', items: value.length ? value.map(inferShape).reduce(mergeShapes) : { kind: 'unknown' } };
  const properties = Object.fromEntries(Object.keys(value).sort().map((key) => [key, { shape: inferShape(value[key]), optional: false }]));
  return { kind: 'object', properties };
};

const pascal = (value: string): string => {
  const result = value.replace(/[^A-Za-z0-9]+(.)?/g, (_, char: string | undefined) => char ? char.toUpperCase() : '').replace(/^./, (char) => char.toUpperCase());
  return /^[A-Za-z_]/.test(result) ? result || 'Value' : `Value${result}`;
};
const safeProperty = (key: string): string => /^[A-Za-z_$][\w$]*$/.test(key) ? key : JSON.stringify(key);

const generateTypeScript = (root: Shape, rootName: string): string => {
  const declarations: string[] = []; const seen = new Set<string>();
  const typeFor = (shape: Shape, name: string): string => {
    if (shape.kind === 'string') return 'string'; if (shape.kind === 'number') return 'number'; if (shape.kind === 'boolean') return 'boolean'; if (shape.kind === 'null') return 'null'; if (shape.kind === 'unknown') return 'unknown';
    if (shape.kind === 'union') return shape.variants.map((variant, index) => typeFor(variant, `${name}Variant${index + 1}`)).join(' | ');
    if (shape.kind === 'array') return `${typeFor(shape.items, `${name}Item`)}[]`;
    renderObject(shape, name); return name;
  };
  const renderObject = (shape: Extract<Shape, { kind: 'object' }>, name: string): void => {
    if (seen.has(name)) return; seen.add(name);
    const lines = Object.keys(shape.properties).sort().map((key) => { const prop = shape.properties[key]; return `  ${safeProperty(key)}${prop.optional ? '?' : ''}: ${typeFor(prop.shape, `${name}${pascal(key)}`)};`; });
    declarations.push(`export interface ${name} {\n${lines.join('\n')}\n}`);
  };
  const rootType = typeFor(root, rootName);
  if (root.kind !== 'object') declarations.push(`export type ${rootName} = ${rootType};`);
  return `${declarations.join('\n\n')}\n`;
};

const zodFor = (shape: Shape): string => {
  if (shape.kind === 'string') return 'z.string()'; if (shape.kind === 'number') return 'z.number()'; if (shape.kind === 'boolean') return 'z.boolean()'; if (shape.kind === 'null') return 'z.null()'; if (shape.kind === 'unknown') return 'z.unknown()';
  if (shape.kind === 'array') return `z.array(${zodFor(shape.items)})`;
  if (shape.kind === 'union') return `z.union([${shape.variants.map(zodFor).join(', ')}])`;
  const props = Object.keys(shape.properties).sort().map((key) => { const prop = shape.properties[key]; return `  ${JSON.stringify(key)}: ${zodFor(prop.shape)}${prop.optional ? '.optional()' : ''}`; });
  return `z.object({\n${props.join(',\n')}\n})`;
};

const goBase = (shape: Shape): string => {
  if (shape.kind === 'string') return 'string'; if (shape.kind === 'number') return 'float64'; if (shape.kind === 'boolean') return 'bool'; if (shape.kind === 'null' || shape.kind === 'unknown' || shape.kind === 'union') return 'any';
  if (shape.kind === 'array') return `[]${goBase(shape.items)}`;
  const fields = Object.keys(shape.properties).sort().map((key) => { const prop = shape.properties[key]; const base = goBase(prop.shape); const fieldType = prop.optional && !base.startsWith('[]') && base !== 'any' ? `*${base}` : base; return `  ${pascal(key)} ${fieldType} \`json:"${key}${prop.optional ? ',omitempty' : ''}"\``; });
  return `struct {\n${fields.join('\n')}\n}`;
};

const generateRust = (root: Shape, rootName: string): string => {
  const declarations: string[] = []; const seen = new Set<string>();
  const typeFor = (shape: Shape, name: string): string => {
    if (shape.kind === 'string') return 'String'; if (shape.kind === 'number') return 'f64'; if (shape.kind === 'boolean') return 'bool'; if (shape.kind === 'null' || shape.kind === 'unknown' || shape.kind === 'union') return 'serde_json::Value';
    if (shape.kind === 'array') return `Vec<${typeFor(shape.items, `${name}Item`)}>`;
    renderObject(shape, name); return name;
  };
  const renderObject = (shape: Extract<Shape, { kind: 'object' }>, name: string): void => {
    if (seen.has(name)) return; seen.add(name);
    const fields = Object.keys(shape.properties).sort().map((key) => { const prop = shape.properties[key]; const base = typeFor(prop.shape, `${name}${pascal(key)}`); return `    pub ${key.replace(/[^A-Za-z0-9_]/g, '_')}: ${prop.optional ? `Option<${base}>` : base},`; });
    declarations.push(`#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]\npub struct ${name} {\n${fields.join('\n')}\n}`);
  };
  const rootType = typeFor(root, rootName);
  if (root.kind !== 'object') declarations.push(`pub type ${rootName} = ${rootType};`);
  return `${declarations.join('\n\n')}\n`;
};

const jsonSchemaFor = (shape: Shape): Record<string, unknown> => {
  if (shape.kind === 'string' || shape.kind === 'number' || shape.kind === 'boolean' || shape.kind === 'null') return { type: shape.kind === 'number' ? 'number' : shape.kind };
  if (shape.kind === 'unknown') return {};
  if (shape.kind === 'union') return { anyOf: shape.variants.map(jsonSchemaFor) };
  if (shape.kind === 'array') return { type: 'array', items: jsonSchemaFor(shape.items) };
  const keys = Object.keys(shape.properties).sort();
  const required = keys.filter((key) => !shape.properties[key].optional);
  return { type: 'object', properties: Object.fromEntries(keys.map((key) => [key, jsonSchemaFor(shape.properties[key].shape)])), ...(required.length ? { required } : {}) };
};

export const generateSchemaTargets = (value: JsonValue, rootName = 'Root'): { typescript: string; zod: string; go: string; rust: string; jsonSchemaDraft07: string; jsonSchema202012: string } => {
  const shape = inferShape(value);
  const baseSchema = jsonSchemaFor(shape);
  return {
    typescript: generateTypeScript(shape, rootName),
    zod: `import { z } from 'zod';\n\nexport const ${rootName}Schema = ${zodFor(shape)};\n`,
    go: `type ${rootName} ${goBase(shape)}\n`,
    rust: generateRust(shape, rootName),
    jsonSchemaDraft07: JSON.stringify({ $schema: 'http://json-schema.org/draft-07/schema#', title: rootName, ...baseSchema }, null, 2),
    jsonSchema202012: JSON.stringify({ $schema: 'https://json-schema.org/draft/2020-12/schema', title: rootName, ...baseSchema }, null, 2),
  };
};
