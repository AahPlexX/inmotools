export type CodeProject = { enabled: boolean; html: string; css: string; js: string };
export const EMPTY_CODE: CodeProject = { enabled: false, html: '', css: '', js: '' };
export function parseCode(input: unknown): CodeProject {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('Invalid code project.');
  const p = input as Record<string, unknown>;
  if (typeof p.enabled !== 'boolean') throw new Error('Invalid code enable setting.');
  for (const key of ['html', 'css', 'js']) if (typeof p[key] !== 'string' || (p[key] as string).length > 150_000) throw new Error(`${key.toUpperCase()} is limited to 150,000 characters.`);
  return { enabled: p.enabled, html: p.html as string, css: p.css as string, js: p.js as string };
}
export const escapeStyle = (css: string) => css.replace(/<\/style/gi, '<\\/style');
export const escapeScript = (js: string) => js.replace(/<\/script/gi, '<\\/script');

export async function formatCode(source: string, language: 'html' | 'css' | 'js'): Promise<string> {
  const [prettier, html, postcss, babel, estree] = await Promise.all([
    import('prettier/standalone'), import('prettier/plugins/html'), import('prettier/plugins/postcss'), import('prettier/plugins/babel'), import('prettier/plugins/estree'),
  ]);
  return prettier.format(source, { parser: language === 'js' ? 'babel' : language, plugins: [html, postcss, babel, estree] });
}
