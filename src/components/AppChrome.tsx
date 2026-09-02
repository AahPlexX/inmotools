import { useEffect, useState, type ReactNode } from 'react';
import { SUPPORT_PROMPT_EVENT, SUPPORT_URL, type SupportPromptDetail } from '../lib/support';

export function AppChrome({ children }: { children: ReactNode }) {
  const [supportPrompt, setSupportPrompt] = useState<SupportPromptDetail | null>(null);

  useEffect(() => {
    const onSupportPrompt = (event: Event) => {
      const detail = (event as CustomEvent<SupportPromptDetail>).detail;
      const message = detail?.message?.trim();
      if (!message) return;
      setSupportPrompt({ key: detail.key, message });
    };
    window.addEventListener(SUPPORT_PROMPT_EVENT, onSupportPrompt);
    return () => window.removeEventListener(SUPPORT_PROMPT_EVENT, onSupportPrompt);
  }, []);

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
          <a className="support-link" href={SUPPORT_URL} target="_blank" rel="noreferrer">☕ Buy me a coffee ($3)</a>
        </nav>
      </header>
      <main id="main">{children}</main>
      {supportPrompt ? (
        <aside className="support-toast" role="status" aria-label="Support independent tooling" aria-live="polite">
          <p>{supportPrompt.message}</p>
          <div className="support-toast-actions">
            <a href={SUPPORT_URL} target="_blank" rel="noreferrer">☕ Buy me a coffee ($3)</a>
            <button type="button" onClick={() => setSupportPrompt(null)} aria-label="Dismiss support prompt">Dismiss</button>
          </div>
        </aside>
      ) : null}
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
