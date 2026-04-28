const ALPHABET = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ_abcdefghijklmnopqrstuvwxyz-";

export function nanoid(size = 12): string {
  const bytes = new Uint8Array(size);
  crypto.getRandomValues(bytes);

  let id = "";
  for (let i = 0; i < size; i += 1) {
    id += ALPHABET[(bytes[i] ?? 0) & 63];
  }

  return id;
}
