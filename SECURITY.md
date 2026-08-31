# FileShare Security Model

## Threat Model and Architecture
FileShare is designed to securely transfer files directly between peers or via a relay server without ever exposing the contents of the files, or the keys to decrypt them, to the hosting infrastructure.

### End-to-End Encryption (E2EE)
- **AES-256-GCM**: All file data is encrypted locally on the client using AES-256-GCM before it ever leaves the browser. 
- **Key Wrapping**: A strong, random 256-bit AES file key is generated for each transfer. This key is encrypted (wrapped) using a separate key derived from a 6-digit PIN.
- **PBKDF2**: The PIN derivation uses PBKDF2 with HMAC-SHA-256, a secure random salt, and 600,000 iterations to defend against offline dictionary attacks.
- **Zero-Knowledge Backend**: The server stores the wrapped key, but never receives the PIN. Thus, the server cannot decrypt the wrapped key, nor the file payload.

### Privacy and Data Retention
- **No IP Logging**: The system does not store sender or receiver IP addresses in the database.
- **Burn-on-Read**: Burn-on-read transfers use an atomic check-and-set reservation system on the backend to prevent race conditions during concurrent downloads. Once downloaded, the file is immediately and permanently deleted.
- **Stale Reservation Cleanup**: Interrupted downloads release their locks after 5 minutes. Fully expired or burned files have their data wiped via a cron job `/api/cleanup`.

### Rate Limiting and Brute Force Protection
- All API endpoints are rate-limited.
- Decryption attempts are explicitly limited per file. After 5 failed access proofs, a file is temporarily locked to prevent brute-force guessing of the transfer PIN.

## Reporting a Vulnerability
If you discover a security vulnerability in FileShare, please do NOT report it in public issues. Instead, contact the maintainers directly through secure channels.

Please provide:
- A description of the vulnerability.
- Steps to reproduce.
- Any proof of concept (PoC) code.

We will acknowledge receipt of your report within 48 hours and provide a timeline for remediation.
