import { existsSync, mkdirSync } from "node:fs";
import { promises as fs } from "node:fs";
import * as path from "node:path";
import { HISTORY_DIR, HISTORY_FILE, MAX_HISTORY_ENTRIES } from "./constants";
import type { SideDialogState, HistoryEntry, HistoryMessage } from "./types";

function ensureDir(): void {
  mkdirSync(HISTORY_DIR, { recursive: true });
}

export async function loadHistory(): Promise<HistoryEntry[]> {
  try {
    if (!existsSync(HISTORY_FILE)) return [];
    const raw = await fs.readFile(HISTORY_FILE, "utf-8");
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed as HistoryEntry[];
  } catch (err) {
    console.error("[SideChat] Failed to load history:", err);
    return [];
  }
}

export async function saveEntry(entry: HistoryEntry): Promise<void> {
  try {
    ensureDir();
    const existing = await loadHistory();
    const idx = existing.findIndex((e) => e.id === entry.id);
    if (idx !== -1) {
      // Preserve original `created` timestamp
      entry.created = existing[idx].created;
      existing[idx] = entry;
    } else {
      existing.unshift(entry);
    }
    const pruned = existing.slice(0, MAX_HISTORY_ENTRIES);
    await fs.writeFile(HISTORY_FILE, JSON.stringify(pruned, null, 2), "utf-8");
  } catch (err) {
    console.error("[SideChat] Failed to save history entry:", err);
  }
}

export async function deleteEntry(id: string): Promise<void> {
  try {
    ensureDir();
    const existing = await loadHistory();
    const filtered = existing.filter((e) => e.id !== id);
    await fs.writeFile(HISTORY_FILE, JSON.stringify(filtered, null, 2), "utf-8");
  } catch (err) {
    console.error("[SideChat] Failed to delete history entry:", err);
  }
}

export function buildHistoryEntry(
  state: SideDialogState,
  modelName: string,
): HistoryEntry | null {
  const msgs = state.entries
    .map((entry) => {
      const textParts: string[] = [];
      const reasoning: Array<{ id: string; text: string }> = [];
      const tools: HistoryMessage["tools"] = [];

      for (const p of entry.parts) {
        if (p.type === "text" && p.text.trim()) {
          textParts.push(p.text.trim());
        } else if (p.type === "reasoning" && p.text) {
          reasoning.push({ id: p.id, text: p.text });
        } else if (p.type === "tool") {
          const ts = p.state;
          tools.push({
            tool: p.tool,
            title: "title" in ts ? (ts as any).title : undefined,
            status: ts.status,
            duration:
              "time" in ts && (ts as any).time?.start && (ts as any).time?.end
                ? ((ts as any).time.end - (ts as any).time.start)
                : undefined,
          });
        }
      }

      if (textParts.length === 0 && reasoning.length === 0 && tools.length === 0) return null;

      const msg: HistoryMessage = {
        role: entry.info.role as "user" | "assistant",
        text: textParts.join("\n"),
      };
      if (reasoning.length > 0) msg.reasoning = reasoning;
      if (tools.length > 0) msg.tools = tools;
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
