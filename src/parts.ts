import type { Part } from "@opencode-ai/sdk/v2";

export type ExtractedToolCall = {
  tool: string;
  title?: string;
  status: string;
  input?: Record<string, unknown>;
  output?: string;
  error?: string;
  duration?: number;
  callID: string;
};

export type ExtractedReasoning = {
  id: string;
  text: string;
};

export type ExtractedParts = {
  texts: string[];
  reasoning: ExtractedReasoning[];
  tools: ExtractedToolCall[];
};

type RichToolState = {
  title?: string;
  input?: Record<string, unknown>;
  output?: string;
  error?: string;
  time?: { start: number; end: number };
  callID?: string;
};

export function extractParts(parts: Part[]): ExtractedParts {
  const texts: string[] = [];
  const reasoning: ExtractedReasoning[] = [];
  const tools: ExtractedToolCall[] = [];

  for (const p of parts) {
    if (p.type === "text") {
      if (p.text.trim()) texts.push(p.text.trim());
    } else if (p.type === "reasoning") {
      if (p.text) reasoning.push({ id: p.id, text: p.text });
    } else if (p.type === "tool") {
      const ts = p.state;
      const rts = ts as RichToolState;
      tools.push({
        tool: p.tool,
        title: rts.title,
        status: ts.status,
        input: rts.input,
        output: ts.status === "completed" ? rts.output : undefined,
        error: ts.status === "error" ? rts.error : undefined,
        duration:
          rts.time?.start && rts.time?.end
            ? rts.time.end - rts.time.start
            : undefined,
        callID: (p as any).callID ?? p.id,
      });
    }
  }

  return { texts, reasoning, tools };
}
