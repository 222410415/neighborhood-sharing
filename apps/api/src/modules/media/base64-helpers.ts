/**
 * Base64 encode/decode helpers.
 * Base64 is not encryption — it's an encoding for storing image bytes in Firestore.
 */

import { Buffer } from "node:buffer";

/**
 * Encode raw bytes to a Base64 string.
 */
export function encodeImageBytes(bytes: Buffer): string {
  return bytes.toString("base64");
}

/**
 * Decode a Base64 string to raw bytes.
 * Throws on malformed input.
 */
export function decodeImageBytes(base64: string): Buffer {
  if (!base64 || typeof base64 !== "string") {
    throw new Error("Invalid Base64: empty or non-string input");
  }

  // Strip any data-URL prefix that shouldn't be present
  const cleaned = base64.replace(/^data:[^;]+;base64,/, "");

  // Validate Base64 charset and padding
  if (!/^[A-Za-z0-9+/]*={0,2}$/.test(cleaned)) {
    throw new Error("Invalid Base64: contains invalid characters");
  }

  if (cleaned.length % 4 !== 0) {
    throw new Error("Invalid Base64: incorrect padding");
  }

  try {
    const buf = Buffer.from(cleaned, "base64");
    if (buf.length === 0) {
      throw new Error("Invalid Base64: decoded to empty");
    }
    return buf;
  } catch {
    throw new Error("Invalid Base64: decode failed");
  }
}

/**
 * Validate that a string is valid Base64 without decoding.
 */
export function isValidBase64(value: string): boolean {
  if (!value || typeof value !== "string") return false;
  const cleaned = value.replace(/^data:[^;]+;base64,/, "");
  if (!/^[A-Za-z0-9+/]*={0,2}$/.test(cleaned)) return false;
  if (cleaned.length % 4 !== 0) return false;
  return true;
}

/**
 * Estimate the decoded size of a Base64 string in bytes.
 */
export function estimatedDecodedBytes(base64: string): number {
  const cleaned = base64.replace(/^data:[^;]+;base64,/, "");
  const padding = (cleaned.match(/=+$/) ?? [])[0]?.length ?? 0;
  return Math.floor((cleaned.length * 3) / 4) - padding;
}
