"use client";

import { useEffect, useRef, useState, useSyncExternalStore, type FormEvent } from "react";
import { useAuth } from "@/context/AuthContext";
import { suggestionStore } from "@/lib/suggestionStore";
import {
  HINDI_BOUNDARY_CHAR_RE,
  HINDI_WORD_CHAR_RE,
  blockContainsQuote,
  isFollowedByWordChar,
  isPrecededByWordChar,
  lookupHindiCorrection,
  normalizeHindi,
  suggestHindiFromCorpus,
  type HindiCorrectionBias,
} from "@/lib/hindiAutocorrect";

const preferenceEvent = "cms:hindi-autocorrect";
const sessionPreferences = new Map<string, boolean>();

function subscribe(callback: () => void) {
  window.addEventListener(preferenceEvent, callback);
  window.addEventListener("storage", callback);
  return () => {
    window.removeEventListener(preferenceEvent, callback);
    window.removeEventListener("storage", callback);
  };
}

export function useHindiAutocorrectPreference() {
  const { sessionUser } = useAuth();
  const key = sessionUser ? `cms:hindi-autocorrect:${sessionUser.id}` : null;
  const enabled = useSyncExternalStore(subscribe, () => {
    if (!key) return false;
    try {
      return localStorage.getItem(key) === "on";
    } catch {
      return sessionPreferences.get(key) ?? false;
    }
  }, () => false);

  return {
    enabled,
    toggle() {
      if (!key) return;
      try {
        localStorage.setItem(key, enabled ? "off" : "on");
      } catch {
        sessionPreferences.set(key, !enabled);
      }
      window.dispatchEvent(new Event(preferenceEvent));
    },
  };
}

const protectedText = 'blockquote, q, [contenteditable="false"], [data-verbatim]';

interface PendingCorrection {
  editor: HTMLDivElement;
  node: Text;
  snapshot: string;
  start: number;
  end: number;
  replacement: string;
  delimiter: string;
  /** The word as the officer typed it (learning key). */
  wrong: string;
  /** Viewport position of the flagged word for the floating chip. */
  top: number;
  left: number;
}

export function useHindiReportAutocorrect(protectedDocument: boolean) {
  const { enabled } = useHindiAutocorrectPreference();
  const typed = useRef<{ node: Text; start: number; end: number } | null>(null);

  // Officer learning state (personal silent/suppressed) + document corpus,
  // refreshed whenever the suggestion store notifies (Phase 2 + 3).
  const [storeTick, setStoreTick] = useState(0);
  const bias = useRef<HindiCorrectionBias & { corpus: { word: string; count: number }[] }>({
    promoted: {},
    suppressed: {},
    corpus: [],
  });
  useEffect(() => {
    void suggestionStore.ensureLoaded();
    const unsubscribe = suggestionStore.subscribe(() => {
      setStoreTick((t) => t + 1);
    });
    return unsubscribe;
  }, []);
  useEffect(() => {
    bias.current = suggestionStore.getHindiCorrectionBias();
  }, [storeTick]);

  const [pending, setPending] = useState<PendingCorrection | null>(null);

  /** Dictionary first, then the corpus "did you mean" (never silent). */
  const decideCorrection = (word: string) => {
    if (bias.current.suppressed?.[normalizeHindi(word)]) return null;
    return (
      lookupHindiCorrection(word, bias.current) ??
      suggestHindiFromCorpus(word, bias.current.corpus ?? [])
    );
  };

  /** Viewport position of a word span, for the floating suggestion chip. */
  const wordPosition = (doc: Document, node: Text, start: number, end: number) => {
    try {
      const range = doc.createRange();
      range.setStart(node, start);
      range.setEnd(node, end);
      const box = range.getBoundingClientRect();
      if (Number.isFinite(box.top) && Number.isFinite(box.left)) {
        return {
          top: Math.max(8, Math.round(box.top - 36)),
          left: Math.max(8, Math.round(box.left)),
        };
      }
    } catch {
      // detached node - the toolbar fallback still shows the suggestion
    }
    return { top: -1, left: -1 };
  };

  /**
   * ENTER / Shift+ENTER completes a word too. By the time the input event runs
   * the browser has already split the paragraph, so the just-completed word is
   * found in the block the officer left, corrected there, and the new-block
   * caret is restored afterwards.
   */
  const correctWordBeforeCaret = (editor: HTMLDivElement) => {
    const doc = editor.ownerDocument;
    const selection = doc.getSelection();
    if (!selection || !selection.isCollapsed || !selection.anchorNode) return;
    if (!editor.contains(selection.anchorNode)) return;

    // Park the post-Enter caret so it survives the replacement below.
    const restoredCaret = doc.createRange();
    restoredCaret.setStart(selection.anchorNode, selection.anchorOffset);
    restoredCaret.collapse(true);

    const caretEnd = doc.createRange();
    caretEnd.selectNodeContents(editor);
    try {
      caretEnd.setEnd(selection.anchorNode, selection.anchorOffset);
    } catch {
      return;
    }

    // Walk the editor's text nodes in document order and find the LAST one
    // whose content ends at or before the caret. Content that sits between
    // that node and the caret must not be protected text, otherwise the word
    // is not the officer's fresh typing and we stay out of it entirely.
    const walker = doc.createTreeWalker(editor, NodeFilter.SHOW_TEXT);
    let lastUsable: { node: Text; end: number } | null = null;
    let protectedBeforeCaret = false;
    let current = walker.nextNode();
    while (current) {
      const node = current as Text;
      current = walker.nextNode();
      const span = doc.createRange();
      span.selectNodeContents(node);
      let usableEnd = -1;
      if (span.compareBoundaryPoints(Range.END_TO_END, caretEnd) <= 0) {
        usableEnd = node.length; // ends entirely before the caret
      } else if (node === selection.anchorNode && selection.anchorOffset > 0) {
        usableEnd = selection.anchorOffset; // the caret sits inside this node
      }
      if (usableEnd <= 0) continue; // empty or past the caret
      if (node.parentElement?.closest(protectedText)) {
        protectedBeforeCaret = true;
        continue;
      }
      lastUsable = { node, end: usableEnd };
      protectedBeforeCaret = false;
    }
    if (!lastUsable || protectedBeforeCaret) return;

    const { node, end } = lastUsable;
    const start = trailingHindiWordStart(node.data, end);
    const word = node.data.slice(start, end);
    if (!word) return;

    const correction = decideCorrection(word);
    if (!correction) return;

    // Nothing may follow the word (it is the node tail), but the block may
    // still be quoted speech - the same quarantine as the typed path.
    const block = node.parentElement?.closest("p, div, li, td, th, h1, h2, h3, h4, h5, h6") ?? editor;
    if (blockContainsQuote(block.textContent ?? "")) return;

    const position = wordPosition(doc, node, start, end);
    if (correction.level === "suggested") {
      setPending({ editor, node, snapshot: node.data, start, end, replacement: correction.replacement, delimiter: "", wrong: word, top: position.top, left: position.left });
      return;
    }

    // Silent fix: replace the word, then hand the caret back to the new block.
    selection.setBaseAndExtent(node, start, node, end);
    if (!doc.execCommand("insertText", false, correction.replacement)) {
      selection.collapse(node, end);
    }
    selection.removeAllRanges();
    selection.addRange(restoredCaret);
  };

  const onInput = (event: FormEvent<HTMLDivElement>) => {
    setPending(null);
    const input = event.nativeEvent as InputEvent;
    const previous = typed.current;
    typed.current = null;

    if (!enabled || protectedDocument || !input.isTrusted) return;

    // ENTER is a word boundary too (see correctWordBeforeCaret).
    if (input.inputType === "insertParagraph" || input.inputType === "insertLineBreak") {
      if (input.isComposing) return;
      correctWordBeforeCaret(event.currentTarget);
      return;
    }

    if (!input.data) return;
    if (input.inputType !== "insertText" && input.inputType !== "insertCompositionText") return;

    const editor = event.currentTarget;
    const selection = editor.ownerDocument.getSelection();
    const node = selection?.anchorNode;
    if (!selection?.isCollapsed || !(node instanceof Text) || !editor.contains(node)) return;
    if (node.parentElement?.closest(protectedText)) return;

    const end = selection.anchorOffset;
    const insertedAt = end - input.data.length;
    if (insertedAt < 0) return;
    const insertedText = node.data.slice(insertedAt, end);
    if (insertedText !== input.data && !(insertedText === "\u00A0" && input.data === " ")) return;
    const continuesWord = previous?.node === node && previous.end === insertedAt;

    if (HINDI_WORD_CHAR_RE.test(input.data)) {
      typed.current = { node, start: continuesWord ? previous.start : insertedAt, end };
      return;
    }

    if (input.isComposing || input.inputType !== "insertText" || !continuesWord || !HINDI_BOUNDARY_CHAR_RE.test(input.data)) return;
    const word = node.data.slice(previous.start, insertedAt);
    const correction = decideCorrection(word);
    if (!correction || isFollowedByWordChar(node.data.slice(end))) return;

    const block = node.parentElement?.closest("p, div, li, td, th, h1, h2, h3, h4, h5, h6") ?? editor;
    if (blockContainsQuote(block.textContent ?? "")) return;
    const prefix = editor.ownerDocument.createRange();
    prefix.selectNodeContents(block);
    prefix.setEnd(node, previous.start);
    if (isPrecededByWordChar(prefix.toString())) return;

    if (correction.level === "suggested") {
      const position = wordPosition(editor.ownerDocument, node, previous.start, end);
      setPending({ editor, node, snapshot: node.data, start: previous.start, end, replacement: correction.replacement, delimiter: insertedText, wrong: word, top: position.top, left: position.left });
      return;
    }

    // The browser's editing command preserves native Undo and the surrounding markup.
    selection.setBaseAndExtent(node, previous.start, node, end);
    if (!editor.ownerDocument.execCommand("insertText", false, correction.replacement + insertedText)) {
      selection.collapse(node, end);
    }
  };

  return {
    onInput,
    /**
     * Phase 3: the flagged word, its correction and the viewport position for
     * the floating chip (the toolbar keeps rendering the same data).
     */
    suggestion:
      enabled && !protectedDocument && pending
        ? {
            word: pending.wrong,
            replacement: pending.replacement,
            rect: { top: pending.top, left: pending.left },
          }
        : undefined,
    /** Closes the chip without a learning signal (officer kept typing). */
    dismissSuggestion: () => setPending(null),
    /**
     * Phase 2 learning: the officer explicitly rejected this correction -
     * after enough rejects it stops being offered for them.
     */
    rejectSuggestion: () => {
      if (pending) {
        suggestionStore.recordHindiReject(normalizeHindi(pending.wrong));
      }
      setPending(null);
    },
    acceptSuggestion() {
      setPending(null);
      if (!enabled || protectedDocument || !pending) return;
      const { editor, node, snapshot, start, end, replacement, delimiter } = pending;
      if (!editor.isConnected || !editor.contains(node) || node.data !== snapshot ||
          node.parentElement?.closest(protectedText)) return;

      // Phase 2 learning: repeated accepts promote the correction to a
      // personal SILENT entry for this officer (Gboard personal dictionary).
      const typedWrong = node.data.slice(start, end);
      suggestionStore.recordHindiAccept(normalizeHindi(typedWrong), replacement);

      const selection = editor.ownerDocument.getSelection();
      if (!selection) return;
      editor.focus();
      selection.setBaseAndExtent(node, start, node, end);
      if (!editor.ownerDocument.execCommand("insertText", false, replacement + delimiter)) {
        selection.collapse(node, end);
      }
    },
  };
}

/** Start offset of the Devanagari run that ends at `end` (or `end` itself). */
function trailingHindiWordStart(text: string, end: number): number {
  let start = end;
  while (start > 0 && HINDI_WORD_CHAR_RE.test(text[start - 1])) start--;
  return start;
}
