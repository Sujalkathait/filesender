import React from 'react';
import { Copy, Key, Loader2 } from 'lucide-react';

/**
 * CodeSearchInput Component
 * Primary Responsibility: Handle user input for 6-digit OTP transfer codes, clipboard paste, and connect submit.
 */
export function CodeSearchInput({
  codeInput,
  onChangeCodeInput,
  onSearchCode,
  onPasteClipboard,
  isLoading,
  isDecrypting
}) {
  return (
    <div className="download-input" role="search">
      <input
        type="text"
        placeholder="Enter 6-Digit Transfer Code (e.g. 839201)"
        value={codeInput}
        onChange={(e) => onChangeCodeInput(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && onSearchCode()}
        inputMode="text"
        autoCapitalize="characters"
        autoCorrect="off"
        autoComplete="off"
        spellCheck="false"
        data-lpignore="true"
        data-form-type="other"
        maxLength={256}
        disabled={isLoading || isDecrypting}
        aria-label="Enter 6-Digit Transfer Code or URL"
      />
      <div className="download-input-actions">
        <button
          type="button"
          className="btn btn-secondary btn-sm"
          onClick={onPasteClipboard}
          title="Paste transfer code from clipboard"
          disabled={isLoading || isDecrypting}
          aria-label="Paste from clipboard"
        >
          <Copy size={14} /> Paste
        </button>
        <button
          type="button"
          className="btn btn-primary btn-sm"
          onClick={() => onSearchCode()}
          disabled={isLoading || isDecrypting || !codeInput.trim()}
          aria-busy={isLoading}
          aria-label="Connect and receive files"
        >
          {isLoading ? (
            <>
              <Loader2 size={15} className="spin" /> Connecting...
            </>
          ) : (
            <>
              <Key size={15} /> Connect &amp; Receive
            </>
          )}
        </button>
      </div>
    </div>
  );
}
