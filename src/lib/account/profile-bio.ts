export const PROFILE_BIO_MAX_LENGTH = 1200;

export function normalizeProfileBio(value: string): string {
  return value.replace(/\r\n?/g, "\n");
}
