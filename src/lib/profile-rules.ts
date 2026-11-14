export function normalizeUsername(u: string) {
  return u.trim().replace(/^@/, "").toLowerCase();
}
export function usernameError(u: string): string | null {
  if (u.length < 5 || u.length > 32) return "Username must be 5–32 characters";
  if (!/^[a-z0-9_]+$/.test(u)) return "Use only letters, numbers and underscores";
  return null;
}
