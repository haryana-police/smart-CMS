"use client";

import type { RefObject } from "react";

export function toggleVerbatimSelection(editor: HTMLElement) {
  const selection = editor.ownerDocument.getSelection();
  if (!selection || selection.isCollapsed || selection.rangeCount !== 1) return false;
  const range = selection.getRangeAt(0);
  if (!editor.contains(range.startContainer) || !editor.contains(range.endContainer)) return false;

  const walker = editor.ownerDocument.createTreeWalker(range.commonAncestorContainer, NodeFilter.SHOW_TEXT);
  const parts: { node: Text; start: number; end: number; mark: Element | null }[] = [];
  let current = walker.currentNode instanceof Text ? walker.currentNode : walker.nextNode();
  while (current) {
    const node = current as Text;
    const overlaps = range.comparePoint(node, node.length) >= 0 && range.comparePoint(node, 0) <= 0;
    if (overlaps && !node.parentElement?.closest('[contenteditable="false"]')) {
      const start = node === range.startContainer ? range.startOffset : 0;
      const end = node === range.endContainer ? range.endOffset : node.length;
      if (end > start) parts.push({ node, start, end, mark: node.parentElement?.closest("span[data-verbatim]") ?? null });
    }
    current = walker.nextNode();
  }
  if (!parts.length) return false;

  if (parts.every(({ mark }) => mark)) {
    for (const mark of new Set(parts.map(({ mark }) => mark))) {
      if (mark && editor.contains(mark)) mark.replaceWith(...mark.childNodes);
    }
  } else {
    for (const part of parts) {
      if (part.mark) continue;
      if (part.end < part.node.length) part.node.splitText(part.end);
      if (part.start > 0) part.node = part.node.splitText(part.start);
      part.start = 0;
      part.end = part.node.length;
      const mark = editor.ownerDocument.createElement("span");
      mark.setAttribute("data-verbatim", "");
      part.node.replaceWith(mark);
      mark.append(part.node);
    }
  }

  const first = parts[0];
  const last = parts[parts.length - 1];
  editor.focus();
  selection.setBaseAndExtent(first.node, first.start, last.node, last.end);
  return true;
}

export function VerbatimSelectionButton({ editorRef, onChange }: {
  editorRef: RefObject<HTMLDivElement | null>;
  onChange: () => void;
}) {
  return (
    <button
      type="button"
      title="चुने हुए टेक्स्ट की सुरक्षा लगाएँ या हटाएँ"
      onMouseDown={(event) => event.preventDefault()}
      onClick={() => {
        if (editorRef.current && toggleVerbatimSelection(editorRef.current)) onChange();
      }}
      className="no-print inline-flex items-center rounded border border-slate-300 px-2 py-1 text-xs font-semibold"
    >
      जैसा लिखा है वैसा रखें
    </button>
  );
}

export function HindiSuggestionChip({
  word,
  wrong,
  position,
  onAccept,
  onReject,
}: {
  word: string;
  wrong?: string;
  /** Viewport position of the flagged word; when absent the chip renders inline. */
  position?: { top: number; left: number };
  onAccept: () => void;
  onReject?: () => void;
}) {
  const floating =
    position && Number.isFinite(position.top) && position.top >= 0 && Number.isFinite(position.left);
  const acceptTitle = wrong ? `"${wrong}" को "${word}" में बदलें (सुझाव लागू करें)` : "सुझाव लागू करें";
  return (
    <div
      className={
        floating
          ? "no-print fixed z-50 flex items-center gap-1 rounded-lg border border-blue-300 bg-white p-0.5 shadow-lg"
          : "no-print inline-flex items-center gap-1 rounded-lg border border-blue-300 bg-white p-0.5 shadow-2xs"
      }
      style={
        floating
          ? { top: position!.top, left: position!.left }
          : undefined
      }
    >
      <button
        type="button"
        title={acceptTitle}
        onMouseDown={(event) => event.preventDefault()}
        onClick={onAccept}
        className="no-print inline-flex items-center rounded border border-blue-300 bg-blue-50 px-2 py-1 text-xs font-semibold text-blue-800 hover:bg-blue-100"
      >
        सुझाव · {word}
      </button>
      {onReject && (
        <button
          type="button"
          title="यह सुझाव अब न दिखाएँ"
          onMouseDown={(event) => event.preventDefault()}
          onClick={onReject}
          className="no-print inline-flex items-center rounded border border-slate-200 bg-white px-1.5 py-1 text-xs font-semibold text-slate-500 hover:bg-slate-100"
        >
          ✕
        </button>
      )}
    </div>
  );
}
