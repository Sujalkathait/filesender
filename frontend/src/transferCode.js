/**
 * SecureShare Transfer Code Parser & Generator
 * Manages creation and parsing of 6-digit OTP transfer codes, URL fragments, and sharing messages.
 */

/**
 * Extract key from URL fragment or query parameter
 */
export function extractKeyFromUrl() {
  if (typeof window === 'undefined') return null;
  const searchParams = new URLSearchParams(window.location.search);
  const codeParam = searchParams.get('code');
  if (codeParam) {
    const parsed = parseTransferCode(codeParam);
    if (parsed.key) return parsed.key;
  }
  const hash = window.location.hash || '';
  const match = hash.match(/key=([^&]+)/);
  if (match && match[1]) {
    return decodeURIComponent(match[1]).toLowerCase();
  }
  return null;
}

/**
 * Create a clean, readable 6-digit OTP Transfer Code (numbers only, e.g. 839201)
 */
export function createTransferCode(fileId, password) {
  const f = (fileId || '').toUpperCase();
  const p = (password || '').toUpperCase();
  if (!p || f === p) {
    return f;
  }
  return `${f}-${p}`;
}

/**
 * Parse 6-digit OTP Transfer Code or flexible input formats (URL, number code, FS-code, SEC-code, 10-digit, 16-char hex) into fileId and key
 */
export function parseTransferCode(input) {
  if (!input) return { fileId: null, key: null, valid: false };
  let str = input.trim();
  let urlKey = null;

  const result = (fileId, key, valid) => ({
    fileId,
    key: key || urlKey,
    valid
  });

  // Extract from full URL if pasted (MUST be done before regex extraction)
  if (str.startsWith('http://') || str.startsWith('https://')) {
    try {
      const url = new URL(str);
      const hashMatch = url.hash.match(/key=([^&]+)/);
      urlKey = hashMatch ? decodeURIComponent(hashMatch[1]).toLowerCase() : null;
      const qCode = url.searchParams.get('code');
      if (qCode) {
        str = qCode;
      } else {
        const pathParts = url.pathname.split('/').filter(Boolean);
        if (pathParts.length > 0) {
          const lastPart = pathParts[pathParts.length - 1];
          if (lastPart !== 'download') {
            return result(lastPart.toLowerCase(), urlKey || lastPart.toLowerCase(), Boolean(lastPart));
          }
        }
      }
    } catch (_) {}
  }

  // If user pasted a full message or text with Code: FS-..., extract the code
  const codeInText = str.match(/(?:Code:\s*|code=)?(FS-[0-9a-zA-Z]+(?:-[0-9a-zA-Z]+)*)/i);
  if (codeInText && codeInText[1]) {
    str = codeInText[1];
  }

  // Handle explicit prefixes: FS-, FS:, SEC-, SEC:, FILE-, FILE:
  const upper = str.toUpperCase();
  for (const prefix of ['FS-', 'FS:', 'SEC-', 'SEC:', 'FILE-', 'FILE:']) {
    if (upper.startsWith(prefix)) {
      const remainder = str.slice(prefix.length).trim();
      const cleanedRemainder = remainder.replace(/[\s-]/g, '').toLowerCase();

      // Check for 6-digit OTP code with prefix (e.g. FS-839201 or FS-839-201)
      if (/^\d{6}$/.test(cleanedRemainder)) {
        return result(cleanedRemainder, urlKey || cleanedRemainder, true);
      }

      const parts = remainder.split(/[-:]/);
      if (parts.length >= 2) {
        // If it's a 3+3 digit split like 839-201
        if (parts.length === 2 && parts[0].length === 3 && parts[1].length === 3 && /^\d{6}$/.test(cleanedRemainder)) {
          return result(cleanedRemainder, urlKey || cleanedRemainder, true);
        }
        return result(parts[0].toLowerCase(), parts.slice(1).join('-').toLowerCase(), true);
      } else if (parts.length === 1 && parts[0]) {
        // Handle raw 10-digit / 16-hex code with prefix (e.g. FS-4BE819F8A7)
        if (/^[0-9a-f]+$/.test(cleanedRemainder)) {
          if (cleanedRemainder.length === 6) {
            return result(cleanedRemainder, urlKey || cleanedRemainder, true);
          } else if (cleanedRemainder.length === 10) {
            return result(cleanedRemainder.slice(0, 5), cleanedRemainder.slice(5), true);
          } else if (cleanedRemainder.length === 16) {
            return result(cleanedRemainder.slice(0, 8), cleanedRemainder.slice(8), true);
          } else if (cleanedRemainder.length >= 32) {
            return result(cleanedRemainder.slice(0, 16), cleanedRemainder.slice(16), true);
          }
        }
        return result(parts[0].toLowerCase(), urlKey || null, true);
      }
    }
  }

  // Handle hyphenated format without prefix (e.g. 839-201 or 4BE81-9F8A7 or 12345-67890 or 4BE819D7-9F8A73C2)
  if (str.includes('-') || str.includes(':') || str.includes(' ')) {
    const cleanedDigits = str.replace(/[\s-:]/g, '').toLowerCase();
    // 6-digit OTP formatted as 839-201 or 839 201
    if (/^\d{6}$/.test(cleanedDigits)) {
      return result(cleanedDigits, urlKey || cleanedDigits, true);
    }
    const parts = str.split(/[-:\s]+/).filter(Boolean);
    if (parts.length >= 2) {
      return result(parts[0].toLowerCase(), parts.slice(1).join('-').toLowerCase(), true);
    }
  }

  // Handle raw combined digits / hex (no hyphens)
  const cleaned = str.replace(/[\s-]/g, '').toLowerCase();
  if (/^[0-9a-f]+$/.test(cleaned)) {
    // 6-digit numeric OTP transfer code
    if (/^\d{6}$/.test(cleaned)) {
      return result(cleaned, urlKey || cleaned, true);
    }
    // 10-digit transfer code (5 file ID + 5 key)
    if (cleaned.length === 10) {
      return result(cleaned.slice(0, 5), cleaned.slice(5), true);
    }
    // 16-hex legacy code (8 file ID + 8 key)
    if (cleaned.length === 16) {
      return result(cleaned.slice(0, 8), cleaned.slice(8), true);
    }
    // 32-hex legacy code (16 file ID + 16 key)
    if (cleaned.length >= 32) {
      return result(cleaned.slice(0, 16), cleaned.slice(16), true);
    }
    // 6-character hex raw ID
    if (cleaned.length === 6) {
      return result(cleaned, urlKey || cleaned, true);
    }
    // 5-digit raw file ID
    if (cleaned.length === 5) {
      return result(cleaned, urlKey || null, true);
    }
    // 8-digit raw file ID
    if (cleaned.length >= 8) {
      return result(cleaned.slice(0, 8), cleaned.slice(8) || urlKey || null, Boolean(cleaned));
    }
  }

  return result(str.toLowerCase() || null, urlKey || str.toLowerCase() || null, Boolean(str));
}

/**
 * Lightweight client-side format check. The server still validates IDs.
 */
export function isValidTransferCodeInput(input) {
  const parsed = parseTransferCode(input);
  if (!parsed.valid || !parsed.fileId) return false;
  return /^[0-9a-fA-F]{3,32}$/.test(parsed.fileId);
}

/**
 * Format a comprehensive share message for messaging apps (WhatsApp, Telegram, Slack, etc.)
 */
export function createShareMessage({ transferCode, shareUrl, expiryHours, expirySeconds, fileCount = 1, totalSize = '' }) {
  const parts = [
    'FileShare Transfer',
    `Code: ${transferCode}`,
  ];
  if (shareUrl) {
    parts.push(`Link: ${shareUrl}`);
  }
  const expVal = expirySeconds !== undefined ? expirySeconds : expiryHours;
  if (expVal) {
    const num = Number(expVal);
    const secs = Math.round(num >= 15 ? num : (num <= 1 && num > 0 ? num * 60 : num));
    if (secs <= 60) {
      parts.push(`Expires: ${secs} seconds`);
    } else {
      const mins = Math.floor(secs / 60);
      const rem = secs % 60;
      parts.push(`Expires: ${mins} minute${mins > 1 ? 's' : ''}${rem > 0 ? ` ${rem}s` : ''} (${secs} seconds)`);
    }
  }
  if (fileCount && totalSize) {
    parts.push(`Files: ${fileCount} file${fileCount > 1 ? 's' : ''} (${totalSize})`);
  }
  return parts.join('\n');
}
