// A digital asset records which account or licence a seat is, never how to get into it. This catches the common slip of pasting
// the credential in with its label ("password: ...", "key=..."). It cannot tell an unlabelled password from a licence reference:
// a guard rail, not a guarantee.
const SECRET_LABEL = /(?:^|[^a-z])(?:password|pwd|secret|token|key)\s*[:=]/i

/** True when the text labels part of itself as a credential: `password`, `pwd`, `secret`, `token` or `key` followed by `:` or `=`. */
export function looksLikeSecret(value: string): boolean {
  return SECRET_LABEL.test(value)
}
