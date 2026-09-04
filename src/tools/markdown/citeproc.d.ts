// citeproc has no bundled TypeScript types and no @types package exists on
// npm for it. This ambient declaration covers only the narrow surface this
// tool actually calls, following the same minimal-ambient-declaration
// pattern already used elsewhere in this catalog for other untyped
// dependencies (see src/tools/geo/topojson.d.ts).
declare module 'citeproc' {
  export interface CiteprocSys {
    retrieveLocale(lang: string): string;
    retrieveItem(id: string): unknown;
  }

  export class Engine {
    constructor(sys: CiteprocSys, style: string, lang?: string, forceLang?: boolean);
    updateItems(idList: string[]): void;
    processCitationCluster(
      citation: { citationItems: { id: string; locator?: string; label?: string }[]; properties: { noteIndex: number } },
      citationsPre: unknown[],
      citationsPost: unknown[],
    ): [unknown, [number, string, string][]];
    makeBibliography(): [unknown, string[]] | false;
  }
}
