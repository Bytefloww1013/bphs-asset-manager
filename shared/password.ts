export interface PasswordRule {
  id: string
  label: string
  test: (password: string) => boolean
}

export const PASSWORD_RULES: readonly PasswordRule[] = [
  { id: 'length', label: 'At least 8 characters', test: (p) => p.length >= 8 },
  { id: 'case', label: 'Upper and lower case letters', test: (p) => /[a-z]/.test(p) && /[A-Z]/.test(p) },
  { id: 'number', label: 'A number', test: (p) => /\d/.test(p) },
  { id: 'special', label: 'A special character', test: (p) => /[^A-Za-z0-9]/.test(p) },
]

export function checkPassword(password: string) {
  return PASSWORD_RULES.map((rule) => ({ id: rule.id, label: rule.label, ok: rule.test(password) }))
}

export function isStrongPassword(password: string): boolean {
  return PASSWORD_RULES.every((rule) => rule.test(password))
}
