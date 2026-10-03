import type { PDFDocumentProxy, PDFPageProxy, TextItem } from "pdfjs-dist/types/src/display/api";
import { cropRenderMatrix, type CropFrame } from "@/lib/floorplan/frames";
import type { TextBox } from "@/lib/floorplan/labels";

/**
 * A floor-plan picture held only in this browser: one PDF page (rendered sharp at any scale) or one
 * raster image. Units are PDF points or image pixels, y down.
 */
export interface PlanSource {
  kind: "pdf" | "image";
  name: string;
  width: number;
  height: number;
  /** Renders a crop of the source at `pxPerUnit` pixels per unit onto white. */
  render(frame: CropFrame, pxPerUnit: number): Promise<HTMLCanvasElement>;
  /** Text labels (PDF text layer); none for images. */
  text(): Promise<TextBox[]>;
}

export const MAX_PDF_BYTES = 30 * 1024 * 1024;
export const MAX_IMAGE_PIXELS = 40_000_000;
export const PLAN_FILE_TYPES = "application/pdf,image/png,image/jpeg,image/webp";

export type SourceErrorCode = "unsupported" | "too-large" | "encrypted" | "unreadable" | "pdf-unavailable";

export class SourceError extends Error {
  constructor(readonly code: SourceErrorCode) {
    super(code);
  }
}

function whiteCanvas(width: number, height: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(width));
  canvas.height = Math.max(1, Math.round(height));
  const context = canvas.getContext("2d");
  if (!context) throw new SourceError("unreadable");
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, canvas.width, canvas.height);
  return [canvas, context];
}

type PdfModule = typeof import("pdfjs-dist");
let pdfModule: Promise<PdfModule> | null = null;

/** pdf.js, loaded on first use with its worker; a failed load can be retried. */
function loadPdfJs(): Promise<PdfModule> {
  pdfModule ??= import("pdfjs-dist").then((pdfjs) => {
    pdfjs.GlobalWorkerOptions.workerPort ??= new Worker(new URL("pdfjs-dist/build/pdf.worker.min.mjs", import.meta.url), { type: "module" });
    return pdfjs;
  }).catch((error: unknown) => {
    pdfModule = null;
    throw error;
  });
  return pdfModule;
}

export interface PdfPlan {
  name: string;
  pageCount: number;
  thumbnail(page: number, maxSide: number): Promise<HTMLCanvasElement>;
  source(page: number): Promise<PlanSource>;
  close(): void;
}

function pdfSource(name: string, page: PDFPageProxy): PlanSource {
  const viewport = page.getViewport({ scale: 1 });
  let texts: Promise<TextBox[]> | null = null;
  return {
    kind: "pdf",
    name,
    width: viewport.width,
    height: viewport.height,
    async render(frame, pxPerUnit) {
      const [canvas] = whiteCanvas(frame.width * pxPerUnit, frame.height * pxPerUnit);
      await page.render({ canvas, viewport, transform: cropRenderMatrix(frame, pxPerUnit), background: "#ffffff" }).promise;
      return canvas;
    },
    text() {
      texts ??= page.getTextContent().then((content) => content.items.filter((item): item is TextItem => "str" in item && item.str.trim().length > 0).map((item) => {
        const [x, baseline] = viewport.convertToViewportPoint(item.transform[4], item.transform[5]);
        const height = Math.hypot(item.transform[2], item.transform[3]) || item.height;
        return { text: item.str, x, y: baseline - height, width: item.width, height };
      }));
      return texts;
    },
  };
}

export async function openPdf(file: File): Promise<PdfPlan> {
  if (file.size > MAX_PDF_BYTES) throw new SourceError("too-large");
  let pdfjs: PdfModule;
  try {
    pdfjs = await loadPdfJs();
  } catch {
    throw new SourceError("pdf-unavailable");
  }
  const task = pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) });
  let pdfDocument: PDFDocumentProxy;
  try {
    pdfDocument = await task.promise;
  } catch (error) {
    void task.destroy();
    throw new SourceError(error instanceof Error && error.name === "PasswordException" ? "encrypted" : "unreadable");
  }
  const pages = new Map<number, Promise<PDFPageProxy>>();
  const page = (number: number) => {
    if (!pages.has(number)) pages.set(number, pdfDocument.getPage(number));
    return pages.get(number)!;
  };
  return {
    name: file.name,
    pageCount: pdfDocument.numPages,
    async thumbnail(number, maxSide) {
      const proxy = await page(number);
      const viewport = proxy.getViewport({ scale: 1 });
      const scale = maxSide / Math.max(viewport.width, viewport.height);
      const [canvas] = whiteCanvas(viewport.width * scale, viewport.height * scale);
      await proxy.render({ canvas, viewport: proxy.getViewport({ scale }), background: "#ffffff" }).promise;
      return canvas;
    },
    async source(number) {
      return pdfSource(file.name, await page(number));
    },
    close() {
      void task.destroy();
    },
  };
}

export async function openImage(file: File): Promise<PlanSource> {
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch {
    throw new SourceError("unreadable");
  }
  if (bitmap.width * bitmap.height > MAX_IMAGE_PIXELS) {
    bitmap.close();
    throw new SourceError("too-large");
  }
  return {
    kind: "image",
    name: file.name,
    width: bitmap.width,
    height: bitmap.height,
    async render(frame, pxPerUnit) {
      const [canvas, context] = whiteCanvas(frame.width * pxPerUnit, frame.height * pxPerUnit);
      context.imageSmoothingQuality = "high";
      context.setTransform(...cropRenderMatrix(frame, pxPerUnit));
      context.drawImage(bitmap, 0, 0);
      return canvas;
    },
    async text() {
      return [];
    },
  };
}

export function isPdf(file: File): boolean {
  return file.type === "application/pdf" || /\.pdf$/i.test(file.name);
}

export function isPlanImage(file: File): boolean {
  return ["image/png", "image/jpeg", "image/webp"].includes(file.type);
}

/** A canvas as a PNG object URL for display; the caller revokes it. */
export async function canvasUrl(canvas: HTMLCanvasElement): Promise<string> {
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
  if (!blob) throw new SourceError("unreadable");
  return URL.createObjectURL(blob);
}
