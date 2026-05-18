// stoa/src/mesh.ts — Inter-agent message bus (git-backed)
//
// Agents communicate by reading/writing JSON files in memory/mesh/.
// Each agent has an inbox: memory/mesh/{agent-name}.json
// Messages are append-only, pruned by TTL and max_history.

import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import type { MeshMessage, StoaConfig } from "./types.js";

const MESH_DIR = "memory/mesh";

function ensureDir(): void {
  if (!existsSync(MESH_DIR)) {
    mkdirSync(MESH_DIR, { recursive: true });
  }
}

function inboxPath(agent: string): string {
  return `${MESH_DIR}/${agent}.json`;
}

/** Read all messages in an agent's inbox */
export function readInbox(agent: string): MeshMessage[] {
  const path = inboxPath(agent);
  if (!existsSync(path)) return [];

  try {
    const raw = readFileSync(path, "utf-8");
    return JSON.parse(raw) as MeshMessage[];
  } catch (e) {
    console.error(`[stoa mesh] failed to read inbox for ${agent}:`, e instanceof Error ? e.message : e);
    return [];
  }
}

/** Read only new messages (filter by type and/or sender) */
export function readMessages(
  agent: string,
  filter?: { from?: string; type?: string }
): MeshMessage[] {
  let messages = readInbox(agent);

  if (filter?.from) {
    messages = messages.filter((m) => m.from === filter.from);
  }
  if (filter?.type) {
    messages = messages.filter((m) => m.type === filter.type);
  }

  return messages;
}

/** Post a message to one or more agent inboxes */
export function postMessage(
  message: Omit<MeshMessage, "id" | "timestamp">
): void {
  ensureDir();

  const fullMessage: MeshMessage = {
    ...message,
    id: `${message.from}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    timestamp: new Date().toISOString(),
  };

  const recipients = Array.isArray(message.to) ? message.to : [message.to];

  for (const recipient of recipients) {
    const inbox = readInbox(recipient);
    inbox.push(fullMessage);
    writeFileSync(inboxPath(recipient), JSON.stringify(inbox, null, 2));
  }
}

/** Prune old messages based on TTL and max history */
export function pruneInbox(
  agent: string,
  config: StoaConfig["mesh"]
): void {
  const messages = readInbox(agent);
  const cutoff = Date.now() - config.ttl_hours * 60 * 60 * 1000;

  const pruned = messages
    .filter((m) => new Date(m.timestamp).getTime() > cutoff)
    .slice(-config.max_history);

  writeFileSync(inboxPath(agent), JSON.stringify(pruned, null, 2));
}

/** Clear an agent's inbox after processing */
export function clearInbox(agent: string): void {
  writeFileSync(inboxPath(agent), JSON.stringify([], null, 2));
}

/** Check if any agent has posted a halt message */
export function isHalted(agent: string): boolean {
  const messages = readInbox(agent);
  const halts = messages.filter((m) => m.type === "halt");

  if (halts.length === 0) return false;

  const latest = halts[halts.length - 1];
  const cooldownUntil = latest.data?.cooldown_until as string | undefined;

  if (cooldownUntil && new Date(cooldownUntil).getTime() > Date.now()) {
    return true;
  }

  return false;
}

/** Acknowledge messages by marking them as processed */
export function acknowledgeMessages(agent: string, messageIds: string[]): void {
  const messages = readInbox(agent);
  const idSet = new Set(messageIds);

  const updated = messages.map((m) => {
    if (idSet.has(m.id)) {
      return { ...m, data: { ...m.data, _acknowledged: true, _ack_at: new Date().toISOString() } };
    }
    return m;
  });

  writeFileSync(inboxPath(agent), JSON.stringify(updated, null, 2));
}

/** Get only unacknowledged messages */
export function getUnacknowledgedMessages(agent: string): MeshMessage[] {
  const messages = readInbox(agent);
  return messages.filter((m) => !m.data?._acknowledged);
}

/** Get mesh statistics */
export function getMeshStats(): Record<string, { total: number; unread: number }> {
  const { readdirSync } = require("fs");
  const stats: Record<string, { total: number; unread: number }> = {};

  if (!existsSync(MESH_DIR)) return stats;

  const files: string[] = readdirSync(MESH_DIR).filter((f: string) => f.endsWith(".json"));
  for (const f of files) {
    const agent = f.replace(".json", "");
    const messages = readInbox(agent);
    const unread = messages.filter((m) => !m.data?._acknowledged).length;
    stats[agent] = { total: messages.length, unread };
  }

  return stats;
}
