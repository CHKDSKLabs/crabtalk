const fs = require("fs");
const path = require("path");
const os = require("os");

const configPath = path.join(os.homedir(), ".claude", "crabtalk.json");

if (!fs.existsSync(configPath)) {
  const msg = JSON.stringify({
    systemMessage:
      "CrabTalk is installed but not configured. Run /crabtalk:setup to connect this device.",
  });
  process.stdout.write(msg);
  process.exit(0);
}

try {
  const config = JSON.parse(fs.readFileSync(configPath, "utf-8"));
  const deviceName = config.deviceName || "Unknown";
  const msg = JSON.stringify({
    systemMessage: `CrabTalk: ${deviceName} connecting to signal server...`,
  });
  process.stdout.write(msg);
} catch {
  const msg = JSON.stringify({
    systemMessage:
      "CrabTalk: config file corrupt. Run /crabtalk:setup to reconfigure.",
  });
  process.stdout.write(msg);
}
