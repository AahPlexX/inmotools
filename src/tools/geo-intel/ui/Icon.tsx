// Inline SVG icons: font-independent, so they never render as missing-glyph boxes.

const PATHS = {
  info: 'M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20Zm0 4.5a1.25 1.25 0 1 1 0 2.5 1.25 1.25 0 0 1 0-2.5ZM13.5 17h-3v-1.5h.75V12h-.75v-1.5h2.25v5h.75Z',
  copy: 'M8 3h10a2 2 0 0 1 2 2v12h-2V5H8Zm-3 4h9a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2Zm0 2v10h9V9Z',
  home: 'M12 3 2 12h3v8h5v-5h4v5h5v-8h3Z',
  star: 'm12 2.5 2.9 6.1 6.6.8-4.9 4.6 1.3 6.6L12 17.3l-5.9 3.3 1.3-6.6-4.9-4.6 6.6-.8Z',
  starOutline: 'm12 2.5 2.9 6.1 6.6.8-4.9 4.6 1.3 6.6L12 17.3l-5.9 3.3 1.3-6.6-4.9-4.6 6.6-.8Zm0 4.7-1.6 3.4-3.7.4 2.7 2.6-.7 3.7 3.3-1.9 3.3 1.9-.7-3.7 2.7-2.6-3.7-.4Z',
  close: 'M6.4 5 12 10.6 17.6 5 19 6.4 13.4 12l5.6 5.6-1.4 1.4-5.6-5.6L6.4 19 5 17.6l5.6-5.6L5 6.4Z',
  plus: 'M11 5h2v6h6v2h-6v6h-2v-6H5v-2h6Z',
  minus: 'M5 11h14v2H5Z',
} as const;

export type IconName = keyof typeof PATHS;

export function Icon({ name, size = 16 }: { name: IconName; size?: number }) {
  return (
    <svg className="gi-svg-icon" width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d={PATHS[name]} fill="currentColor" fillRule="evenodd" />
    </svg>
  );
}
