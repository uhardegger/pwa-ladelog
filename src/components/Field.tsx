/**
 * A labelled form field (NFR-6).
 *
 * The hint deliberately sits *outside* the `<label>` and is linked with
 * `aria-describedby`. Nesting it inside would make it part of the accessible
 * name, so a screen reader would announce the whole explanation every time the
 * field is reached.
 */
import type { ReactNode } from 'react';

interface Props {
  id: string;
  label: string;
  hint?: string;
  children(props: { id: string; 'aria-describedby': string | undefined }): ReactNode;
}

export function Field({ id, label, hint, children }: Props) {
  const hintId = hint ? `${id}-hint` : undefined;
  return (
    <div className="field">
      <label className="field__label" htmlFor={id}>
        {label}
      </label>
      {children({ id, 'aria-describedby': hintId })}
      {hint && (
        <span className="field__hint" id={hintId}>
          {hint}
        </span>
      )}
    </div>
  );
}
