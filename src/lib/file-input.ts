// Shared handling for `<input type="file">` selections.
//
// A file input only fires `change` when its value differs from the previous
// selection. Picking the same path twice - which is exactly what happens when
// someone edits a file and re-imports it to see the new result - therefore
// does nothing at all unless the input's value is cleared after each use.
//
// Clearing it is order-sensitive. Setting `value = ''` also empties the live
// `FileList`, so a handler that receives the list itself and reads it after an
// `await` would find it empty. `consumeFileInput` runs the caller's work first
// and only resets once that work has settled, which is safe whether the
// handler took a single `File` (already extracted by then) or the `FileList`
// (already iterated, or still held by an in-flight read).

export function consumeFileInput<T>(input: HTMLInputElement, use: () => T): void {
  let result: T | undefined;
  try {
    result = use();
  } finally {
    void Promise.resolve(result).catch(() => undefined).then(() => {
      input.value = '';
    });
  }
}
