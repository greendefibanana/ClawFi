export function createId(prefix: string) {
  return `${prefix}-${crypto.randomUUID().slice(0, 8)}`;
}

export function isoNow() {
  return new Date().toISOString();
}
