#!/usr/bin/env node
import { createInterface } from "readline";
import { writeFile, readFile, mkdir } from "fs/promises";
import { existsSync } from "fs";
import { join } from "path";
import { homedir, platform } from "os";
import { exec } from "child_process";

const SIGNAL_URL = "https://claw.crabtalk.dev";
const AUTH_URL = "https://auth.crabtalk.dev";
const CONFIG_PATH = join(homedir(), ".claude", "crabtalk.json");

const CRAB_SPECIES = [
  "Fiddler", "Hermit", "Dungeness", "King", "Spider", "Coconut",
  "Horseshoe", "Blue", "Snow", "Stone", "Mud", "Ghost", "Porcelain",
  "Pea", "Sally Lightfoot", "Japanese Spider", "Decorator", "Boxing",
  "Yeti", "Vampire",
];

function openBrowser(url) {
  const cmd = platform() === "win32" ? `start "" "${url}"`
    : platform() === "darwin" ? `open "${url}"`
    : `xdg-open "${url}"`;
  exec(cmd, (err) => {
    if (err) console.error("  Couldn't open browser automatically. Navigate there yourself.");
  });
}

function prompt(rl, question) {
  return new Promise((resolve) => rl.question(question, resolve));
}

async function validateToken(token) {
  const res = await fetch(`${SIGNAL_URL}/api/auth/get-session`, {
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
  });
  if (!res.ok) return null;
  const data = await res.json();
  return data?.user?.id ?? null;
}

async function main() {
  console.log("\nCrabTalk Setup\n");
  console.log("Opening the auth page in your browser...\n");
  openBrowser(AUTH_URL);

  console.log(`If it didn't open, go to: ${AUTH_URL}\n`);
  console.log("Sign in (or create an account), then copy the token shown on the page.\n");

  const rl = createInterface({ input: process.stdin, output: process.stdout });

  const token = (await prompt(rl, "Paste your token here: ")).trim();

  if (!token) {
    console.error("\nNo token provided. Exiting.");
    rl.close();
    process.exit(1);
  }

  process.stdout.write("\nValidating token...");
  const userId = await validateToken(token).catch(() => null);

  if (!userId) {
    console.error(" invalid or expired.\n\nDouble-check the token and try again.");
    rl.close();
    process.exit(1);
  }

  console.log(" OK\n");

  const deviceName = CRAB_SPECIES[Math.floor(Math.random() * CRAB_SPECIES.length)];

  const config = {
    deviceName,
    userId,
    signalUrl: SIGNAL_URL,
    authToken: token,
    syncPaths: ["plugins/", "agents/", "settings.json", "CLAUDE.md", "keybindings.json"],
  };

  const claudeDir = join(homedir(), ".claude");
  if (!existsSync(claudeDir)) {
    await mkdir(claudeDir, { recursive: true });
  }

  await writeFile(CONFIG_PATH, JSON.stringify(config, null, 2));

  rl.close();

  console.log(`Device registered as "${deviceName}".`);
  console.log(`Config saved to ${CONFIG_PATH}.`);
  console.log("\nRestart Claude Code to connect.\n");
}

main().catch((err) => {
  console.error("\nSetup failed:", err.message);
  process.exit(1);
});
