import { substituteFormulaValues } from './table-formula-engine';
import { substituteInTextCitations } from './citation-engine';

// The single source of truth for "what the document actually says" once the
// tool's source-level transformations have been applied: evaluated table
// formulas, then formatted in-text citations.
//
// This exists because those transformations previously happened only on the
// preview path, while the DOCX export parsed the raw source instead. That
// meant the same document exported inconsistently - a formula cell showed its
// computed value in HTML and EPUB but the literal `=B2*C2` in DOCX, and
// citations were never substituted anywhere. Routing every consumer (preview,
// HTML, DOCX, EPUB, AST) through this one function is what keeps those
// outputs in agreement by construction rather than by convention.
//
// Order matters: formulas are evaluated against the raw cell text first, so a
// citation marker inside a table cell cannot change how a formula parses.
export const prepareDocument = (
  source: string,
  inTextCitations?: ReadonlyMap<string, string>,
): string => {
  const withFormulas = substituteFormulaValues(source);
  return inTextCitations && inTextCitations.size > 0
    ? substituteInTextCitations(withFormulas, inTextCitations)
    : withFormulas;
};

// Derives a safe filename stem from a document name. Falls back to
// "document" so an untitled or punctuation-only name still yields a usable
// download filename rather than a dotfile or an empty string.
export const toFilenameStem = (name: string): string => {
  const cleaned = name
    .trim()
    .replace(/[\\/:*?"<>|]+/g, '')
    .replace(/\s+/g, '-')
    .replace(/^[.-]+|[.-]+$/g, '');
  return cleaned || 'document';
};
