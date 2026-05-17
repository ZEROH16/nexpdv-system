import type { BrowserWindow } from "electron";
import type { SyncQueueItem, SyncResult } from "@nexpdv/shared";
import { SYNC_BATCH_SIZE } from "@nexpdv/shared";
import type { LocalDatabase } from "./localDatabase";

export interface SyncState {
  online: boolean;
  running: boolean;
  pending: number;
  lastSyncAt?: string;
  lastError?: string;
}

export class SyncEngine {
  private timer?: NodeJS.Timeout;
  private state: SyncState = { online: false, running: false, pending: 0 };

  constructor(
    private readonly db: LocalDatabase,
    private readonly cloudUrl = process.env.NEXPDV_CLOUD_API_URL ?? "http://localhost:3333"
  ) {}

  start(window: BrowserWindow): void {
    this.timer = setInterval(() => {
      this.flush(window).catch((error) => {
        this.state = { ...this.state, running: false, online: false, lastError: error.message };
        window.webContents.send("sync:status", this.state);
      });
    }, 12_000);
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
  }

  getStatus(): SyncState {
    return { ...this.state, pending: this.db.getSyncQueue(10_000).length };
  }

  async flush(window?: BrowserWindow): Promise<SyncState> {
    if (this.state.running) return this.getStatus();
    const queue = this.db.getSyncQueue(SYNC_BATCH_SIZE);
    this.state = { ...this.state, running: true, pending: queue.length, lastError: undefined };
    window?.webContents.send("sync:status", this.state);

    if (!queue.length) {
      this.state = { online: true, running: false, pending: 0, lastSyncAt: new Date().toISOString() };
      window?.webContents.send("sync:status", this.state);
      return this.state;
    }

    try {
      const result = await this.push(queue);
      this.db.markSyncSuccess(result.accepted);
      result.rejected.forEach((item) => this.db.markSyncFailure(item.id, item.reason));
      result.conflicts.forEach((conflict) => this.db.markSyncFailure(conflict.id, `Conflito: ${conflict.strategy}`));
      this.state = {
        online: true,
        running: false,
        pending: this.db.getSyncQueue(10_000).length,
        lastSyncAt: result.serverTime
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : "Falha ao sincronizar.";
      queue.forEach((item) => this.db.markSyncFailure(item.id, message));
      this.state = {
        online: false,
        running: false,
        pending: this.db.getSyncQueue(10_000).length,
        lastError: message
      };
    }

    window?.webContents.send("sync:status", this.state);
    return this.state;
  }

  private async push(queue: SyncQueueItem[]): Promise<SyncResult> {
    const response = await fetch(`${this.cloudUrl}/sync/push`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-device-id": "desktop-demo"
      },
      body: JSON.stringify({ items: queue })
    });

    if (!response.ok) {
      throw new Error(`API indisponivel (${response.status})`);
    }

    return (await response.json()) as SyncResult;
  }
}
