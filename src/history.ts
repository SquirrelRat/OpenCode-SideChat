import { existsSync } from "node:fs";
import { promises as fs } from "node:fs";
import { HISTORY_DIR, HISTORY_FILE, MAX_HISTORY_ENTRIES } from "./constants";
import { extractParts, type ExtractedToolCall } from "./parts";
import type { SideDialogState, HistoryEntry, HistoryMessage } from "./types";

// Write queue: serialize all writes to prevent TOCTOU race conditions
let writeQueue: Promise<void> = Promise.resolve();

async function ensureDir(): Promise<void> {
  try {
    await fs.mkdir(HISTORY_DIR, { recursive: true });
  } catch (err: any) {
    if (err?.code !== "EEXIST") throw err;
  }
}

function isValidHistoryEntry(entry: unknown): entry is HistoryEntry {
  if (!entry || typeof entry !== "object") return false;
  const obj = entry as Record<string, unknown>;
  return (
    typeof obj.id === "string" &&
    typeof obj.created === "number" &&
    typeof obj.updated === "number" &&
    typeof obj.model === "string" &&
    typeof obj.title === "string" &&
    Array.isArray(obj.messages)
  );
}

export async function loadHistory(): Promise<HistoryEntry[]> {
  try {
    if (!existsSync(HISTORY_FILE)) return [];
    const raw = await fs.readFile(HISTORY_FILE, "utf-8");
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    // Validate entries, filter invalid ones
    const valid = parsed.filter((entry: unknown) => {
      if (!isValidHistoryEntry(entry)) {
        console.warn("[SideChat] Skipping invalid history entry:", entry);
        return false;
      }
      return true;
    });
    return valid;
  } catch (err) {
    console.error("[SideChat] Failed to load history:", err);
    return [];
  }
}

function writeHistory(entries: HistoryEntry[]): Promise<void> {
  return fs.writeFile(HISTORY_FILE, JSON.stringify(entries, null, 2), "utf-8");
}

export async function saveEntry(entry: HistoryEntry): Promise<void> {
  // Serialize writes via queue to prevent TOCTOU
  writeQueue = writeQueue.then(async () => {
    try {
      await ensureDir();
      const existing = await loadHistory();
      const idx = existing.findIndex((e) => e.id === entry.id);
      if (idx !== -1) {
        entry.created = existing[idx].created;
        existing[idx] = entry;
      } else {
        existing.unshift(entry);
      }
      const pruned = existing.slice(0, MAX_HISTORY_ENTRIES);
      await writeHistory(pruned);
    } catch (err) {
      console.error("[SideChat] Failed to save history entry:", err);
    }
  });
  // Return the queued promise so callers can await completion
  return writeQueue;
}

export async function deleteEntry(id: string): Promise<void> {
  writeQueue = writeQueue.then(async () => {
    try {
      await ensureDir();
      const existing = await loadHistory();
      const filtered = existing.filter((e) => e.id !== id);
      await writeHistory(filtered);
    } catch (err) {
      console.error("[SideChat] Failed to delete history entry:", err);
    }
  });
  return writeQueue;
}

export function buildHistoryEntry(
  state: SideDialogState,
  modelName: string,
): HistoryEntry | null {
  const msgs = state.entries
    .map((entry) => {
      const { texts, reasoning, tools } = extractParts(entry.parts);

      // Convert ExtractedToolCall to HistoryToolCall format
      const historyTools: HistoryMessage["tools"] = tools.map((tc: ExtractedToolCall) => ({
        tool: tc.tool,
        title: tc.title,
        status: tc.status,
        duration: tc.duration,
      }));

      if (texts.length === 0 && reasoning.length === 0 && tools.length === 0) return null;

      const msg: HistoryMessage = {
        role: entry.info.role as "user" | "assistant",
        text: texts.join("\n"),
      };
      if (reasoning.length > 0) msg.reasoning = reasoning;
      if (historyTools.length > 0) msg.tools = historyTools;
      return msg;
    })
    .filter((m): m is NonNullable<typeof m> => m !== null);

  if (msgs.length === 0) return null;

  const sessionID = state.entries[0]?.info?.sessionID ?? crypto.randomUUID();
  const title = msgs[0]?.text?.slice(0, 80).replace(/\n/g, " ") || "Side chat";
  const now = Date.now();

  return {
    id: sessionID,
    created: now,
    updated: now,
    model: modelName,
    title,
    messages: msgs,
  };
}
