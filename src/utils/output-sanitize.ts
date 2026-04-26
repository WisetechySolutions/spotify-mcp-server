/**
 * Output sanitization for strings flowing from external APIs into MCP tool results.
 *
 * Defense-in-depth against indirect prompt injection: a malicious or attacker-
 * controlled string returned by an upstream API could otherwise contain bidi
 * overrides, zero-width characters, control chars, or HTML that the model
 * interprets as instructions.
 *
 * Best practice as of 2026 (OWASP "LLM Top 10 for Agent Tools", LLM01 Indirect
 * Prompt Injection): strip the dangerous Unicode classes and cap per-field
 * length BEFORE the string reaches the model. Lossy-but-safe.
 *
 * Reference: Boucher et al. 2021 "Trojan Source: Invisible Vulnerabilities"
 *   https://trojansource.codes/  — bidi-override attack class.
 */

// Control chars except \t, \n. Drops \r, the C0 + C1 control range, and DEL.
const CONTROL_CHARS = /[ --]/g;

// Unicode bidi overrides + zero-width + BOM:
//   U+200B ZWSP, U+200C ZWNJ, U+200D ZWJ, U+200E LRM, U+200F RLM
//   U+202A LRE, U+202B RLE, U+202C PDF, U+202D LRO, U+202E RLO
//   U+2060 WJ, U+2066 LRI, U+2067 RLI, U+2068 FSI, U+2069 PDI
//   U+FEFF BOM
const UNICODE_INJECTION = /[​-‏‪-‮⁠⁦-⁩﻿]/g;

// Triple-backtick fences let untrusted content forge code-block boundaries in
// the model's view. Replace with U+02CB modifier-letter grave accents that
// look similar to humans but don't open/close fences for the model.
const TRIPLE_BACKTICK = /```/g;

const DEFAULT_MAX_LENGTH = 16_384;
const DEFAULT_TRUNCATED_MARKER = "…[truncated]";

export interface SanitizeOptions {
  /** Per-field length cap (default 16 KB). 0 disables length capping. */
  maxLength?: number;
  /** If true, leave HTML tags intact (default false — strips <foo> tags). */
  allowHtml?: boolean;
  /** Marker appended on truncation. Default `…[truncated]`. */
  truncatedMarker?: string;
  /** If true, neutralize triple-backtick fences (default true). */
  neutralizeFences?: boolean;
}

/**
 * Sanitize a string before including it in a tool result. Removes Unicode
 * injection vectors, control characters, optional HTML, and caps length.
 * Idempotent and safe to call on already-sanitized strings.
 */
export function sanitizeForModel(
  input: string | null | undefined,
  options: SanitizeOptions = {},
): string {
  if (input === null || input === undefined) return "";
  let s = typeof input === "string" ? input : String(input);

  s = s.replace(UNICODE_INJECTION, "").replace(CONTROL_CHARS, "");

  if (!options.allowHtml) {
    // Strip simple HTML/XML-style tags. Not a parser — handles the common case
    // of pass-through HTML bodies.
    s = s.replace(/<[^>]*>/g, "");
  }

  if (options.neutralizeFences !== false) {
    s = s.replace(TRIPLE_BACKTICK, "ˋˋˋ");
  }

  const max = options.maxLength ?? DEFAULT_MAX_LENGTH;
  if (max > 0 && s.length > max) {
    const marker = options.truncatedMarker ?? DEFAULT_TRUNCATED_MARKER;
    s = s.slice(0, Math.max(0, max - marker.length)) + marker;
  }

  return s;
}

/**
 * Wrap an untrusted string in a labeled fence so the model knows the boundary.
 * Defense in depth on top of `sanitizeForModel`. Use for fields known to carry
 * attacker-influenced content (ticket titles, customer names, task descriptions).
 *
 * Example:
 *   fenceUntrusted("title", task.title)
 *   // => "<<<title>>>Brother iPrint disappeared<<</title>>>"
 */
export function fenceUntrusted(
  label: string,
  content: string | null | undefined,
  options?: SanitizeOptions,
): string {
  const safe = sanitizeForModel(content, options);
  return `<<<${label}>>>${safe}<<</${label}>>>`;
}
