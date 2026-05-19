/** @jsxImportSource @opentui/solid */
import { createMemo, For } from "solid-js";
import type { InputRenderable } from "@opentui/core";
import { THINKING_TEXT } from "../constants";
import type { OverlayState } from "../types";

const MAX_VISIBLE_MESSAGES = 20;

function renderInlineMarkdown(text: string) {
  const parts: Array<{ type: string; text: string }> = [];
  let remaining = text;

  while (remaining.length > 0) {
    if (remaining.startsWith("`")) {
      const end = remaining.indexOf("`", 1);
      if (end === -1) {
        parts.push({ type: "text", text: remaining });
        break;
      }
      parts.push({ type: "code", text: remaining.slice(1, end) });
      remaining = remaining.slice(end + 1);
    } else if (remaining.startsWith("**")) {
      const end = remaining.indexOf("**", 2);
      if (end === -1) {
        parts.push({ type: "text", text: remaining });
        break;
      }
      parts.push({ type: "bold", text: remaining.slice(2, end) });
      remaining = remaining.slice(end + 2);
    } else if (remaining.startsWith("*") && !remaining.startsWith("**")) {
      const end = remaining.indexOf("*", 1);
      if (end === -1) {
        parts.push({ type: "text", text: remaining });
        break;
      }
      parts.push({ type: "italic", text: remaining.slice(1, end) });
      remaining = remaining.slice(end + 1);
    } else if (remaining.startsWith("[") && remaining.includes("](")) {
      const closeBracket = remaining.indexOf("](");
      const closeParen = remaining.indexOf(")", closeBracket);
      if (closeParen === -1) {
        parts.push({ type: "text", text: remaining });
        break;
      }
      parts.push({ type: "text", text: remaining.slice(1, closeBracket) });
      remaining = remaining.slice(closeParen + 1);
    } else {
      const nextSpecial = searchSpecialChar(remaining);
      if (nextSpecial === -1) {
        parts.push({ type: "text", text: remaining });
        break;
      }
      if (nextSpecial > 0) {
        parts.push({ type: "text", text: remaining.slice(0, nextSpecial) });
      }
      remaining = remaining.slice(nextSpecial);
    }
  }

  return parts;
}

function searchSpecialChar(text: string): number {
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === "`" || c === "*" || (c === "[" && text.includes("](", i))) {
      return i;
    }
  }
  return -1;
}

export function SideChat(props: OverlayState & { width: number; transcriptHeight: number; tokenLimit: number }) {
  const theme = props.api.theme.current;
  let input: InputRenderable | undefined;
  let inputValue = "";

  const panelWidth = props.width;
  const contentWidth = props.width - 4;

  const msgs = createMemo(() => {
    const messages = props.state.entries
      .map((entry) => {
        const textParts: string[] = [];
        const reasoning: Array<{ id: string; text: string }> = [];

        for (const p of entry.parts) {
          if (p.type === "text") {
            if (p.text.trim()) textParts.push(p.text.trim());
          } else if (p.type === "reasoning") {
            if (p.text) reasoning.push({ id: p.id, text: p.text });
          }
        }

        if (textParts.length === 0 && reasoning.length === 0) return null;

        return {
          id: entry.info.id,
          role: entry.info.role as "user" | "assistant",
          text: textParts.join("\n"),
          reasoning,
        };
      })
      .filter((m): m is NonNullable<typeof m> => m !== null)
      .slice(-MAX_VISIBLE_MESSAGES);

    if (props.state.loading && props.state.streamingAnswer) {
      const streaming = props.state.streamingAnswer.trim();
      const last = messages[messages.length - 1];
      const lastText = last?.role === "assistant" ? last.text : "";
      if (streaming && streaming !== lastText) {
        messages.push({
          id: "__streaming__",
          role: "assistant",
          text: streaming,
          reasoning: [],
        });
      }
    }

    return messages;
  });

  const ctxLabel = createMemo(() => {
    const n = props.state.tokenCount ?? 0;
    if (n <= 0) return "";
    const current = n >= 1000 ? (n / 1000).toFixed(1) + "k" : String(n);
    const limit = props.tokenLimit >= 1000 ? (props.tokenLimit / 1000).toFixed(0) + "k" : String(props.tokenLimit);
    return current + "/" + limit + " ctx";
  });

  const shortModelName = createMemo(() => {
    const name = props.modelName;
    const parts = name.split("/");
    return parts.length >= 2 ? parts[parts.length - 1] : name;
  });

  const renderThinking = (r: { id: string; text: string }) => {
    if (!props.thinkCollapsed) {
      return (
        <box flexDirection="column">
          <text fg={theme.textMuted}>
            {"▼ thinking:"}
          </text>
          <text fg={theme.textMuted}>{r.text}</text>
        </box>
      );
    }

    const label = props.thinkConfig.showSummary
      ? "▶ thinking: " + r.text.slice(0, 60).replace(/\n/g, " ") + (r.text.length > 60 ? "..." : "")
      : "▶ thinking (" + r.text.length + " chars)";

    return <text fg={theme.textMuted}>{label}</text>;
  };

  return (
    <box
      position="absolute"
      bottom={0}
      right={0}
    >
      <box
        width={panelWidth}
        flexDirection="column"
        border={true}
        borderColor={theme.borderActive}
        backgroundColor={theme.backgroundPanel}
      >
        <box
          flexDirection="row"
          justifyContent="space-between"
          alignItems="center"
          paddingTop={1}
          paddingLeft={1}
          paddingRight={1}
        >
          <box flexDirection="row" gap={1} alignItems="center">
            <box paddingLeft={1} paddingRight={1} backgroundColor={theme.accent}>
              <text fg={theme.background}>
                <b>{"SideChat"}</b>
              </text>
            </box>
            <text fg={theme.success}>
              <b>{"[f]"}</b>
            </text>
          </box>
          <box flexDirection="row" gap={1} alignItems="center">
            <text fg={theme.textMuted}>{shortModelName()}</text>
            {ctxLabel() ? (
              <text fg={theme.textMuted}>{ctxLabel()}</text>
            ) : (
              <text>{""}</text>
            )}
          </box>
        </box>

        <box paddingLeft={1} paddingRight={1}>
          <scrollbox
            scrollY={true}
            stickyScroll={true}
            stickyStart="bottom"
            height={props.transcriptHeight}
            width={contentWidth}
          >
            <box flexDirection="column" gap={1} paddingTop={1} paddingBottom={1} width={contentWidth - 2}>
              {msgs().length > 0 ? (
                msgs().map((msg) => (
                  <box flexDirection="column" gap={0}>
                    <text fg={msg.role === "assistant" ? theme.secondary : theme.text}>
                      <b>{msg.role === "assistant" ? "A:" : "You:"}</b>
                    </text>
                    {msg.reasoning.map((r) => renderThinking(r))}
                    {msg.text ? (
                      <box flexDirection="column">
                        <RenderMarkdown text={msg.text} theme={theme} />
                      </box>
                    ) : (
                      <text>{""}</text>
                    )}
                  </box>
                ))
              ) : props.state.loading ? (
                <text fg={theme.textMuted}>{THINKING_TEXT}</text>
              ) : (
                <text>{""}</text>
              )}
              {props.state.error ? (
                <text fg={theme.error}>{"Error: " + String(props.state.error)}</text>
              ) : (
                <text>{""}</text>
              )}
            </box>
          </scrollbox>
        </box>

        <box paddingLeft={1} paddingRight={1}>
          <input
            ref={(node) => { input = node; props.onInput?.(node); }}
            width={contentWidth}
            placeholder={props.state.loading ? "..." : ">"}
            textColor={theme.text}
            placeholderColor={theme.textMuted}
            backgroundColor={theme.backgroundElement}
            focusedTextColor={theme.text}
            cursorColor={theme.primary}
            focusedBackgroundColor={theme.backgroundElement}
            onInput={(value) => {
              inputValue = value;
            }}
            onSubmit={() => {
              const submitted = (input?.value ?? inputValue).trim();
              if (!submitted || props.state.loading) return;
              if (!props.onSubmit(submitted)) return;
              inputValue = "";
              if (input) input.value = "";
            }}
          />
        </box>

        <box
          flexDirection="row"
          gap={1}
          paddingTop={0}
          paddingBottom={1}
          paddingLeft={1}
          paddingRight={1}
          alignItems="center"
        >
          <text fg={theme.secondary}><b>{"Alt+C"}</b></text>
          <text fg={theme.primary}>{"Clear"}</text>
          <text fg={theme.textMuted}>{"·"}</text>
          <text fg={theme.secondary}><b>{"Alt+T"}</b></text>
          <text fg={theme.primary}>{"Thinking"}</text>
          <text fg={theme.textMuted}>{props.thinkCollapsed ? "" : "(on)"}</text>
          <text fg={theme.textMuted}>{"·"}</text>
          <text fg={theme.secondary}><b>{"Tab"}</b></text>
          <text fg={theme.primary}>{"Model"}</text>
        </box>
      </box>
    </box>
  );
}

function RenderMarkdown(props: { text: string; theme: import("@opencode-ai/plugin/tui").TuiThemeCurrent }) {
  const lines = createMemo(() => {
    const text = props.text;
    const result: Array<{ type: "line" | "codeblock"; parts: Array<{ type: string; text: string }>; codeText?: string }> = [];
    let inCodeBlock = false;
    let codeBuffer = "";

    for (const line of text.split("\n")) {
      if (line.startsWith("```")) {
        if (inCodeBlock) {
          result.push({ type: "codeblock", parts: [], codeText: codeBuffer });
          codeBuffer = "";
        }
        inCodeBlock = !inCodeBlock;
        continue;
      }
      if (inCodeBlock) {
        codeBuffer += (codeBuffer ? "\n" : "") + line;
        continue;
      }

      const parts = renderInlineMarkdown(line);
      result.push({ type: "line", parts });
    }

    if (inCodeBlock && codeBuffer) {
      result.push({ type: "codeblock", parts: [], codeText: codeBuffer });
    }

    return result;
  });

  const t = props.theme;

  return (
    <For each={lines()}>
      {(block) => {
        if (block.type === "codeblock") {
          return (
            <box
              backgroundColor={t.backgroundElement}
              paddingLeft={1}
              paddingRight={1}
            >
              <text fg={t.markdownCode}>{block.codeText}</text>
            </box>
          );
        }
        return (
          <box flexDirection="row" flexWrap="wrap" gap={0}>
              <For each={block.parts}>
                {(part) => {
                  if (part.type === "bold") return <text><b>{part.text}</b></text>;
                  if (part.type === "italic") return <text><i>{part.text}</i></text>;
                  if (part.type === "code") return <text fg={t.markdownCode}>{part.text}</text>;
                  return <text>{part.text}</text>;
                }}
              </For>
          </box>
        );
      }}
    </For>
  );
}
