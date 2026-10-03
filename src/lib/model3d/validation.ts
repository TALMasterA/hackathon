import { MODEL3D_MAX_PHOTO_BYTES, MODEL3D_PHOTO_TYPES, type Model3dErrorCode } from "./contract";

export type PhotoValidation =
  | { ok: true; file: File }
  | { ok: false; error: Extract<Model3dErrorCode, "invalid-count" | "invalid-type" | "too-large">; status: 400 | 413 | 415 };

const SIGNATURES: Record<(typeof MODEL3D_PHOTO_TYPES)[number], (bytes: Uint8Array) => boolean> = {
  "image/jpeg": (bytes) => bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff,
  "image/png": (bytes) => [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a].every((value, index) => bytes[index] === value),
  "image/webp": (bytes) => String.fromCharCode(...bytes.subarray(0, 4)) === "RIFF" && String.fromCharCode(...bytes.subarray(8, 12)) === "WEBP",
};

/** Exactly one form entry, which must be a JPEG, PNG or WebP file of at most 4 MB whose bytes match its type. */
export async function validatePhotoForm(form: FormData): Promise<PhotoValidation> {
  const entries = [...form.entries()];
  const file = entries[0]?.[1];
  if (entries.length !== 1 || !(file instanceof File)) return { ok: false, error: "invalid-count", status: 400 };
  if (file.size > MODEL3D_MAX_PHOTO_BYTES) return { ok: false, error: "too-large", status: 413 };
  const matches = SIGNATURES[file.type as keyof typeof SIGNATURES];
  if (!matches || file.size === 0 || !matches(new Uint8Array(await file.slice(0, 12).arrayBuffer()))) return { ok: false, error: "invalid-type", status: 415 };
  return { ok: true, file };
}
