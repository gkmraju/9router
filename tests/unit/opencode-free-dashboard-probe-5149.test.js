// Issue #5149: Dashboard probes for OpenCode Free can trigger upstream
// rate limits. Both test endpoints must fail closed without any network call
// or mutation of a previously working connection's status.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getApiKeys: vi.fn(),
  getProviderConnectionById: vi.fn(),
  updateProviderConnection: vi.fn(),
  resolveConnectionProxyConfig: vi.fn(),
}));

vi.mock("@/lib/localDb", () => ({
  getApiKeys: mocks.getApiKeys,
  getProviderConnectionById: mocks.getProviderConnectionById,
  updateProviderConnection: mocks.updateProviderConnection,
}));
vi.mock("@/lib/network/connectionProxy", () => ({
  resolveConnectionProxyConfig: mocks.resolveConnectionProxyConfig,
}));
vi.mock("@/lib/network/proxyTest", () => ({
  testProxyUrl: vi.fn(),
}));
vi.mock("@/shared/constants/config", () => ({
  UPDATER_CONFIG: { appPort: 20127 },
}));
vi.mock("@/shared/utils/machineId", () => ({
  getConsistentMachineId: vi.fn(async () => "cli-token"),
}));

const { pingModelByKind } = await import("../../src/app/api/models/test/ping.js");
const { testSingleConnection } = await import("../../src/app/api/providers/[id]/test/testUtils.js");

describe("OpenCode Free dashboard probe safety (#5149)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal("fetch", vi.fn());
    mocks.getApiKeys.mockResolvedValue([{ key: "test-key", isActive: true }]);
    mocks.getProviderConnectionById.mockResolvedValue({
      id: "opencode-connection",
      provider: "opencode",
      authType: "apikey",
      apiKey: "public",
      providerSpecificData: {},
    });
  });

  afterEach(() => vi.unstubAllGlobals());

  it.each(["oc/any-free-model", "opencode/any-free-model"])(
    "skips model ping %s before credentials or network access",
    async (model) => {
      const result = await pingModelByKind(model, "llm");
      expect(result).toMatchObject({ ok: false, skipped: true });
      expect(result.error).toMatch(/disabled/i);
      expect(mocks.getApiKeys).not.toHaveBeenCalled();
      expect(global.fetch).not.toHaveBeenCalled();
    },
  );

  it("skips saved-connection tests without marking the connection invalid", async () => {
    const result = await testSingleConnection("opencode-connection");
    expect(result).toMatchObject({ valid: false, skipped: true });
    expect(result.error).toMatch(/disabled/i);
    expect(mocks.resolveConnectionProxyConfig).not.toHaveBeenCalled();
    expect(mocks.updateProviderConnection).not.toHaveBeenCalled();
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("does not disable other providers' model tests", async () => {
    global.fetch.mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => JSON.stringify({
        choices: [{ message: { role: "assistant", content: "OK" } }],
      }),
    });
    const result = await pingModelByKind("openai/gpt-4o", "llm");
    expect(result.ok).toBe(true);
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });
});
