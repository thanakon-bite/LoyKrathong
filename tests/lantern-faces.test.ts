import { describe, expect, it } from "vitest";
import { lanternInputSchema } from "@/lib/security/validation";
import { drawingDataFromInput, inputAssetPaths, inputFaces, storedAssetPaths, storedFaces } from "@/lib/lantern/face-data";
import { artFaces, faceTextureKey, textureForFace, textUnderArt, type FaceTextures } from "@/lib/lantern/texture";
import { draftFacesToVisual, draftHasContent, facesWithArt, newDraft, patchFace } from "@/hooks/use-lantern-draft";
import { facesForShape, type FaceArt, type LanternFaces } from "@/types/lantern";

const U = "11111111-1111-1111-1111-111111111111";
const path = (kind: "image" | "drawing", n: number) => `${U}/${kind}-${String(n).repeat(8)}-2222-2222-2222-222222222222.${kind === "image" ? "webp" : "png"}`;
const cfg = { x: 0, y: 0, scale: 0.5 };

const base = {
  design: "classic-golden",
  color: "#F5B942",
  displayName: "บี",
  wishMessage: "",
  blessingMessage: "ขอให้โชคดี",
  extraMessage: "",
  textConfig: { font: "sriracha", color: "#5b2d0c", size: 1, position: "center" },
  imageConfig: null,
  imagePath: null,
  drawingPath: null,
};

describe("lanternInputSchema – faces", () => {
  it("defaults to no side-wall art (old clients keep working)", () => {
    expect(lanternInputSchema.parse(base).faces).toEqual({});
  });

  it("accepts art on the other walls", () => {
    const parsed = lanternInputSchema.parse({
      ...base,
      faces: { back: { imagePath: path("image", 3), imageConfig: cfg, drawingPath: path("drawing", 4) }, left: { drawingPath: path("drawing", 5) } },
    });
    expect(parsed.faces.back?.imagePath).toBe(path("image", 3));
    expect(parsed.faces.left).toEqual({ imagePath: null, imageConfig: null, drawingPath: path("drawing", 5) });
  });

  it("rejects unknown walls, foreign keys and bad paths", () => {
    expect(lanternInputSchema.safeParse({ ...base, faces: { front: { drawingPath: path("drawing", 4) } } }).success).toBe(false);
    expect(lanternInputSchema.safeParse({ ...base, faces: { top: { drawingPath: path("drawing", 4) } } }).success).toBe(false);
    expect(lanternInputSchema.safeParse({ ...base, faces: { back: { drawingPath: "../../etc/passwd" } } }).success).toBe(false);
    expect(lanternInputSchema.safeParse({ ...base, faces: { back: { drawingPath: path("drawing", 4), url: "https://evil" } } }).success).toBe(false);
  });

  it("requires a placement for a side-wall photo and keeps it in range", () => {
    expect(lanternInputSchema.safeParse({ ...base, faces: { back: { imagePath: path("image", 3) } } }).success).toBe(false);
    expect(lanternInputSchema.safeParse({ ...base, faces: { back: { imagePath: path("image", 3), imageConfig: { x: 2, y: 0, scale: 0.5 } } } }).success).toBe(false);
  });
});

describe("face-data storage", () => {
  const input = lanternInputSchema.parse({
    ...base,
    drawingPath: path("drawing", 1),
    faces: {
      right: { drawingPath: path("drawing", 6) },
      back: { imagePath: path("image", 3), imageConfig: cfg, drawingPath: path("drawing", 4) },
    },
  });

  it("drops walls the shape doesn't have", () => {
    expect(inputFaces(input).map((f) => f.face)).toEqual(["right", "back"]);
    expect(inputFaces({ ...input, shape: "heart" }).map((f) => f.face)).toEqual(["back"]);
  });

  it("lists every asset to check for ownership", () => {
    expect(inputAssetPaths(input).sort()).toEqual([path("drawing", 1), path("drawing", 6), path("image", 3), path("drawing", 4)].sort());
    expect(inputAssetPaths({ ...input, shape: "moon" })).not.toContain(path("drawing", 6));
  });

  it("keeps the front drawing where old readers look for it and adds faces", () => {
    const dd = drawingDataFromInput(input);
    expect(dd).toEqual({
      path: path("drawing", 1),
      width: 512,
      height: 563,
      faces: { right: { drawing: path("drawing", 6) }, back: { image: path("image", 3), imageConfig: cfg, drawing: path("drawing", 4) } },
    });
  });

  it("stores side-wall art without a front drawing and nothing when there is no art", () => {
    const backOnly = drawingDataFromInput({ ...input, drawingPath: null, shape: "rabbit" });
    expect(backOnly).toEqual({ faces: { back: { image: path("image", 3), imageConfig: cfg, drawing: path("drawing", 4) } } });
    expect(drawingDataFromInput({ ...input, drawingPath: null, faces: {} })).toBeNull();
  });

  it("round-trips through the row and collects every path for signing / cleanup", () => {
    const row = { image_url: path("image", 9), drawing_data: drawingDataFromInput(input) };
    expect(storedFaces(row.drawing_data).map((f) => f.face)).toEqual(["right", "back"]);
    expect(storedAssetPaths(row).sort()).toEqual([path("image", 9), path("drawing", 1), path("drawing", 6), path("image", 3), path("drawing", 4)].sort());
  });

  it("reads old rows and ignores malformed face entries", () => {
    expect(storedAssetPaths({ image_url: null, drawing_data: { path: path("drawing", 1), width: 512, height: 563 } })).toEqual([path("drawing", 1)]);
    expect(storedAssetPaths({ image_url: null, drawing_data: null })).toEqual([]);
    const bad = { faces: { back: { drawing: "https://evil.example/x.png", image: path("image", 3) }, nope: { drawing: path("drawing", 4) } } };
    // the photo has no valid placement and the drawing is not a storage path → nothing usable
    expect(storedFaces(bad)).toEqual([]);
  });
});

describe("face → texture mapping", () => {
  const art: FaceArt = { imageSrc: null, imageConfig: null, drawingSrc: "data:x" };

  it("walls without art show the shared side (blessing) texture", () => {
    const v = { shape: "box" as const, faces: { back: art } };
    expect(faceTextureKey(v, "front")).toBe("front");
    expect(faceTextureKey(v, "back")).toBe("back");
    expect(faceTextureKey(v, "right")).toBe("side");
    expect(faceTextureKey(v, "left")).toBe("side");
    expect(textUnderArt(v)).toBe(false);
  });

  it("ignores art on walls the shape doesn't have", () => {
    const faces: LanternFaces = { right: art, back: art };
    expect(artFaces({ shape: "heart", faces })).toEqual(["back"]);
    expect(faceTextureKey({ shape: "heart", faces }, "right")).toBe("side");
  });

  it("keeps the blessing under the art when no side wall is left for it", () => {
    expect(textUnderArt({ shape: "moon", faces: { back: art } })).toBe(true);
    expect(textUnderArt({ shape: "box", faces: { right: art, back: art, left: art } })).toBe(true);
    expect(textUnderArt({ shape: "box", faces: {} })).toBe(false);
  });

  it("textureForFace picks the art canvas, falling back to the side texture", () => {
    const tex = { front: { id: "f" }, side: { id: "s" }, faces: { back: { id: "b" } } } as unknown as FaceTextures;
    expect(textureForFace(tex, "front")).toBe(tex.front);
    expect(textureForFace(tex, "back")).toBe(tex.faces!.back);
    expect(textureForFace(tex, "left")).toBe(tex.side);
    expect(textureForFace({ front: tex.front, side: tex.side }, "back")).toBe(tex.side);
  });

  it("box has four walls, silhouettes two", () => {
    expect(facesForShape("box")).toEqual(["front", "right", "back", "left"]);
    expect(facesForShape("rabbit")).toEqual(["front", "back"]);
  });
});

describe("draft faces", () => {
  it("patches one wall and removes it again when emptied", () => {
    let d = newDraft();
    d = { ...d, ...patchFace(d, "back", { drawingDataUrl: "data:image/png;base64,AAA" }) };
    expect(d.faces.back?.drawingDataUrl).toBe("data:image/png;base64,AAA");
    expect(draftHasContent(d)).toBe(true);
    expect(facesWithArt(d)).toEqual(["back"]);
    d = { ...d, ...patchFace(d, "back", { drawingDataUrl: null }) };
    expect(d.faces.back).toBeUndefined();
    expect(draftHasContent(d)).toBe(false);
  });

  it("front edits go to the top-level fields", () => {
    const d = newDraft();
    expect(patchFace(d, "front", { imageDataUrl: "data:image/webp;base64,BBB" })).toEqual({ imageDataUrl: "data:image/webp;base64,BBB" });
  });

  it("visual only carries walls of the chosen shape", () => {
    let d = newDraft();
    d = { ...d, ...patchFace(d, "right", { drawingDataUrl: "data:r" }) };
    d = { ...d, ...patchFace(d, "back", { imageDataUrl: "data:b" }) };
    expect(Object.keys(draftFacesToVisual(d))).toEqual(["right", "back"]);
    expect(draftFacesToVisual(d).back).toMatchObject({ imageSrc: "data:b", drawingSrc: null });
    d = { ...d, shape: "heart" };
    expect(Object.keys(draftFacesToVisual(d))).toEqual(["back"]);
    expect(facesWithArt(d)).toEqual(["back"]);
  });
});
