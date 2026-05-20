/** @jsxImportSource @opentui/solid */
import { createMemo, For } from "solid-js";

type InlinePart =
  | { type: "text" | "code" | "bold" | "italic"; text: string }
  | { type: "link"; text: string; url: string };

type RenderBlock =
  | { type: "line"; style?: "heading" | "blockquote" | "listitem" | "hr"; parts: InlinePart[] }
  | { type: "codeblock"; codeText: string };

export function searchSpecialChar(text: string): number {
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === "`" || c === "*" || (c === "[" && text.includes("](", i))) {
      return i;
    }
  }
  return -1;
}

export function renderInlineMarkdown(text: string): InlinePart[] {
  const parts: InlinePart[] = [];
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
      const linkText = remaining.slice(1, closeBracket);
      const linkUrl = remaining.slice(closeBracket + 2, closeParen);
      parts.push({ type: "link", text: linkText, url: linkUrl });
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

export function RenderMarkdown(props: { text: string; theme: import("@opencode-ai/plugin/tui").TuiThemeCurrent }) {
  const t = props.theme;

  const lines = createMemo((): RenderBlock[] => {
    const text = props.text;
    const result: RenderBlock[] = [];

    let inCodeBlock = false;
    let codeBuffer = "";

    for (const rawLine of text.split("\n")) {
      if (rawLine.startsWith("```")) {
        if (inCodeBlock) {
          result.push({ type: "codeblock", codeText: codeBuffer });
          codeBuffer = "";
        }
        inCodeBlock = !inCodeBlock;
        continue;
      }
      if (inCodeBlock) {
        codeBuffer += (codeBuffer ? "\n" : "") + rawLine;
        continue;
      }

      // Detect block-level styles
      let line = rawLine;
      let style: "heading" | "blockquote" | "listitem" | "hr" | undefined;

      if (/^#{1,6}\s/.test(line)) {
        style = "heading";
        line = line.replace(/^#{1,6}\s+/, "");
      } else if (line.startsWith("> ")) {
        style = "blockquote";
        line = line.slice(2);
      } else if (/^[-*]\s/.test(line)) {
        style = "listitem";
        line = line.replace(/^[-*]\s/, "");
      } else if (/^\d+\.\s/.test(line)) {
        style = "listitem";
        // Keep number prefix (1., 2. etc.) visible
      } else if (/^[-*=_]{3,}$/.test(line)) {
        style = "hr";
        line = "";
      }

      result.push({ type: "line", style, parts: renderInlineMarkdown(line) });
    }

    if (inCodeBlock && codeBuffer) {
      result.push({ type: "codeblock", codeText: codeBuffer });
    }

    return result;
  });

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
              <text fg={t.markdownCodeBlock}>{block.codeText}</text>
            </box>
          );
        }

        const s = block.style;
        let textColor: import("@opentui/core").RGBA;
        if (s === "heading") {
          textColor = t.markdownHeading;
        } else if (s === "blockquote") {
          textColor = t.markdownBlockQuote;
        } else if (s === "listitem") {
          textColor = t.markdownListItem;
        } else if (s === "hr") {
          textColor = t.markdownHorizontalRule;
        } else {
          textColor = t.markdownText;
        }

        if (s === "hr") {
          return <text fg={t.markdownHorizontalRule}>{"―".repeat(8)}</text>;
        }

        // Render inline parts with appropriate colors
        return (
          <box flexDirection="row" flexWrap="wrap" gap={0}>
            <For each={block.parts}>
              {(part) => {
                switch (part.type) {
                  case "bold":
                    return <text fg={t.markdownStrong}><b>{part.text}</b></text>;
                  case "italic":
                    return <text fg={t.markdownEmph}><i>{part.text}</i></text>;
                  case "code":
                    return <text fg={t.markdownCode}>{part.text}</text>;
                  case "link":
                    return (
                      <text fg={t.markdownLinkText}>
                        {part.text}<text fg={t.markdownLink}>{"(" + part.url + ")"}</text>
                      </text>
                    );
                  default:
                    return <text fg={textColor}>{part.text}</text>;
                }
              }}
            </For>
          </box>
        );
      }}
    </For>
  );
}
