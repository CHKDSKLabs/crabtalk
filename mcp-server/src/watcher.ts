import { watch } from "chokidar";
import { join } from "path";
import type { FSWatcher } from "chokidar";

export type ChangeCallback = (changedPaths: string[]) => void;

const BATCH_INTERVAL_MS = 3000;

export class FileWatcher {
  private watcher: FSWatcher | null = null;
  private pendingChanges = new Set<string>();
  private batchTimer: ReturnType<typeof setTimeout> | null = null;
  private callback: ChangeCallback;

  constructor(callback: ChangeCallback) {
    this.callback = callback;
  }

  start(claudeDir: string, syncPaths: string[]): void {
    const watchPaths = syncPaths.map((p) => join(claudeDir, p));

    this.watcher = watch(watchPaths, {
      ignoreInitial: true,
      awaitWriteFinish: { stabilityThreshold: 500, pollInterval: 100 },
      ignored: [
        /(^|[/\\])\../,
        "**/node_modules/**",
        "**/crabtalk.json",
      ],
    });

    this.watcher.on("add", (path) => this.queueChange(path));
    this.watcher.on("change", (path) => this.queueChange(path));
    this.watcher.on("unlink", (path) => this.queueChange(path));
  }

  stop(): void {
    if (this.batchTimer) clearTimeout(this.batchTimer);
    this.watcher?.close();
    this.watcher = null;
  }

  private queueChange(path: string): void {
    this.pendingChanges.add(path);

    if (this.batchTimer) clearTimeout(this.batchTimer);

    this.batchTimer = setTimeout(() => {
      const paths = Array.from(this.pendingChanges);
      this.pendingChanges.clear();
      this.callback(paths);
    }, BATCH_INTERVAL_MS);
  }
}
