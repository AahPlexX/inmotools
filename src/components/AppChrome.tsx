import type { ReactNode } from 'react';

export function AppChrome({ children }: { children: ReactNode }) {
  return (
    <div className="app-frame">
      <a className="skip-link" href="#main">Skip to main content</a>
      <div className="privacy-rail" role="status" aria-label="Local processing status">
        <span className="privacy-pulse" aria-hidden="true" />
        <span><strong>Local execution</strong> · your selected files stay on this device</span>
      </div>
      <header className="site-header">
        <a href="#/" className="brand" aria-label="InMo Tools home">
          <span className="brand-mark" aria-hidden="true">IM</span>
          <span>InMo Tools</span>
        </a>
        <nav aria-label="Primary navigation">
          <a href="#/">All tools</a>
          <a href="#privacy">Privacy</a>
          <a className="support-link" href="https://buymeacoffee.com/aahplexx" target="_blank" rel="noreferrer">Buy me a coffee</a>
        </nav>
      </header>
      <main id="main">{children}</main>
      <footer className="site-footer" id="privacy">
        <div>
          <strong>Local-first by design.</strong>
          <p>File processing happens in your browser. Lightweight preferences such as favorites and recents are stored only in this browser.</p>
        </div>
        <a href="#/">InMo Tools</a>
      </footer>
    </div>
  );
}
