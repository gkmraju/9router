import { describe, expect, it, vi } from "vitest";

// Exercise the real request builder without fetching Qoder's private model catalog
// or uploading attachments. The behavior under test is entirely local.
vi.mock("../../open-sse/services/qoderModels.js", () => ({
  getQoderModelConfig: vi.fn(async () => ({
    key: "auto",
    max_input_tokens: 131072,
    max_output_tokens: 4096,
  })),
  resolveQoderModels: vi.fn(),
  isQoderPat: () => false,
  resolveQoderCredentials: vi.fn(),
}));
vi.mock("../../open-sse/shared/qoder/attachments.js", () => ({
  rewriteQoderMessageAttachments: vi.fn(async () => {}),
}));

import { __test__ as qoder } from "../../open-sse/executors/qoder.js";

const credentials = { providerSpecificData: { userId: "test-user" } };

async function payloadFor(region, messages) {
  const body = { messages };
  const built = await qoder.buildQoderRequestBody({
    model: "qoder/auto",
    body,
    credentials,
    region,
  });
  return built.payload;
}

describe("Qoder CN request-body system forwarding (#4995)", () => {
  it("forwards system and developer instructions in order to the first user turn", async () => {
    const input = [
      { role: "system", content: "Return JSON only" },
      { role: "developer", content: "Use outcome=allow" },
      { role: "user", content: "Review this change" },
      { role: "assistant", content: "Earlier answer" },
      { role: "user", content: "Review again" },
    ];
    const snapshot = structuredClone(input);
    const payload = await payloadFor("cn", input);

    expect(payload.system).toBe("Return JSON only\n\nUse outcome=allow");
    expect(payload.messages).toEqual([
      { role: "user", content: "Return JSON only\n\nUse outcome=allow\n\nReview this change" },
      { role: "assistant", content: "Earlier answer" },
      { role: "user", content: "Review again" },
    ]);
    expect(input).toEqual(snapshot);
  });

  it("does not fold instructions into user content for international Qoder", async () => {
    const payload = await payloadFor("intl", [
      { role: "system", content: "Return JSON only" },
      { role: "developer", content: "Use outcome=allow" },
      { role: "user", content: "Review this change" },
    ]);

    expect(payload.system).toBe("Return JSON only");
    expect(payload.messages).toEqual([
      { role: "developer", content: "Use outcome=allow" },
      { role: "user", content: "Review this change" },
    ]);
  });

  it("preserves images and text in multipart user content", async () => {
    const image = { type: "image_url", image_url: { url: "https://example.test/image.png" } };
    const input = [
      { role: "system", content: "Describe accurately" },
      { role: "user", content: [image, { type: "text", text: "What is shown?" }] },
    ];
    const payload = await payloadFor("cn", input);

    expect(payload.messages[0].content).toEqual([
      { type: "text", text: "Describe accurately" },
      image,
      { type: "text", text: "What is shown?" },
    ]);
    expect(input[1].content).toHaveLength(2);
  });

  it("does not fabricate a user turn if none exists", async () => {
    const payload = await payloadFor("cn", [
      { role: "system", content: "Return JSON only" },
      { role: "assistant", content: "Earlier answer" },
    ]);

    expect(payload.system).toBe("Return JSON only");
    expect(payload.messages).toEqual([{ role: "assistant", content: "Earlier answer" }]);
  });
});
