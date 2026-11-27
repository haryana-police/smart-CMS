"use client";

import React, { useState, useEffect, useRef } from "react";
import { Sparkles, Shield, Bot } from "lucide-react";
import { CmsAgentModal } from "./CmsAgentModal";

const MOBILE_VIEW = "(width < 64rem)";
const LONG_PRESS_MS = 650;

export function DraggableAgentButton({ hiddenOnMobile, onHideOnMobile }: {
  hiddenOnMobile: boolean;
  onHideOnMobile: () => void;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [position, setPosition] = useState<{ x: number; y: number }>({ x: 24, y: 120 });
  const [mounted, setMounted] = useState(false);
  const pointerIdRef = useRef<number | null>(null);
  const longPressRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dragStartRef = useRef<{ startX: number; startY: number; posX: number; posY: number }>({
    startX: 0,
    startY: 0,
    posX: 0,
    posY: 0,
  });
  const hasMovedRef = useRef(false);

  function clearLongPress() {
    if (longPressRef.current !== null) {
      clearTimeout(longPressRef.current);
      longPressRef.current = null;
    }
  }

  useEffect(() => clearLongPress, []);

  useEffect(() => {
    if (hiddenOnMobile && window.matchMedia(MOBILE_VIEW).matches) setIsOpen(false);
  }, [hiddenOnMobile]);

  useEffect(() => {
    setMounted(true);
    try {
      const savedX = localStorage.getItem("cms_agent_pos_x");
      const savedY = localStorage.getItem("cms_agent_pos_y");
      if (savedX && savedY) {
        const x = parseInt(savedX, 10);
        const y = parseInt(savedY, 10);
        if (!isNaN(x) && !isNaN(y)) {
          // Keep within reasonable bounds of screen
          const clampedX = Math.min(Math.max(x, 16), window.innerWidth - 80);
          const clampedY = Math.min(Math.max(y, 60), window.innerHeight - 80);
          setPosition({ x: clampedX, y: clampedY });
        }
      } else {
        // Default position: bottom-right corner
        const defaultX = Math.max(window.innerWidth - 88, 24);
        const defaultY = Math.max(window.innerHeight - 110, 100);
        setPosition({ x: defaultX, y: defaultY });
      }
    } catch {
      // ignore
    }
  }, []);

  const handlePointerDown = (e: React.PointerEvent) => {
    // Only drag with left mouse button or touch
    if (e.button !== 0 || pointerIdRef.current !== null) return;

    pointerIdRef.current = e.pointerId;
    hasMovedRef.current = false;
    setIsDragging(true);

    dragStartRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      posX: position.x,
      posY: position.y,
    };

    e.currentTarget.setPointerCapture(e.pointerId);

    if (window.matchMedia(MOBILE_VIEW).matches) {
      longPressRef.current = setTimeout(() => {
        clearLongPress();
        if (!window.matchMedia(MOBILE_VIEW).matches) return;
        pointerIdRef.current = null;
        setIsDragging(false);
        setIsOpen(false);
        onHideOnMobile();
      }, LONG_PRESS_MS);
    }
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (pointerIdRef.current !== e.pointerId) return;
    const deltaX = e.clientX - dragStartRef.current.startX;
    const deltaY = e.clientY - dragStartRef.current.startY;

    const threshold = longPressRef.current !== null ? 8 : 4;
    if (Math.abs(deltaX) > threshold || Math.abs(deltaY) > threshold) {
      hasMovedRef.current = true;
      clearLongPress();
    }
    if (!hasMovedRef.current && longPressRef.current !== null) return;

    const newX = Math.min(Math.max(dragStartRef.current.posX + deltaX, 12), window.innerWidth - 76);
    const newY = Math.min(Math.max(dragStartRef.current.posY + deltaY, 50), window.innerHeight - 76);

    setPosition({ x: newX, y: newY });
  };

  const finishPointer = (e: React.PointerEvent) => {
    if (pointerIdRef.current !== e.pointerId) return false;
    pointerIdRef.current = null;
    clearLongPress();
    setIsDragging(false);
    return true;
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    if (!finishPointer(e)) return;
    try {
      localStorage.setItem("cms_agent_pos_x", String(position.x));
      localStorage.setItem("cms_agent_pos_y", String(position.y));
    } catch {
      // ignore
    }

    // If it was just a click without moving, toggle the modal
    if (!hasMovedRef.current) {
      setIsOpen((prev) => !prev);
    }
  };

  if (!mounted) return null;

  return (
    <>
      {/* Movable Floating AI Icon Button */}
      <div
        data-cms-agent-ui
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={finishPointer}
        onLostPointerCapture={finishPointer}
        onContextMenu={(e) => {
          if (window.matchMedia(MOBILE_VIEW).matches) e.preventDefault();
        }}
        style={{
          left: `${position.x}px`,
          top: `${position.y}px`,
          touchAction: "none",
        }}
        className={`print:hidden fixed z-50 select-none cursor-grab active:cursor-grabbing transition-transform ${
          isDragging ? "scale-105 opacity-90" : "hover:scale-105"
        } ${hiddenOnMobile ? "hidden lg:block" : ""}`}
        title="Haryana Police CMS AI Agent (Click to Open, Drag to Move)"
      >
        <div className="relative group">
          {/* Outer Pulsing Glow */}
          <div className="absolute -inset-1 bg-gradient-to-r from-blue-600 via-indigo-600 to-purple-600 rounded-full blur-xs opacity-70 group-hover:opacity-100 transition duration-300 animate-pulse"></div>

          {/* Main Agent Button */}
          <button
            type="button"
            onClick={(e) => {
              if (e.detail === 0) setIsOpen((open) => !open);
            }}
            className="relative flex items-center justify-center w-14 h-14 rounded-full bg-[#081225] border-2 border-indigo-400/80 shadow-2xl text-white overflow-hidden focus:outline-none"
          >
            {/* Haryana Police Badge Overlay */}
            <div className="absolute inset-0 bg-radial from-blue-900/50 via-transparent to-transparent opacity-80 pointer-events-none" />

            <div className="flex flex-col items-center justify-center">
              <div className="relative">
                <Bot className="w-6 h-6 text-blue-200" />
                <Sparkles className="w-3.5 h-3.5 text-amber-300 absolute -top-1 -right-1.5 animate-spin" style={{ animationDuration: "8s" }} />
              </div>
              <span className="text-[9px] font-black tracking-tighter text-blue-100 uppercase mt-0.5 font-mono">
                PARTH
              </span>
            </div>

            {/* Drag Handle Indicator Pill */}
            <div className="absolute bottom-0 inset-x-0 h-1.5 bg-blue-500/40 flex items-center justify-center">
              <div className="w-4 h-0.5 bg-white/70 rounded-full" />
            </div>
          </button>

          {/* Hover Tooltip */}
          <div className="absolute right-full top-1/2 -translate-y-1/2 mr-3 px-2.5 py-1.5 bg-slate-900/95 text-white text-[11px] rounded-lg shadow-xl whitespace-nowrap opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity duration-200 border border-slate-700/80 flex items-center gap-1.5">
            <Shield className="w-3.5 h-3.5 text-blue-400" />
            <span>Parth · Haryana Police AI Agent</span>
            <span className="text-[9px] text-slate-400 font-mono">(“Hey Parth”)</span>
          </div>
        </div>
      </div>

      {/* Assistant Modal / Expandable Workspace */}
      <CmsAgentModal
        isOpen={isOpen}
        onClose={() => setIsOpen(false)}
        anchorPosition={position}
      />
    </>
  );
}
