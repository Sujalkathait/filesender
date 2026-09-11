/**
 * FileShare Crypto Module
 * Client-side E2E Encryption using Web Crypto API
 * AES-256-GCM + PBKDF2 key wrapping + gzip
 *
 * SECURITY ARCHITECTURE:
 *   1. A random 256-bit AES file key is generated via crypto.subtle.generateKey()
 *   2. The file is encrypted with this random key (AES-256-GCM)
 *   3. The user's 6-digit PIN is used via PBKDF2 to derive a wrapping key
 *   4. The random file key is wrapped (encrypted) with AES-GCM using the wrapping key
 *   5. The wrapped key blob is stored server-side alongside IV/salt
 *   6. The server NEVER receives the PIN or the plaintext file key
 *
 * Memory-safe large files:
 * Files larger than CHUNK_SIZE are encrypted chunk-by-chunk. Each chunk is
 * read with file.slice() (streamed from disk), gzip-compressed, and encrypted
 * with a counter-derived per-chunk IV (getChunkIV). The ciphertext stream is
 * self-describing: every chunk is prefixed with a 4-byte little-endian length,
 * so decoding never needs the full file in memory and is immune to gzip
 * output-size variability.
 *
 * The format marker is stored server-side in the files.checksum column
 * ("chunked:4194304"); an empty marker means legacy single-shot format,
 * which decryptFile still supports for backwards compatibility.
 */

import { bytesToHex, hexToBytes } from './hexUtils.js';
import { compressData, decompressData } from './compression.js';

// Re-export for convenience & backwards compatibility
export { extractKeyFromUrl, createTransferCode, parseTransferCode, createShareMessage, isValidTransferCodeInput } from './transferCode.js';
export { formatBytes } from './utils/format.js';
export { copyToClipboard } from './utils/clipboard.js';
export { compressData, decompressData } from './compression.js';

export async function computeAccessProof(password) {
  const data = new TextEncoder().encode(`fileshare-access:${password || ''}`);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return bytesToHex(new Uint8Array(digest));
}

/**
 * Derive a deterministic file_id from the random 6-digit PIN.
 * This ensures the transfer ID is intrinsically linked to the PIN without
 * exposing the PIN to the server.
 */
export async function deriveFileId(shortCode) {
  const data = new TextEncoder().encode(`file_id_salt:${shortCode || ''}`);
  const digest = await crypto.subtle.digest('SHA-256', data);
  // Take first 32 chars of hex to match UUID length loosely
  return bytesToHex(new Uint8Array(digest)).substring(0, 32);
}

const ALGORITHM = 'AES-GCM';
const KEY_LENGTH = 256;
const ITERATIONS = 600000; // OWASP 2023 recommendation for PBKDF2-SHA-256
const SALT_LENGTH = 16;
const IV_LENGTH = 12;

/** Chunk size for memory-safe large-file encryption. */
export const CHUNK_SIZE = 4 * 1024 * 1024; // 4 MB

/** Build the server-side checksum marker for a chunked upload ('' = legacy format). */
export function buildChunkMarker(chunked) {
  return chunked ? `chunked:${CHUNK_SIZE}` : '';
}

/** True when a checksum marker indicates the chunked ciphertext format. */
export function isChunkedMarker(checksum) {
  return typeof checksum === 'string' && checksum.startsWith('chunked:');
}

/**
 * Derive a wrapping key from PIN + salt using PBKDF2.
 * This key is used ONLY to wrap/unwrap the random file encryption key.
 */
async function deriveWrappingKey(password, salt, usages = ['encrypt', 'decrypt']) {
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(password),
    'PBKDF2',
    false,
    ['deriveBits', 'deriveKey']
  );

  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations: ITERATIONS, hash: 'SHA-256' },
    keyMaterial,
    { name: ALGORITHM, length: KEY_LENGTH },
    false,
    usages
  );
}

/**
 * Wrap (encrypt) the random file key using the PIN-derived wrapping key.
 * Uses AES-GCM with a dedicated wrapping IV for authenticated wrapping.
 * Returns { wrappedKey: Uint8Array, wrapIV: Uint8Array }
 */
async function wrapFileKey(fileKey, wrappingKey) {
  const wrapIV = crypto.getRandomValues(new Uint8Array(IV_LENGTH));
  // Export the raw file key bytes
  const rawKey = await crypto.subtle.exportKey('raw', fileKey);
  // Encrypt the raw key with the wrapping key
  const wrappedBuffer = await crypto.subtle.encrypt(
    { name: ALGORITHM, iv: wrapIV },
    wrappingKey,
    rawKey
  );
  return {
    wrappedKey: new Uint8Array(wrappedBuffer),
    wrapIV
  };
}

/**
 * Unwrap (decrypt) the file key using the PIN-derived wrapping key.
 * Returns the CryptoKey for file decryption.
 */
async function unwrapFileKey(wrappedKeyBytes, wrapIVBytes, wrappingKey) {
  // Decrypt the wrapped key
  const rawKey = await crypto.subtle.decrypt(
    { name: ALGORITHM, iv: wrapIVBytes },
    wrappingKey,
    wrappedKeyBytes
  );
  // Import as AES-GCM key
  return crypto.subtle.importKey(
    'raw',
    rawKey,
    { name: ALGORITHM, length: KEY_LENGTH },
    false,
    ['encrypt', 'decrypt']
  );
}

/**
 * Generate encryption materials:
 * - Random 256-bit AES file key (the ACTUAL encryption key)
 * - Random IV for file encryption
 * - Random salt for PBKDF2 PIN derivation
 * - 6-digit numeric PIN
 * - Wrapped key blob (file key encrypted with PIN-derived wrapping key)
 */
export async function generateKey() {
  const salt = crypto.getRandomValues(new Uint8Array(SALT_LENGTH));
  const iv = crypto.getRandomValues(new Uint8Array(IV_LENGTH));

  // Generate 6 numeric digits for password / OTP transfer code (e.g. "839201")
  const randomBytes = crypto.getRandomValues(new Uint8Array(6));
  const password = Array.from(randomBytes, b => (b % 10).toString()).join('');

  // Generate the RANDOM file encryption key — this is the real security
  const fileKey = await crypto.subtle.generateKey(
    { name: ALGORITHM, length: KEY_LENGTH },
    true, // extractable so we can wrap it
    ['encrypt', 'decrypt']
  );

  // Derive wrapping key from PIN
  const wrappingKey = await deriveWrappingKey(password, salt, ['encrypt', 'decrypt']);

  // Wrap the file key with the PIN-derived wrapping key
  const { wrappedKey, wrapIV } = await wrapFileKey(fileKey, wrappingKey);

  // Make a non-extractable copy of the file key for actual encryption use
  const rawKey = await crypto.subtle.exportKey('raw', fileKey);
  const encryptionKey = await crypto.subtle.importKey(
    'raw',
    rawKey,
    { name: ALGORITHM, length: KEY_LENGTH },
    false,
    ['encrypt', 'decrypt']
  );

  return {
    key: encryptionKey,
    iv,
    salt,
    password,
    wrappedKey: bytesToHex(wrappedKey),
    wrapIV: bytesToHex(wrapIV),
  };
}

/**
 * Derive wrapping key from password + salt, then unwrap the file key.
 * Used on the download/decrypt side.
 */
export async function deriveKey(password, salt, wrappedKeyHex, wrapIVHex) {
  // If no wrapped key provided, fall back to legacy direct derivation
  // (backward compatibility for old transfers still within TTL)
  if (!wrappedKeyHex || !wrapIVHex) {
    const keyMaterial = await crypto.subtle.importKey(
      'raw',
      new TextEncoder().encode(password),
      'PBKDF2',
      false,
      ['deriveKey']
    );
    return crypto.subtle.deriveKey(
      { name: 'PBKDF2', salt, iterations: 600000, hash: 'SHA-256' },
      keyMaterial,
      { name: ALGORITHM, length: KEY_LENGTH },
      false,
      ['encrypt', 'decrypt']
    );
  }

  // New secure path: derive wrapping key, unwrap file key
  const wrappingKey = await deriveWrappingKey(password, salt, ['encrypt', 'decrypt']);
  const wrappedKeyBytes = hexToBytes(wrappedKeyHex);
  const wrapIVBytes = hexToBytes(wrapIVHex);
  return unwrapFileKey(wrappedKeyBytes, wrapIVBytes, wrappingKey);
}

/**
 * Generate unique IV for each chunk based on base IV and chunkIndex counter.
 * Safe for up to 2^32 chunks (17 TB at 4 MB chunks).
 */
export function getChunkIV(baseIV, chunkIndex) {
  if (chunkIndex > 0xFFFFFFFF) {
    throw new Error('Chunk index exceeds maximum safe value (2^32)');
  }
  const iv = new Uint8Array(baseIV);
  const view = new DataView(iv.buffer, iv.byteOffset, iv.byteLength);
  const currentVal = view.getUint32(8, false);
  view.setUint32(8, (currentVal + chunkIndex) >>> 0, false);
  return iv;
}

/**
 * Encrypt individual chunk with unique chunk IV
 */
export async function encryptChunkData(chunkArrayBuffer, key, baseIV, chunkIndex) {
  const iv = getChunkIV(baseIV, chunkIndex);
  const encrypted = await crypto.subtle.encrypt(
    { name: ALGORITHM, iv },
    key,
    chunkArrayBuffer
  );
  return new Uint8Array(encrypted);
}

/**
 * Decrypt individual chunk with unique chunk IV
 */
export async function decryptChunkData(encryptedChunkBuffer, key, baseIV, chunkIndex) {
  const iv = getChunkIV(baseIV, chunkIndex);
  const decrypted = await crypto.subtle.decrypt(
    { name: ALGORITHM, iv },
    key,
    encryptedChunkBuffer
  );
  return new Uint8Array(decrypted);
}

/**
 * Encrypt file: stream slices -> gzip -> AES-GCM chunk by chunk.
 * Memory usage stays near CHUNK_SIZE regardless of file size.
 * onProgress receives { stage, percent, compressionRatio? }.
 */
export async function encryptFile(file, onProgress) {
  const totalSize = file.size;
  const { key, iv, salt, password, wrappedKey, wrapIV } = await generateKey();

  onProgress?.({ stage: 'compressing', percent: 10 });

  const totalChunks = Math.max(1, Math.ceil(totalSize / CHUNK_SIZE));
  const chunked = totalChunks > 1;
  const parts = [];
  let encryptedSize = 0;
  let compressionRatio = '0.0';
  let useGzip = true;

  for (let i = 0; i < totalChunks; i++) {
    // Yield to main thread every chunk so UI animations, spinners, and progress remain 60fps
    if (totalChunks > 1) {
      await new Promise((resolve) => setTimeout(resolve, 0));
    }

    const start = i * CHUNK_SIZE;
    const end = Math.min(start + CHUNK_SIZE, totalSize);
    const raw = new Uint8Array(await file.slice(start, end).arrayBuffer());

    let payload = raw;
    if (useGzip) {
      const compressed = await compressData(raw);
      if (i === 0 && raw.length > 0 && compressed.length >= raw.length * 0.98) {
        useGzip = false;
        payload = raw;
        compressionRatio = '0.0';
      } else {
        payload = compressed;
        if (i === 0 && raw.length > 0) {
          compressionRatio = ((1 - compressed.length / raw.length) * 100).toFixed(1);
        }
      }
    }

    const encrypted = await encryptChunkData(payload.buffer, key, iv, i);

    if (chunked) {
      // 4-byte little-endian length header makes the stream self-describing.
      // Single-chunk files stay in the legacy format (no header).
      const header = new Uint8Array(4);
      new DataView(header.buffer).setUint32(0, encrypted.length, true);
      parts.push(header);
      encryptedSize += 4;
    }

    parts.push(encrypted);
    encryptedSize += encrypted.byteLength;

    onProgress?.({ stage: 'encrypting', percent: 30 + Math.round(((i + 1) / totalChunks) * 60) });
  }

  onProgress?.({ stage: 'encrypted', percent: 95 });

  return {
    encryptedBlob: new Blob(parts),
    originalSize: totalSize,
    encryptedSize,
    iv: bytesToHex(iv),
    salt: bytesToHex(salt),
    password,
    wrappedKey,
    wrapIV,
    compressionRatio,
    chunked,
    compressed: useGzip,
    fileId: await deriveFileId(password), // <--- New: attach deterministic file_id
  };
}

/**
 * Decrypt file: read ciphertext -> AES-GCM decrypt + gunzip per chunk.
 * Supports both the chunked format (checksum marker) and legacy single-shot.
 *
 * @param {Blob} encryptedBlob
 * @param {string} password - 6-digit PIN
 * @param {string} ivHex
 * @param {string} saltHex
 * @param {Function} onProgress
 * @param {boolean} chunked
 * @param {boolean} compressed
 * @param {string} wrappedKeyHex - hex-encoded wrapped file key (new format)
 * @param {string} wrapIVHex - hex-encoded wrapping IV (new format)
 */
export async function decryptFile(encryptedBlob, password, ivHex, saltHex, onProgress, chunked = false, compressed = true, wrappedKeyHex = '', wrapIVHex = '') {
  if (!ivHex || !saltHex) {
    throw new Error('Invalid file metadata: IV or Salt is missing');
  }

  const iv = hexToBytes(ivHex);
  const salt = hexToBytes(saltHex);
  if (!iv || !salt) {
    throw new Error('Invalid file metadata: Invalid IV or Salt format');
  }

  onProgress?.({ stage: 'decrypting', percent: 40 });

  const key = await deriveKey(password, salt, wrappedKeyHex, wrapIVHex);

  if (chunked) {
    const totalBytes = encryptedBlob.size;
    const decryptedParts = [];
    let outputLength = 0;
    let offset = 0;
    let chunkIndex = 0;

    while (offset < totalBytes) {
      // Yield to main thread per chunk to prevent browser freezing
      await new Promise((resolve) => setTimeout(resolve, 0));

      const header = new Uint8Array(await encryptedBlob.slice(offset, offset + 4).arrayBuffer());
      const chunkLength = new DataView(header.buffer).getUint32(0, true);
      offset += 4;

      const cipherChunk = await encryptedBlob.slice(offset, offset + chunkLength).arrayBuffer();
      offset += chunkLength;

      const decrypted = await decryptChunkData(cipherChunk, key, iv, chunkIndex);
      const raw = compressed ? await decompressData(decrypted) : decrypted;
      decryptedParts.push(raw);
      outputLength += raw.length;
      chunkIndex++;

      onProgress?.({ stage: 'decrypting', percent: 40 + Math.round((offset / totalBytes) * 55) });
    }

    onProgress?.({ stage: 'complete', percent: 100 });
    return concatBytes(decryptedParts, outputLength);
  }

  // Legacy single-shot format
  onProgress?.({ stage: 'decrypting', percent: 50 });
  const encryptedData = new Uint8Array(await encryptedBlob.arrayBuffer());
  const decrypted = await crypto.subtle.decrypt({ name: ALGORITHM, iv }, key, encryptedData);
  onProgress?.({ stage: 'decompressing', percent: 80 });
  const decompressed = compressed ? await decompressData(new Uint8Array(decrypted)) : new Uint8Array(decrypted);
  onProgress?.({ stage: 'complete', percent: 100 });
  return decompressed;
}

/** Concatenate Uint8Array parts into one buffer with a single allocation. */
function concatBytes(parts, totalLength) {
  const out = new Uint8Array(totalLength);
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}
