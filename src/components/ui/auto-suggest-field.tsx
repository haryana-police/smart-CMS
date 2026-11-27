"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { getGDSuggestions, type GDChainState, type GDSuggestion } from "@/lib/gdSuggestions";
import { autoResizeTextarea } from "@/components/ui/auto-resize-textarea";
import { suggestionStore } from "@/lib/suggestionStore";
import { useLanguage } from "@/context/LanguageContext";

export interface AutoSuggestFieldProps {
  value: string;
  onChange: (value: string) => void;
  /** Visual variant: single-line `<input>` or multi-line `<textarea>`. */
  as?: "input" | "textarea";
  /** Only used when `as === "textarea"`. */
  rows?: number;
  placeholder?: string;
  className?: string;
  inputClassName?: string;
  /** Feeds entry-type aware opening templates into the engine. */
  entryType?: string;
  id?: string;
  name?: string;
  maxLength?: number;
  required?: boolean;
  disabled?: boolean;
  readOnly?: boolean;
  enableGhost?: boolean;
  /** Show the floating, clickable suggestion strip above the field. */
  showAcceptBadge?: boolean;
  style?: React.CSSProperties;
  "data-testid"?: string;
}

/**
 * AutoSuggestField
 * ----------------
 * Gboard-style suggestions that float ABOVE the field instead of painting grey
 * "shadow" text inside it:
 *
 * - The engine returns several ranked candidates; up to three are shown as
 *   clickable chips in a floating strip above the field, so nothing is ever
 *   drawn over the officer's typed text.
 * - The first chip is auto-selected: TAB (or RIGHT ARROW at the caret) accepts
 *   it and the prediction keeps advancing - the next candidate, or the next
 *   fragment of a sequence, appears for the following TAB press.
 * - Any chip can be clicked / tapped to insert exactly that suggestion.
 * - ESC dismisses the strip until the value changes again.
 *
 * The real input/textarea keeps a normal opaque background, so spellcheck
 * underlines, selection and the caret render exactly as the browser intends.
 */
export function AutoSuggestField({
  value,
  onChange,
  as = "input",
  rows = 6,
  placeholder,
  className,
  inputClassName,
  entryType,
  id,
  name,
  maxLength,
  required,
  disabled,
  readOnly,
  enableGhost = true,
  showAcceptBadge = true,
  style,
  "data-testid": dataTestId,
}: AutoSuggestFieldProps) {
  const { isHindi } = useLanguage();
  const controlRef = useRef<HTMLInputElement | HTMLTextAreaElement | null>(null);
  const lastAcceptTimeRef = useRef<number>(0);

  /**
   * Tracks which fragment of which sequence TAB should offer next.
   * This is what makes repeated TAB presses walk through a sentence piece by
   * piece instead of dumping the whole thing at once.
   */
  const [chain, setChain] = useState<GDChainState | null>(null);

  // Dynamic subscription to suggestion store (personal dictionary, learned weights, uploaded files vocabulary)
  const [storeTick, setStoreTick] = useState(0);
  /** The strip only floats while the officer is actually typing in the field. */
  const [focused, setFocused] = useState(false);

  useEffect(() => {
    void suggestionStore.ensureLoaded();
    const unsubscribe = suggestionStore.subscribe(() => {
      setStoreTick((t) => t + 1);
    });
    return unsubscribe;
  }, []);

  /** All ranked predictions for the current value (the strip shows the top few). */
  const candidates = useMemo(() => {
    if (!enableGhost || readOnly || disabled) return [];
    // Passing the value as context also activates mined next-word prediction
    // (what usually follows the completed word before the caret).
    const options = suggestionStore.getEngineOptions(value);
    return getGDSuggestions(value, entryType, chain, options);
  }, [value, entryType, chain, enableGhost, readOnly, disabled, storeTick]);

  /**
   * Set when the officer presses ESC. Any subsequent change to `value`
   * clears it again, so the strip comes back on the next keystroke.
   */
  const [dismissed, setDismissed] = useState(false);
  const [prevVal, setPrevVal] = useState(value);
  if (prevVal !== value) {
    setPrevVal(value);
    setDismissed(false);
  }

  const suggestions = dismissed ? [] : candidates;

  const adjustHeight = useCallback(() => {
    if (as === "textarea" && controlRef.current) {
      autoResizeTextarea(controlRef.current as HTMLTextAreaElement);
    }
  }, [as]);

  useEffect(() => {
    adjustHeight();
  }, [value, adjustHeight]);

  /**
   * Inserts one suggestion: replaces its claimed suffix, records the accept so
   * learning re-ranks future strips, advances sequence chains and parks the
   * caret at the end of the inserted text so TAB keeps walking forward.
   */
  const acceptSuggestion = useCallback(
    (s: GDSuggestion | undefined) => {
      if (!s) return;
      const now = Date.now();
      if (now - lastAcceptTimeRef.current < 200) return;
      lastAcceptTimeRef.current = now;

      const head = value.slice(0, Math.max(0, value.length - s.replaceLength));
      onChange(head + s.text);
      suggestionStore.recordAccept(s.key, entryType);
      setDismissed(false);

      if (s.sequenceIndex >= 0) {
        // Continue from whichever fragment is currently being offered.
        const currentNext = chain && chain.sequenceIndex === s.sequenceIndex ? chain.next : 0;
        setChain({ sequenceIndex: s.sequenceIndex, next: currentNext + 1 });
      } else {
        setChain(null);
      }

      // Park the caret at the end of the freshly written text so the next TAB
      // (or RIGHT ARROW) keeps predicting from the new end of the sentence.
      requestAnimationFrame(() => {
        const ctrl = controlRef.current;
        if (!ctrl) return;
        ctrl.focus();
        const end = (head + s.text).length;
        try {
          ctrl.setSelectionRange(end, end);
        } catch {
          // Some input elements do not support setSelectionRange
        }
      });
    },
    [value, chain, onChange, entryType]
  );

  /**
   * Any real typing breaks the chain: the officer's own word takes over.
   */
  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    setChain(null);
    setDismissed(false);
    onChange(e.target.value);
    if (as === "textarea") {
      autoResizeTextarea(e.target as HTMLTextAreaElement);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    if (e.key === "Escape") {
      if (suggestions.length > 0) {
        e.preventDefault();
        suggestionStore.recordReject(suggestions[0].key, entryType, "dismiss");
        setDismissed(true);
        setChain(null);
      }
      return;
    }

    if (e.key === "Tab") {
      // Only hijack TAB when actively completing typed text; on an empty field let Tab advance normally
      if (suggestions.length === 0 || !value.trim()) return;
      e.preventDefault();
      acceptSuggestion(suggestions[0]);
      return;
    }

    if (e.key === "ArrowRight") {
      const target = e.currentTarget;
      // If cursor is at the very end of the input, ArrowRight accepts the
      // auto-selected suggestion.
      if (target.selectionStart === value.length && target.selectionEnd === value.length) {
        if (suggestions.length === 0) return;
        e.preventDefault();
        acceptSuggestion(suggestions[0]);
      }
    }
  };

  /** Styles for the real, interactive control. */
  const sharedClasses = cn(
    "w-full px-3 py-2 text-xs sm:text-sm border border-slate-300 rounded-lg",
    "focus:ring-2 focus:ring-[#0b192c] focus:outline-none font-sans bg-white",
    inputClassName
  );

  const controlProps = {
    id,
    name,
    value,
    maxLength,
    required,
    disabled,
    readOnly,
    style,
    "data-testid": dataTestId,
    placeholder,
    onChange: handleChange,
    onKeyDown: handleKeyDown,
    onFocus: () => setFocused(true),
    onBlur: () => setFocused(false),
  };

  const stripVisible = focused && suggestions.length > 0;

  return (
    <div className={cn("relative w-full rounded-lg bg-white", className)}>
      {as === "textarea" ? (
        <textarea
          {...controlProps}
          rows={rows}
          ref={controlRef as React.RefObject<HTMLTextAreaElement>}
          className={cn(sharedClasses, "resize-none overflow-hidden transition-[height] duration-75")}
        />
      ) : (
        <input
          {...controlProps}
          type="text"
          ref={controlRef as React.RefObject<HTMLInputElement>}
          className={sharedClasses}
        />
      )}

      {/* Gboard-style strip: the auto-selected suggestion plus alternatives,
          floating ABOVE the field so nothing overlays the typed text. */}
      {showAcceptBadge && stripVisible && (
        <div className="no-print absolute bottom-full left-0 z-30 mb-1.5 flex max-w-full items-center gap-1.5 rounded-lg border border-slate-200 bg-white p-1 shadow-lg">
          {suggestions.slice(0, 3).map((s, i) => {
            const label = s.text.trim() || (isHindi ? "(स्पेस)" : "(space)");
            const title =
              i === 0
                ? isHindi
                  ? `Tab दबाएँ या क्लिक करें: "${label}"`
                  : `Press Tab or click to insert: "${label}"`
                : isHindi
                  ? `क्लिक करके चुनें: "${label}"`
                  : `Click to insert: "${label}"`;
            return (
              <button
                key={s.key || `cand-${i}`}
                type="button"
                tabIndex={-1}
                aria-label={title}
                title={title}
                onMouseDown={(e) => {
                  e.preventDefault();
                  acceptSuggestion(s);
                }}
                onTouchEnd={(e) => {
                  e.preventDefault();
                  acceptSuggestion(s);
                }}
                className={cn(
                  "no-print flex min-w-0 cursor-pointer select-none items-center gap-1 whitespace-nowrap rounded-md border px-2 py-1 text-[11px] font-medium transition-colors",
                  i === 0
                    ? "border-slate-700 bg-[#0b192c] text-white shadow-sm hover:bg-slate-900"
                    : "border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100"
                )}
              >
                <span className="max-w-[11rem] truncate">{label}</span>
                {i === 0 && (
                  <kbd className="shrink-0 rounded border border-slate-600 bg-slate-800 px-1 py-0.5 font-mono text-[9px] text-amber-300">
                    Tab ⇥
                  </kbd>
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

/** Small helper so a page can advertise the TAB hint next to a field. */
export function SuggestionHint({ className }: { className?: string }) {
  const { isHindi } = useLanguage();
  return (
    <span className={cn("hidden sm:inline text-[10px] font-medium text-slate-400", className)}>
      {isHindi ? (
        <>
          सुझाव स्वीकारने के लिए <kbd className="px-1 rounded border border-slate-300 bg-white font-mono">Tab</kbd> दबाएँ
        </>
      ) : (
        <>
          Tip: press <kbd className="px-1 rounded border border-slate-300 bg-white font-mono">Tab</kbd> to accept a suggestion
        </>
      )}
    </span>
  );
}
