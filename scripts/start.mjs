#!/usr/bin/env node
import { existsSync } from "fs";
import { execFileSync, spawn } from "child_process";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const mcpServerDir = join(scriptDir, "..", "mcp-server");
const distPath = join(mcpServerDir, "dist", "index.js");

try {
  if (!existsSync(join(mcpServerDir, "node_modules"))) {
    console.error("[start] Installing dependencies...");
    execFileSync("npm", ["install"], { cwd: mcpServerDir, stdio: "inherit" });
  }

  if (!existsSync(distPath)) {
    console.error("[start] Building MCP server...");
    execFileSync("npm", ["run", "build"], { cwd: mcpServerDir, stdio: "inherit" });
  }

  const child = spawn("node", [distPath], { cwd: mcpServerDir, stdio: "inherit" });

  const forward = (signal) => {
    child.kill(signal);
  };

  process.on("SIGTERM", () => forward("SIGTERM"));
  process.on("SIGINT", () => forward("SIGINT"));

  child.on("close", (code) => {
    process.exit(code ?? 1);
  });

  child.on("error", (err) => {
    process.stderr.write(`[start] Failed to spawn server: ${err.message}\n`);
    process.exit(1);
  });
} catch (err) {
  process.stderr.write(`[start] Bootstrap failed: ${err.message}\n`);
  process.exit(1);
}
