/** A vehicle just added: its tile grows into the grid the next time the grid shows it. */
let fresh: { serial: string; at: number } | null = null;
const FRESH_MS = 15_000;

export function markNewTile(serial: string) {
  fresh = { serial, at: Date.now() };
}

/** True once for the tile of a vehicle added in the last few seconds. */
export function takeNewTile(serial: string) {
  if (!fresh || fresh.serial !== serial || Date.now() - fresh.at > FRESH_MS) return false;
  fresh = null;
  return true;
}
