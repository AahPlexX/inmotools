// Shared types for the Markdown Workbench engines. Kept framework-free so every
// engine module can be unit-tested without React or a DOM environment.

export type FrontmatterFormat = 'yaml' | 'toml' | 'json';

export interface FrontmatterResult {
  readonly format: FrontmatterFormat | null;
  readonly data: Record<string, unknown>;
  readonly raw: string;
  readonly bodyStartLine: number;
}

export interface SourceLineNode {
  readonly id: string;
  readonly startLine: number;
  readonly endLine: number;
}

export interface ParsedDocument {
  readonly tree: unknown;
  readonly nodes: SourceLineNode[];
  readonly frontmatter: FrontmatterResult;
}

export interface RenderResult {
  readonly html: string;
  readonly anchors: ScrollAnchor[];
}

export interface ScrollAnchor {
  readonly sourceLine: number;
  readonly nodeId: string;
}

export interface ScrollAnchorOffset {
  readonly sourceLine: number;
  readonly offsetTop: number;
}

export type FormulaCellValue = number | string;

export interface FormulaCell {
  readonly row: number;
  readonly col: number;
  readonly raw: string;
}

export interface FormulaEvaluationResult {
  readonly value: FormulaCellValue;
  readonly error?: 'CYCLE' | 'PARSE' | 'REF';
}

export interface TableFormulaGrid {
  readonly rows: string[][];
}

export interface TableFormulaResult {
  readonly rows: FormulaCellValue[][];
  readonly errors: Map<string, 'CYCLE' | 'PARSE' | 'REF'>;
}

export interface CitationEntry {
  readonly id: string;
  readonly type: string;
  readonly title?: string;
  readonly author?: { family?: string; given?: string }[];
  readonly issued?: { 'date-parts'?: number[][] };
  readonly [key: string]: unknown;
}

export interface CitationLibrary {
  readonly entries: Map<string, CitationEntry>;
}

export type CitationStyleId = 'apa' | 'ieee' | 'chicago-author-date' | 'mla' | 'vancouver';

export interface CitationResolution {
  readonly citekey: string;
  readonly resolved: boolean;
  readonly inText?: string;
}

export interface ProseMetrics {
  readonly words: number;
  readonly sentences: number;
  readonly characters: number;
  readonly complexWords: number;
  readonly readingMinutes: number;
  readonly speakingMinutes: number;
  readonly fogIndex: number;
}

export interface SlideSection {
  readonly index: number;
  readonly source: string;
  readonly startLine: number;
}

export interface ProjectSnapshot {
  readonly text: string;
  readonly savedAt: number;
}

export interface ProjectHistory<T> {
  readonly past: T[];
  readonly present: T;
  readonly future: T[];
}

export interface DraftRecord {
  readonly id: string;
  readonly name: string;
  readonly text: string;
  readonly updatedAt: number;
}

export interface StorageUsageEstimate {
  readonly usageBytes: number | null;
  readonly quotaBytes: number | null;
}

export interface MathRenderResult {
  readonly html: string;
  readonly error?: string;
}

export interface OutlineEntry {
  readonly depth: number;
  readonly text: string;
  readonly line: number;
  readonly id: string;
}

export interface MathExpression {
  readonly source: string;
  readonly displayMode: boolean;
  readonly line: number;
}

export interface MathDiagnostic extends MathExpression {
  readonly error: string;
}

export type DiagramKind = 'mermaid' | 'graphviz';

export interface DiagramRenderRequest {
  readonly id: string;
  readonly kind: DiagramKind;
  readonly source: string;
}

export interface DiagramRenderResponse {
  readonly id: string;
  readonly svg?: string;
  readonly error?: string;
}

export interface ExportAsset {
  readonly filename: string;
  readonly mimeType: string;
}
