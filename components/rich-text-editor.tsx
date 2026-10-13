"use client";

import { useEffect, useRef, useState, type ComponentType } from "react";
import {
  BoldIcon,
  ItalicIcon,
  UnderlineIcon,
  StrikeIcon,
  ListBulletIcon,
  ListNumberIcon,
  LinkIcon,
  RemoveFormatIcon,
} from "./icons";

interface Tool {
  label: string;
  title: string;
  Icon: ComponentType<{ width?: number; height?: number }>;
  run: () => void;
}

const TOOLS: Tool[] = [
  { label: "Bold", title: "Bold", Icon: BoldIcon, run: () => document.execCommand("bold") },
  { label: "Italic", title: "Italic", Icon: ItalicIcon, run: () => document.execCommand("italic") },
  { label: "Underline", title: "Underline", Icon: UnderlineIcon, run: () => document.execCommand("underline") },
  { label: "Strike", title: "Strikethrough", Icon: StrikeIcon, run: () => document.execCommand("strikeThrough") },
  { label: "Bullets", title: "Bulleted list", Icon: ListBulletIcon, run: () => document.execCommand("insertUnorderedList") },
  { label: "Numbers", title: "Numbered list", Icon: ListNumberIcon, run: () => document.execCommand("insertOrderedList") },
  {
    label: "Link",
    title: "Insert link",
    Icon: LinkIcon,
    run: () => {
      const url = window.prompt("Link URL", "https://");
      if (url) document.execCommand("createLink", false, url);
    },
  },
  { label: "Clear", title: "Clear formatting", Icon: RemoveFormatIcon, run: () => document.execCommand("removeFormat") },
];

/**
 * Lightweight contentEditable rich text editor. Emits sanitized-ready HTML on
 * every change. The DOM is owned by the browser, so we never write back to
 * `innerHTML` after mount — that would reset the caret mid-typing.
 */
export default function RichTextEditor({
  onChange,
  placeholder = "Write your message…",
}: {
  onChange: (html: string) => void;
  placeholder?: string;
}) {
  const editorRef = useRef<HTMLDivElement>(null);
  const [empty, setEmpty] = useState(true);

  useEffect(() => {
    editorRef.current?.focus();
  }, []);

  function emit() {
    const html = editorRef.current?.innerHTML ?? "";
    setEmpty(!editorRef.current?.textContent?.trim());
    onChange(html);
  }

  function exec(tool: Tool) {
    editorRef.current?.focus();
    tool.run();
    emit();
  }

  return (
    <div className="overflow-hidden rounded-[0.625rem] border border-[var(--color-border-strong)] bg-surface transition-shadow focus-within:border-[var(--color-primary)] focus-within:shadow-[0_0_0_3px_var(--color-primary-soft)]">
      <div className="flex flex-wrap items-center gap-0.5 border-b border-border bg-muted px-1.5 py-1">
        {TOOLS.map((tool) => (
          <button
            key={tool.label}
            type="button"
            title={tool.title}
            aria-label={tool.title}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => exec(tool)}
            className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-surface hover:text-foreground"
          >
            <tool.Icon width={16} height={16} />
          </button>
        ))}
      </div>

      <div className="relative">
        {empty && (
          <span className="pointer-events-none absolute left-3 top-2.5 text-sm text-slate-400">
            {placeholder}
          </span>
        )}
        <div
          ref={editorRef}
          contentEditable
          suppressContentEditableWarning
          role="textbox"
          aria-multiline="true"
          onInput={emit}
          onBlur={emit}
          className="min-h-[12rem] overflow-auto px-3 py-2.5 text-sm leading-relaxed text-foreground outline-none [&_a]:text-primary [&_a]:underline [&_blockquote]:border-l-4 [&_blockquote]:border-border [&_blockquote]:pl-3 [&_blockquote]:text-muted-foreground [&_h1]:mb-2 [&_h1]:text-xl [&_h1]:font-semibold [&_h2]:mb-2 [&_h2]:text-lg [&_h2]:font-semibold [&_h3]:mb-2 [&_h3]:text-base [&_h3]:font-semibold [&_li]:ml-5 [&_ol]:mb-3 [&_ol]:list-decimal [&_p]:mb-3 [&_ul]:mb-3 [&_ul]:list-disc"
        />
      </div>
    </div>
  );
}
