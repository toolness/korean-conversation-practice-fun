/** Hangul text utilities. */

/** Keep only Korean syllable blocks (U+AC00-U+D7A3), removing all else. */
export function stripToHangul(text: string): string {
  return text.replace(/[^\uac00-\ud7a3]/g, "");
}
