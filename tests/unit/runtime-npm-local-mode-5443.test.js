import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const filename = fileURLToPath(new URL("../../cli/hooks/sqliteRuntime.js", import.meta.url));
const nodeRequire = createRequire(filename);

function captureInstall(env) {
  const calls = [];
  const sandbox = {
    module: { exports: {} },
    exports: {},
    __dirname: path.dirname(filename),
    process: { ...process, env },
    Buffer,
    console,
    require(id) {
      if (id === "child_process") {
        return { execSync() {}, spawnSync(command, args, options) {
          calls.push({ command, args, options });
          return { status: 0, stderr: "", stdout: "" };
        } };
      }
      return nodeRequire(id);
    },
  };
  vm.runInNewContext(fs.readFileSync(filename, "utf8"), sandbox, { filename });
  const result = sandbox.module.exports.runNpmInstall({
    cwd: "/tmp/9router-runtime",
    pkgs: ["sql.js@1.14.1"],
    extraArgs: ["--ignore-scripts"],
  });
  return { result, call: calls[0] };
}

describe("runtime npm installation scope", () => {
  it.each([
    [{ npm_config_global: "true", npm_config_prefix: "/tmp/npm-global" }],
    [{ npm_config_location: "global", npm_config_prefix: "/tmp/npm-global" }],
    [{}],
  ])("forces project-local installs despite inherited npm settings", (env) => {
    const { result, call } = captureInstall({ ...process.env, ...env });
    expect(result.ok).toBe(true);
    expect(call.options.cwd).toBe("/tmp/9router-runtime");
    expect(call.args).toContain("--location=project");
    expect(call.args).toContain("--ignore-scripts");
    expect(call.options.env.npm_config_global).toBe("false");
    expect(call.options.env.npm_config_location).toBe("project");
    expect(call.options.env.npm_config_prefix).toBe(env.npm_config_prefix);
  });
});
