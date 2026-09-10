import React from 'react';
import { Copy, Key } from 'lucide-react';
import { InputOTP, InputOTPGroup, InputOTPSlot } from '../ui/input-otp';
import { Spinner } from '../ui/spinner';

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
    <div className="download-input" role="search" style={{ flexDirection: 'column', gap: '24px', alignItems: 'center' }}>
      <div style={{ display: 'flex', justifyContent: 'center', width: '100%' }}>
        <InputOTP 
          maxLength={6} 
          value={codeInput.slice(0, 6)} 
          onChange={(val) => onChangeCodeInput(val.toUpperCase())}
          onComplete={onSearchCode}
          disabled={isLoading || isDecrypting}
        >
          <InputOTPGroup>
            <InputOTPSlot index={0} />
            <InputOTPSlot index={1} />
            <InputOTPSlot index={2} />
            <InputOTPSlot index={3} />
            <InputOTPSlot index={4} />
            <InputOTPSlot index={5} />
          </InputOTPGroup>
        </InputOTP>
      </div>
      <div className="download-input-actions" style={{ display: 'flex', gap: '8px' }}>
        <button
          type="button"
          className="btn btn-secondary btn-sm"
          onClick={onPasteClipboard}
          title="Paste transfer code from clipboard"
          disabled={isLoading || isDecrypting}
          aria-label="Paste from clipboard"
        >
          <Copy size={14} className="mr-2" /> Paste
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
              <Spinner size={15} className="mr-2" /> Connecting...
            </>
          ) : (
            <>
              <Key size={15} className="mr-2" /> Connect &amp; Receive
            </>
          )}
        </button>
      </div>
    </div>
  );
}
