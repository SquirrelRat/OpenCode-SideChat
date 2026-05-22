/** @jsxImportSource @opentui/solid */
import { createSignal } from "solid-js";

type ChatInputProps = {
  loading: boolean;
  width: number;
  theme: import("@opencode-ai/plugin/tui").TuiThemeCurrent;
  onSubmit: (value: string) => boolean;
  onInput: (node: { focus: () => void } | undefined) => void;
};

export function ChatInput(props: ChatInputProps) {
  let input: any;
  const [inputValue, setInputValue] = createSignal("");

  return (
    <box paddingLeft={1} paddingRight={1}>
      <input
        ref={(node) => {
          input = node;
          props.onInput?.(node);
        }}
        width={props.width}
        placeholder={props.loading ? "..." : ">"}
        textColor={props.theme.text}
        placeholderColor={props.theme.textMuted}
        backgroundColor={props.theme.backgroundElement}
        focusedTextColor={props.theme.text}
        cursorColor={props.theme.primary}
        focusedBackgroundColor={props.theme.backgroundElement}
        onInput={(value: string) => {
          setInputValue(value);
        }}
        onSubmit={() => {
          const submitted = (input?.value ?? inputValue()).trim();
          if (!submitted || props.loading) return;
          if (!props.onSubmit(submitted)) return;
          setInputValue("");
          if (input) input.value = "";
        }}
      />
    </box>
  );
}
