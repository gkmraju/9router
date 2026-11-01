import { IMAGE_SIGNATURES } from "../config/mediaConfig.js";

const EXTENSIONS = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/gif": "gif",
  "image/webp": "webp",
  "image/bmp": "bmp",
};

// The returned bytes are authoritative: upstream MIME and requested output_format
// can disagree with the actual image encoding.
export function detectImageMime(bytes) {
  for (const { sig, offset, mime, verifyWebp } of IMAGE_SIGNATURES) {
    if (bytes.length < offset + sig.length || !sig.every((byte, i) => bytes[offset + i] === byte)) continue;
    if (verifyWebp && (bytes.length < 12 || bytes.toString("ascii", 8, 12) !== "WEBP")) continue;
    return mime;
  }
  return "application/octet-stream";
}

export function createBinaryImageResponse(base64) {
  const bytes = Buffer.from(base64, "base64");
  const mime = detectImageMime(bytes);
  const ext = EXTENSIONS[mime] || "bin";
  return new Response(bytes, {
    headers: {
      "Content-Type": mime,
      "Content-Disposition": `inline; filename="image.${ext}"`,
      "Access-Control-Allow-Origin": "*",
    },
  });
}
