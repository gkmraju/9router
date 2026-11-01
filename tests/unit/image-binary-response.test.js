import { describe, it, expect, vi } from "vitest";
import { createBinaryImageResponse, detectImageMime } from "../../open-sse/handlers/imageBinaryResponse.js";
import { handleImageGenerationCore } from "../../open-sse/handlers/imageGenerationCore.js";
import { getImageAdapter } from "../../open-sse/handlers/imageProviders/index.js";

const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0x10, 0x4a, 0x46]);
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const GIF = Buffer.from("GIF89a", "ascii");
const WEBP = Buffer.from("RIFF\x00\x00\x00\x00WEBP", "binary");
const BMP = Buffer.from([0x42, 0x4d, 0, 0]);
const UNKNOWN = Buffer.from([1, 2, 3, 4]);

describe("binary image response MIME", () => {
  it.each([
    ["JPEG", JPEG, "image/jpeg", "jpg"],
    ["PNG", PNG, "image/png", "png"],
    ["GIF", GIF, "image/gif", "gif"],
    ["WebP", WEBP, "image/webp", "webp"],
    ["BMP", BMP, "image/bmp", "bmp"],
    ["unknown", UNKNOWN, "application/octet-stream", "bin"],
    ["RIFF without WEBP marker", Buffer.from("RIFF\x00\x00\x00\x00WAVE", "binary"), "application/octet-stream", "bin"],
  ])("%s bytes determine both MIME and filename", async (_name, bytes, mime, ext) => {
    expect(detectImageMime(bytes)).toBe(mime);
    const response = createBinaryImageResponse(bytes.toString("base64"));
    expect(response.headers.get("Content-Type")).toBe(mime);
    expect(response.headers.get("Content-Disposition")).toBe(`inline; filename="image.${ext}"`);
    expect(response.headers.get("Access-Control-Allow-Origin")).toBe("*");
    expect(Buffer.from(await response.arrayBuffer())).toEqual(bytes);
  });

  it("returns JPEG headers for Cloudflare JPEG bytes even without output_format", async () => {
    const originalFetch = global.fetch;
    global.fetch = vi.fn().mockResolvedValue(new Response(
      JSON.stringify({ success: true, result: { image: JPEG.toString("base64") } }),
      { headers: { "Content-Type": "application/json" } }
    ));
    try {
      const result = await handleImageGenerationCore({
        body: { prompt: "a red apple" },
        modelInfo: { provider: "cloudflare-ai", model: "@cf/black-forest-labs/flux-1-schnell" },
        credentials: { apiKey: "test-key", providerSpecificData: { accountId: "test-account" } },
        binaryOutput: true,
      });
      expect(result.success).toBe(true);
      expect(result.response.headers.get("Content-Type")).toBe("image/jpeg");
      expect(result.response.headers.get("Content-Disposition")).toContain("image.jpg");
      expect(Buffer.from(await result.response.arrayBuffer())).toEqual(JPEG);
    } finally {
      global.fetch = originalFetch;
    }
  });

  it("uses actual bytes for executor-backed images, ignoring requested PNG format", async () => {
    const adapter = getImageAdapter("grok-web");
    const stub = vi.spyOn(adapter, "executeViaExecutor").mockResolvedValue({
      created: 1, data: [{ b64_json: JPEG.toString("base64") }],
    });
    try {
      const result = await handleImageGenerationCore({
        body: { prompt: "a red apple", output_format: "png" },
        modelInfo: { provider: "grok-web", model: "grok-imagine-image" },
        credentials: {},
        binaryOutput: true,
      });
      expect(result.success).toBe(true);
      expect(result.response.headers.get("Content-Type")).toBe("image/jpeg");
      expect(Buffer.from(await result.response.arrayBuffer())).toEqual(JPEG);
    } finally {
      stub.mockRestore();
    }
  });
});
