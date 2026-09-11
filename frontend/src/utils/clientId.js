/**
 * Anonymous Device Fingerprint / Client ID Utility
 * Tracks personal 1 GB quota anonymously without login or credentials.
 */

export function getOrCreateClientId() {
  try {
    let id = localStorage.getItem('fileshare_client_id');
    if (!id) {
      if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
        id = 'usr_' + crypto.randomUUID().replace(/-/g, '');
      } else {
        id = 'usr_' + Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
      }
      localStorage.setItem('fileshare_client_id', id);
    }
    return id;
  } catch (_) {
    // Fallback if localStorage is restricted (incognito/cookies disabled)
    return 'usr_ephemeral';
  }
}
