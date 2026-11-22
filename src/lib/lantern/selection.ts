/** Maximum lanterns rendered on one client at the same time */
export const MAX_VISIBLE_LANTERNS = 50;
/** Owner lanterns that are pinned regardless of the cap */
export const MAX_PINNED_OWNER = 10;

export interface SelectableLantern {
  id: string;
  ownerId: string;
  releasedAtMs: number;
  expiresAtMs: number;
}

export interface SelectionOptions {
  currentUserId: string | null;
  serverNowMs: number;
  max?: number;
  /** Lanterns that must stay (e.g. the one currently opened in the detail view) */
  pinnedIds?: ReadonlySet<string>;
  /** Optional predicate: is the lantern inside the viewport? */
  isInView?: (l: SelectableLantern) => boolean;
}

/**
 * Picks which lanterns are shown.
 * 1. Expired lanterns are never shown.
 * 2. Owner lanterns (newest first, up to MAX_PINNED_OWNER) and explicitly pinned lanterns always stay.
 * 3. Remaining slots: lanterns in view first, then newest first —
 *    so the farthest / oldest lanterns are the ones dropped when there are more than `max`.
 */
export function selectVisibleLanterns<T extends SelectableLantern>(all: readonly T[], opts: SelectionOptions): T[] {
  const max = opts.max ?? MAX_VISIBLE_LANTERNS;
  const alive = all.filter((l) => l.expiresAtMs > opts.serverNowMs && l.releasedAtMs <= opts.serverNowMs + 5000);

  const byNewest = (a: T, b: T) => b.releasedAtMs - a.releasedAtMs;

  const owner = opts.currentUserId
    ? alive.filter((l) => l.ownerId === opts.currentUserId).sort(byNewest).slice(0, Math.min(MAX_PINNED_OWNER, max))
    : [];
  const chosen = new Set(owner.map((l) => l.id));
  const result: T[] = [...owner];

  if (opts.pinnedIds) {
    for (const l of alive) {
      if (result.length >= max) break;
      if (opts.pinnedIds.has(l.id) && !chosen.has(l.id)) {
        chosen.add(l.id);
        result.push(l);
      }
    }
  }

  const rest = alive.filter((l) => !chosen.has(l.id));
  const inView = opts.isInView;
  rest.sort((a, b) => {
    if (inView) {
      const va = inView(a) ? 1 : 0;
      const vb = inView(b) ? 1 : 0;
      if (va !== vb) return vb - va;
    }
    return byNewest(a, b);
  });

  for (const l of rest) {
    if (result.length >= max) break;
    result.push(l);
  }
  return result;
}
