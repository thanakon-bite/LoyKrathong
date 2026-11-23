import { assetPathSchema, imageConfigSchema, type LanternInput } from "@/lib/security/validation";
import { EXTRA_FACE_IDS, facesForShape, type ExtraFaceId, type ImageConfig } from "@/types/lantern";

/**
 * Per-wall art storage (no DB migration): the FRONT photo / drawing keep their columns
 * (image_url, image_config, drawing_data.path), the other walls live in drawing_data.faces:
 *
 *   drawing_data = { path?, width?, height?, faces?: { back: { image?, imageConfig?, drawing? }, … } }
 *
 * Older rows have no `faces`; rows with art only on a side wall have no `path`.
 */
export interface StoredFaceArt {
  image?: string;
  imageConfig?: ImageConfig;
  drawing?: string;
}

export interface DrawingDataJson {
  path?: string;
  width?: number;
  height?: number;
  faces?: Partial<Record<ExtraFaceId, StoredFaceArt>>;
}

export interface FaceAssetPaths {
  face: ExtraFaceId;
  imagePath: string | null;
  imageConfig: ImageConfig | null;
  drawingPath: string | null;
}

type FacesInput = Pick<LanternInput, "shape" | "faces">;

/** Side walls of the input that carry art – walls the shape doesn't have are dropped */
export function inputFaces(input: FacesInput): FaceAssetPaths[] {
  const walls = facesForShape(input.shape);
  const out: FaceAssetPaths[] = [];
  for (const face of EXTRA_FACE_IDS) {
    const f = input.faces?.[face];
    if (!f || !walls.includes(face)) continue;
    const imagePath = f.imagePath && f.imageConfig ? f.imagePath : null;
    if (!imagePath && !f.drawingPath) continue;
    out.push({ face, imagePath, imageConfig: imagePath ? f.imageConfig : null, drawingPath: f.drawingPath ?? null });
  }
  return out;
}

/** Every storage path the input references (front + kept walls) */
export function inputAssetPaths(input: FacesInput & Pick<LanternInput, "imagePath" | "drawingPath">): string[] {
  const paths = [input.imagePath, input.drawingPath];
  for (const f of inputFaces(input)) paths.push(f.imagePath, f.drawingPath);
  return paths.filter((p): p is string => !!p);
}

/** drawing_data column value for a new lantern (null when it carries no drawing and no side-wall art) */
export function drawingDataFromInput(input: FacesInput & Pick<LanternInput, "drawingPath">): DrawingDataJson | null {
  const faces: Partial<Record<ExtraFaceId, StoredFaceArt>> = {};
  for (const f of inputFaces(input)) {
    faces[f.face] = {
      ...(f.imagePath ? { image: f.imagePath, imageConfig: f.imageConfig! } : {}),
      ...(f.drawingPath ? { drawing: f.drawingPath } : {}),
    };
  }
  const hasFaces = Object.keys(faces).length > 0;
  if (!input.drawingPath && !hasFaces) return null;
  return {
    ...(input.drawingPath ? { path: input.drawingPath, width: 512, height: 563 } : {}),
    ...(hasFaces ? { faces } : {}),
  };
}

const validPath = (v: unknown): string | null => (assetPathSchema.safeParse(v).success ? (v as string) : null);

/** Side-wall art stored in a row's drawing_data (malformed entries are ignored) */
export function storedFaces(drawingData: unknown): Array<{ face: ExtraFaceId; image: string | null; imageConfig: ImageConfig | null; drawing: string | null }> {
  const raw = (drawingData as DrawingDataJson | null)?.faces;
  if (!raw || typeof raw !== "object") return [];
  const out = [];
  for (const face of EXTRA_FACE_IDS) {
    const f = (raw as Record<string, unknown>)[face] as StoredFaceArt | undefined;
    if (!f || typeof f !== "object") continue;
    const ic = imageConfigSchema.safeParse(f.imageConfig);
    const image = ic.success ? validPath(f.image) : null;
    const drawing = validPath(f.drawing);
    if (image || drawing) out.push({ face, image, imageConfig: image && ic.success ? ic.data : null, drawing });
  }
  return out;
}

/** Every storage object a lantern row references – signing and the cleanup purge use this */
export function storedAssetPaths(row: { image_url: string | null; drawing_data: unknown }): string[] {
  const paths: Array<string | null> = [row.image_url, (row.drawing_data as DrawingDataJson | null)?.path ?? null];
  for (const f of storedFaces(row.drawing_data)) paths.push(f.image, f.drawing);
  return [...new Set(paths.filter((p): p is string => !!p))];
}
