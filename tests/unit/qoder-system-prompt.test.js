import { describe, it, expect } from "vitest";
import { __test__ as qoder } from "../../open-sse/executors/qoder.js";

describe("Qoder CN system instruction forwarding (#4995)", () => {
  const { normalizeMessages, foldSystemIntoFirstUser } = qoder;

  it("prepends system text to the first user message without mutating inputs", () => {
    const original = [
      { role: "user", content: "What is 2+2?" },
      { role: "assistant", content: "4" },
      { role: "user", content: "And 3+3?" },
    ];
    const result = foldSystemIntoFirstUser(original, "Reply only BANANA");
    expect(result[0].content).toBe("Reply only BANANA\n\nWhat is 2+2?");
    expect(result[1]).toBe(original[1]);
    expect(result[2]).toBe(original[2]);
    expect(original[0].content).toBe("What is 2+2?");
  });

  it("keeps image blocks intact and prepends a text block", () => {
    const image = { type: "image_url", image_url: { url: "https://example.com/a.png" } };
    const original = [{ role: "user", content: [image, { type: "text", text: "Describe" }] }];
    const result = foldSystemIntoFirstUser(original, "Return JSON only");
    expect(result[0].content).toEqual([
      { type: "text", text: "Return JSON only" },
      image,
      { type: "text", text: "Describe" },
    ]);
    expect(original[0].content).toHaveLength(2);
  });

  it("does nothing when instructions are blank or there is no user turn", () => {
    const user = [{ role: "user", content: "hello" }];
    expect(foldSystemIntoFirstUser(user, "   ")).toBe(user);
    const assistant = [{ role: "assistant", content: "hello" }];
    expect(foldSystemIntoFirstUser(assistant, "rule")).toBe(assistant);
  });

  it("hoists developer instructions only when enabled for the CN provider", () => {
    const incoming = [
      { role: "system", content: "System rule" },
      { role: "developer", content: "Developer rule" },
      { role: "user", content: "hello" },
    ];
    const cn = normalizeMessages(incoming, { hoistDeveloper: true });
    expect(cn.systemText).toBe("System rule\n\nDeveloper rule");
    expect(cn.messages).toEqual([{ role: "user", content: "hello" }]);
    const intl = normalizeMessages(incoming);
    expect(intl.systemText).toBe("System rule");
    expect(intl.messages.map((m) => m.role)).toEqual(["developer", "user"]);
  });
});
