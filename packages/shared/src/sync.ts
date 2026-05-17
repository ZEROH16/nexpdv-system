export const SYNC_BATCH_SIZE = 50;
export const SYNC_RETRY_LIMIT = 5;

export type ConflictResolution = "local_wins" | "cloud_wins" | "merge";

export interface SyncEnvelope<T = unknown> {
  entity: string;
  entityId: string;
  operation: "create" | "update" | "delete";
  payload: T;
  localUpdatedAt: string;
  deviceId: string;
}

export interface SyncResult {
  accepted: string[];
  rejected: Array<{ id: string; reason: string }>;
  conflicts: Array<{ id: string; strategy: ConflictResolution; cloudPayload: unknown }>;
  serverTime: string;
}

export const resolveByUpdatedAt = (
  localUpdatedAt: string,
  cloudUpdatedAt: string
): ConflictResolution => {
  const localTime = new Date(localUpdatedAt).getTime();
  const cloudTime = new Date(cloudUpdatedAt).getTime();
  return localTime >= cloudTime ? "local_wins" : "cloud_wins";
};
