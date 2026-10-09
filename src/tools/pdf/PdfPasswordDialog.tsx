import { useEffect, useRef, useState } from 'react';
import './pdf-password-dialog.css';

export type PdfPasswordRequest = {
  fileName: string;
  incorrect: boolean;
  submit: (password: string) => void;
  cancel: () => void;
};

export default function PdfPasswordDialog({ request, onClosed }: { request: PdfPasswordRequest | null; onClosed?: () => void }) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  // Moving a pointer target between pointer-down and click can cancel activation.
  const pointerFocusRef = useRef(false);

  function revealFocusedControl(control: HTMLElement | null) {
    if (!control) return;
    // Focus can arrive while React is committing a new password request.
    queueMicrotask(() => {
      const dialog = dialogRef.current;
      if (dialog?.open && control.isConnected && dialog.contains(control) && document.activeElement === control) {
        control.scrollIntoView({ block: 'nearest', inline: 'nearest' });
      }
    });
  }
  const [password, setPassword] = useState('');
  const [show, setShow] = useState(false);

  useEffect(() => {
    setPassword('');
    setShow(false);
    pointerFocusRef.current = false;
    const dialog = dialogRef.current;
    if (request) {
      if (!dialog?.open) dialog?.showModal();
      inputRef.current?.focus();
      revealFocusedControl(inputRef.current);
    } else if (dialog?.open) dialog.close();
  }, [request]);

  useEffect(() => {
    const dialog = dialogRef.current;
    return () => { dialog?.close(); };
  }, []);

  return <dialog
    ref={dialogRef}
    className="pdf-password-dialog"
    aria-labelledby="pdf-password-title"
    aria-describedby="pdf-password-file pdf-password-description"
    onClose={onClosed}
    onPointerDownCapture={() => { pointerFocusRef.current = true; }}
    onPointerCancelCapture={() => { pointerFocusRef.current = false; }}
    onClickCapture={() => { pointerFocusRef.current = false; }}
    onFocus={(event) => {
      if (!pointerFocusRef.current && event.target.matches('input, button')) revealFocusedControl(event.target);
    }}
    onCancel={(event) => { event.preventDefault(); setPassword(''); request?.cancel(); }}
    onKeyDown={(event) => {
      pointerFocusRef.current = false;
      if (event.key !== 'Tab') return;
      if (event.shiftKey && document.activeElement === inputRef.current) {
        event.preventDefault(); cancelRef.current?.focus();
      } else if (!event.shiftKey && document.activeElement === cancelRef.current) {
        event.preventDefault(); inputRef.current?.focus();
      }
    }}
  >
    <h2 id="pdf-password-title">Open protected PDF</h2>
    <p id="pdf-password-file" className="pdf-password-file">{request?.fileName}</p>
    <p className="help-text" id="pdf-password-description">Enter this document’s password to view it locally. Protected PDFs are read-only here; they cannot be modified or included in output. This tool does not save your password.</p>
    <p id="pdf-password-message" role={request?.incorrect ? 'alert' : 'status'} data-testid="pdf-password-message" className="help-text">
      {request?.incorrect ? 'The password was not accepted. Check it and try again, or cancel opening this file.' : 'The document needs a password.'}
    </p>
    <form onSubmit={(event) => {
      event.preventDefault();
      if (!request) return;
      const value = password;
      setPassword('');
      request.submit(value);
    }}>
      <div className="field">
        <label htmlFor="pdf-password-input">PDF password</label>
        <input ref={inputRef} id="pdf-password-input" type={show ? 'text' : 'password'} value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="off" spellCheck={false} autoCapitalize="none" aria-invalid={request?.incorrect || undefined} aria-describedby="pdf-password-description pdf-password-message" />
      </div>
      <label className="pdf-password-show"><input type="checkbox" checked={show} onChange={(event) => setShow(event.target.checked)} />Show password</label>
      <div className="button-row">
        <button className="action-button" type="submit">Open read-only</button>
        <button ref={cancelRef} className="action-button secondary" type="button" onClick={() => { setPassword(''); request?.cancel(); }}>Cancel opening</button>
      </div>
    </form>
  </dialog>;
}
