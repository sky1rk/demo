/** Basic RFC-ish email shape check for client-side validation. */
export function isEmailFormat(value: string): boolean {
  return /^[^\s@]+@[^\s@]+$/.test(value) && /^[^\s@]+$/.test(value.split("@")[1]);
}
