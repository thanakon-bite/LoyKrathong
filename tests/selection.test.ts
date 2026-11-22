import { describe, expect, it } from "vitest";
import { MAX_VISIBLE_LANTERNS, selectVisibleLanterns, type SelectableLantern } from "@/lib/lantern/selection";

const NOW = 1_800_000_000_000;
const MIN = 60_000;

function make(n: number, owner = "other", offsetMin = 0): SelectableLantern[] {
  return Array.from({ length: n }, (_, i) => ({
    id: `${owner}-${i}`,
    ownerId: owner,
    releasedAtMs: NOW - (offsetMin + i * 0.1) * MIN,
    expiresAtMs: NOW - (offsetMin + i * 0.1) * MIN + 30 * MIN,
  }));
}

describe("selectVisibleLanterns", () => {
  it("never shows more than 50 lanterns", () => {
    const result = selectVisibleLanterns(make(200), { currentUserId: null, serverNowMs: NOW });
    expect(result).toHaveLength(MAX_VISIBLE_LANTERNS);
  });

  it("drops the oldest lanterns first", () => {
    const all = make(80);
    const result = selectVisibleLanterns(all, { currentUserId: null, serverNowMs: NOW });
    const oldestKept = Math.min(...result.map((l) => l.releasedAtMs));
    const dropped = all.filter((l) => !result.includes(l));
    expect(dropped.every((d) => d.releasedAtMs <= oldestKept)).toBe(true);
  });

  it("always keeps the owner's lantern, even when it is the oldest and the scene is full", () => {
    const mine: SelectableLantern = { id: "mine", ownerId: "me", releasedAtMs: NOW - 20 * MIN, expiresAtMs: NOW + 10 * MIN };
    const result = selectVisibleLanterns([...make(300), mine], { currentUserId: "me", serverNowMs: NOW });
    expect(result).toHaveLength(MAX_VISIBLE_LANTERNS);
    expect(result.map((l) => l.id)).toContain("mine");
    expect(result[0].id).toBe("mine");
  });

  it("never shows expired lanterns (server time decides)", () => {
    const expired: SelectableLantern = { id: "old", ownerId: "me", releasedAtMs: NOW - 31 * MIN, expiresAtMs: NOW - MIN };
    const result = selectVisibleLanterns([expired, ...make(3)], { currentUserId: "me", serverNowMs: NOW });
    expect(result.map((l) => l.id)).not.toContain("old");
  });

  it("keeps pinned lanterns (opened in the detail view)", () => {
    const all = make(120);
    const pinnedId = all[119].id;
    const result = selectVisibleLanterns(all, { currentUserId: null, serverNowMs: NOW, pinnedIds: new Set([pinnedId]) });
    expect(result.map((l) => l.id)).toContain(pinnedId);
  });

  it("prefers lanterns that are in view", () => {
    const all = make(60);
    const result = selectVisibleLanterns(all, { currentUserId: null, serverNowMs: NOW, isInView: (l) => l.id.endsWith("9") });
    const inViewIds = all.filter((l) => l.id.endsWith("9")).map((l) => l.id);
    expect(inViewIds.every((id) => result.some((r) => r.id === id))).toBe(true);
  });
});
