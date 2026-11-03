/**
 * Sharp image processor — inspects, validates, and re-encodes uploaded images.
 * Produces a main image and thumbnail with bounded sizes.
 */

import { createHash } from "node:crypto";
import sharp from "sharp";
import type { Sharp } from "sharp";
import { IMAGE_LIMITS, type AcceptedFormat } from "./image-config.js";

export interface ProcessedImage {
  mainBase64: string;
  thumbnailBase64: string;
  mimeType: string;
  /** Dimensions of the stored main image (after resizing). */
  widthPx: number;
  heightPx: number;
  /** Dimensions of the stored thumbnail. */
  thumbnailWidthPx: number;
  thumbnailHeightPx: number;
  /** Dimensions of the uploaded original (not stored). */
  originalWidthPx: number;
  originalHeightPx: number;
  mainSizeBytes: number;
  thumbnailSizeBytes: number;
  checksum: string;
}

interface SharpMetadata {
  format?: string;
  width?: number;
  height?: number;
  hasAlpha?: boolean;
  pages?: number;
}

async function inspectImage(buffer: Buffer): Promise<SharpMetadata> {
  try {
    const meta = await sharp(buffer).metadata();
    return {
      format: meta.format,
      width: meta.width,
      height: meta.height,
      hasAlpha: meta.hasAlpha,
      pages: meta.pages,
    };
  } catch {
    throw new Error("Could not read image metadata — file may be corrupt or not an image");
  }
}

function detectFormat(format: string | undefined): AcceptedFormat {
  if (!format) throw new Error("Unknown image format");
  const accepted = IMAGE_LIMITS.ACCEPTED_FORMATS as readonly string[];
  if (!accepted.includes(format)) {
    throw new Error(`Unsupported format: ${format}. Accepted: JPEG, PNG, WebP`);
  }
  return format as AcceptedFormat;
}

function computeDimensions(
  width: number,
  height: number,
  maxLongSide: number,
): { w: number; h: number } {
  if (width <= 0 || height <= 0) {
    throw new Error("Invalid dimensions");
  }
  const longSide = Math.max(width, height);
  if (longSide <= maxLongSide) {
    return { w: width, h: height };
  }
  const scale = maxLongSide / longSide;
  return {
    w: Math.round(width * scale),
    h: Math.round(height * scale),
  };
}

async function encodeToTargetSize(
  pipeline: Sharp,
  format: AcceptedFormat,
  width: number,
  height: number,
  maxBytes: number,
): Promise<Buffer> {
  let quality: number = IMAGE_LIMITS.QUALITY_STEPS[0]!;

  for (const q of IMAGE_LIMITS.QUALITY_STEPS) {
    quality = q;
    let buf: Buffer;

    const resizeOpts = {
      width,
      height,
      fit: "inside" as const,
      withoutEnlargement: true,
    };

    if (format === "jpeg") {
      buf = await pipeline.clone().resize(resizeOpts).jpeg({ quality, mozjpeg: true }).toBuffer();
    } else if (format === "png") {
      buf = await pipeline.clone().resize(resizeOpts).png({ quality, compressionLevel: 9, palette: true }).toBuffer();
    } else {
      buf = await pipeline.clone().resize(resizeOpts).webp({ quality }).toBuffer();
    }

    if (buf.length <= maxBytes) {
      return buf;
    }
  }

  // Reduce dimensions progressively
  let w = width;
  let h = height;
  for (let step = 0; step < 4; step++) {
    w = Math.round(w * 0.85);
    h = Math.round(h * 0.85);
    const resizeOpts = { width: w, height: h, fit: "inside" as const, withoutEnlargement: true };

    let buf: Buffer;
    if (format === "jpeg") {
      buf = await pipeline.clone().resize(resizeOpts).jpeg({ quality, mozjpeg: true }).toBuffer();
    } else if (format === "png") {
      buf = await pipeline.clone().resize(resizeOpts).png({ quality, compressionLevel: 9, palette: true }).toBuffer();
    } else {
      buf = await pipeline.clone().resize(resizeOpts).webp({ quality }).toBuffer();
    }

    if (buf.length <= maxBytes) {
      return buf;
    }
  }

  throw new Error("Could not meet size limit after all quality/dimension reduction steps");
}

function getMimeType(format: AcceptedFormat): string {
  switch (format) {
    case "jpeg": return "image/jpeg";
    case "png": return "image/png";
    case "webp": return "image/webp";
  }
}

function computeChecksum(buf: Buffer): string {
  return createHash("sha256").update(buf).digest("hex");
}

export async function processImage(inputBuffer: Buffer): Promise<ProcessedImage> {
  if (inputBuffer.length > IMAGE_LIMITS.MAX_INPUT_BYTES) {
    throw new Error(`Input too large: ${inputBuffer.length} bytes (max ${IMAGE_LIMITS.MAX_INPUT_BYTES})`);
  }

  const meta = await inspectImage(inputBuffer);
  const format = detectFormat(meta.format);

  // Reject animated/multipage
  if (meta.pages !== undefined && meta.pages > 1) {
    throw new Error("Animated or multipage images are not accepted");
  }

  const width = meta.width ?? 0;
  const height = meta.height ?? 0;
  if (width < IMAGE_LIMITS.MIN_DIMENSION || height < IMAGE_LIMITS.MIN_DIMENSION) {
    throw new Error(`Dimensions too small: ${width}x${height}`);
  }
  if (width * height > IMAGE_LIMITS.MAX_PIXELS) {
    throw new Error(`Image too large: ${width * height} pixels (max ${IMAGE_LIMITS.MAX_PIXELS})`);
  }

  // Base pipeline: apply orientation, strip metadata
  const basePipeline = sharp(inputBuffer, {
    autoOrient: true,
  }).rotate();

  const mainDims = computeDimensions(width, height, IMAGE_LIMITS.MAIN_MAX_LONG_SIDE);
  const thumbDims = computeDimensions(width, height, IMAGE_LIMITS.THUMBNAIL_MAX_LONG_SIDE);

  const mainBuf = await encodeToTargetSize(
    basePipeline, format, mainDims.w, mainDims.h, IMAGE_LIMITS.MAIN_MAX_BYTES,
  );

  const thumbnailBuf = await encodeToTargetSize(
    basePipeline, format, thumbDims.w, thumbDims.h, IMAGE_LIMITS.THUMBNAIL_MAX_BYTES,
  );

  const mimeType = getMimeType(format);
  const { encodeImageBytes } = await import("./base64-helpers.js");
  // Read the real output sizes: the size-limit loop may have shrunk them further.
  const [mainMeta, thumbMeta] = await Promise.all([sharp(mainBuf).metadata(), sharp(thumbnailBuf).metadata()]);

  return {
    mainBase64: encodeImageBytes(mainBuf),
    thumbnailBase64: encodeImageBytes(thumbnailBuf),
    mimeType,
    widthPx: mainMeta.width ?? mainDims.w,
    heightPx: mainMeta.height ?? mainDims.h,
    thumbnailWidthPx: thumbMeta.width ?? thumbDims.w,
    thumbnailHeightPx: thumbMeta.height ?? thumbDims.h,
    originalWidthPx: width,
    originalHeightPx: height,
    mainSizeBytes: mainBuf.length,
    thumbnailSizeBytes: thumbnailBuf.length,
    checksum: computeChecksum(mainBuf),
  };
}
