"use client";

import { isMhcOrMmRole } from "@/lib/officerRoles";
import React, { useState, useRef, useEffect } from "react";
import { UserCog } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { useLanguage } from "@/context/LanguageContext";
import { UserSession } from "@/types";
import { cn } from "@/lib/utils";

interface TopBarPersonaSwitcherProps {
  isMobile?: boolean;
}

type SwitchableOfficer = Pick<UserSession, "id" | "name" | "district" | "stationName"> & {
  rank: string;
  role: string;
};

function getRoleBadge(user: Pick<SwitchableOfficer, "role" | "rank">): { badge: string; colorClass: string } {
  if (user.role === "SP_DISTRICT" || user.rank === "SUPERINTENDENT_OF_POLICE") {
    return { badge: "SP", colorClass: "bg-indigo-50 text-indigo-700 border-indigo-200" };
  }
  if (user.rank === "ADDITIONAL_SP") {
    return { badge: "ASP", colorClass: "bg-violet-50 text-violet-700 border-violet-200" };
  }
  if (user.role === "DSP_SUBDIV" || user.rank === "DEPUTY_SP") {
    return { badge: "DSP", colorClass: "bg-purple-50 text-purple-700 border-purple-200" };
  }
  if (user.role === "SHO") {
    return { badge: "SHO", colorClass: "bg-red-50 text-red-700 border-red-200" };
  }
  if (isMhcOrMmRole(user.role)) {
    return { badge: user.role === "MM" ? "MM" : "MHC", colorClass: "bg-emerald-50 text-emerald-700 border-emerald-200" };
  }
  if (user.role === "ENQUIRY_OFFICER") {
    if (user.rank === "INSPECTOR") {
      return { badge: "IO-Insp", colorClass: "bg-blue-50 text-blue-700 border-blue-200" };
    }
    if (user.rank === "SUB_INSPECTOR") {
      return { badge: "IO-SI", colorClass: "bg-blue-50 text-blue-700 border-blue-200" };
    }
    if (user.rank === "ASSISTANT_SUB_INSPECTOR") {
      return { badge: "IO-ASI", colorClass: "bg-sky-50 text-sky-700 border-sky-200" };
    }
    if (user.rank === "HEAD_CONSTABLE") {
      return { badge: "IO-HC", colorClass: "bg-cyan-50 text-cyan-700 border-cyan-200" };
    }
    return { badge: "IO/EO", colorClass: "bg-blue-50 text-blue-700 border-blue-200" };
  }
  return { badge: user.rank.slice(0, 3), colorClass: "bg-slate-100 text-slate-700 border-slate-200" };
}

export function TopBarPersonaSwitcher({ isMobile = false }: TopBarPersonaSwitcherProps) {
  const { currentUser, sessionUser, isViewAs, enterViewAs, exitViewAs } = useAuth();
  const { isHindi } = useLanguage();
  const [isOpen, setIsOpen] = useState(false);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const dropdownRef = useRef<HTMLDivElement | null>(null);

  const [selectedDistrict, setSelectedDistrict] = useState<string>("ALL");
  const [selectedStation, setSelectedStation] = useState("");
  const [officers, setOfficers] = useState<SwitchableOfficer[]>([]);
  const isDeveloper = sessionUser.id === 'cms_developer_admin';

  useEffect(() => {
    if (!isOpen || !isDeveloper) return;
    const controller = new AbortController();
    fetch("/api/admin/accounts?view=officer-switcher", { signal: controller.signal })
      .then(response => response.ok ? response.json() : null)
      .then(data => {
        if (!data || controller.signal.aborted) return;
        setOfficers(data.officers as SwitchableOfficer[]);
      })
      .catch(() => {});
    return () => controller.abort();
  }, [isOpen, isDeveloper]);

  const districts = ["ALL", ...new Set(officers.map(officer => officer.district))];
  const districtOfficers = officers.filter(officer => selectedDistrict === "ALL" || officer.district === selectedDistrict);
  const stations = [...new Set(districtOfficers.map(officer => officer.stationName).filter(Boolean))].sort();
  const filteredUsers = districtOfficers.filter(officer => !selectedStation || officer.stationName === selectedStation);

  // Close when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [isOpen]);

  // Close on Escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setIsOpen(false);
      }
    };
    const handleOpenRole = () => setIsOpen(true);

    if (isOpen) {
      document.addEventListener("keydown", handleKeyDown);
    }
    window.addEventListener("cms-open-role-switcher", handleOpenRole);

    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("cms-open-role-switcher", handleOpenRole);
    };
  }, [isOpen]);

  // Click an officer to enter their ID view with the developer's own session.
  // Clicking the officer currently being viewed returns to the developer's own ID.
  const handleView = async (user: SwitchableOfficer) => {
    if (pendingId) return;
    const isViewedNow = isViewAs && currentUser.id === user.id;
    setIsOpen(false);
    setPendingId(user.id);
    const ok = isViewedNow ? await exitViewAs() : await enterViewAs(user);
    setPendingId(null);
    if (!ok && typeof window !== "undefined") {
      const message = (window as unknown as { __lastViewAsError?: string }).__lastViewAsError;
      window.dispatchEvent(new CustomEvent("complaints_save_error", { detail: message || "Officer ID could not be opened." }));
    }
  };

  const activeRoleInfo = getRoleBadge(currentUser);
  if (!isDeveloper) return <span className="text-xs px-2" title={currentUser.pno}>{currentUser.name}</span>;

  return (
    <div className="relative" ref={dropdownRef}>
      {/* Persona Icon Trigger Button */}
      <button
        type="button"
        onClick={() => setIsOpen((prev) => !prev)}
        className={cn(
          "relative rounded-lg border transition-all cursor-pointer flex items-center justify-center group active:scale-95",
          isMobile
            ? "min-w-[44px] min-h-[44px] p-2 sm:min-w-8 sm:min-h-8 sm:p-1.5 bg-slate-100 hover:bg-slate-200/80 border-slate-200 text-slate-700"
            : "p-2 bg-white hover:bg-slate-50 border-slate-200/80 text-slate-700 hover:text-slate-950 shadow-2xs",
          isOpen && "ring-2 ring-[#0b192c]/20 bg-slate-100",
          isViewAs && !isOpen && "ring-2 ring-amber-400"
        )}
        title={
          isHindi
            ? `किसी भी अधिकारी ID का दृश्य देखें (सत्र: ${sessionUser.name})`
            : `Enter any officer ID view (session: ${sessionUser.name})`
        }
        aria-label="Enter officer ID view"
        aria-expanded={isOpen}
      >
        <UserCog className={isMobile ? "w-3.5 h-3.5 text-slate-700" : "w-4 h-4 text-slate-700 group-hover:text-slate-900"} />
        <span className="cms-persona-badge absolute -bottom-1 -right-1 text-[8px] font-bold px-1 leading-none rounded bg-[#0b192c] text-white border border-white font-mono shadow-2xs">
          {activeRoleInfo.badge}
        </span>
      </button>

      {/* Minimalist Dropdown - Opens directly beneath the icon with zero clutter */}
      {isOpen && (
        <div
          className={cn(
            "absolute right-0 top-full mt-1.5 bg-white rounded-xl shadow-xl border border-slate-200 z-50 overflow-hidden py-1.5 animate-in fade-in-0 zoom-in-95",
            isMobile ? "w-56" : "w-64"
          )}
        >
          {/* Minimal Clean Header */}
          <div className="px-3 py-1.5 border-b border-slate-100 flex items-center justify-between text-[11px] font-semibold text-slate-500">
            <span>
              {isHindi
                ? "अधिकारी ID में जाएँ"
                : "Enter officer ID"}
            </span>
            <span className="text-[10px] text-slate-400 font-mono">
              {filteredUsers.length} {isHindi ? "अधिकारी" : "Officers"}
            </span>
          </div>
          <p className="px-3 pt-1.5 text-[10px] text-slate-400">
            {isHindi
              ? "किसी भी ID पर क्लिक करें — आपका Developer Admin सत्र बना रहेगा, साइन-आउट आपके नियंत्रण में है।"
              : "Click any ID to enter it — your Developer Admin session stays active; sign out stays yours."}
          </p>

          {/* District Filter Chips */}
          <div className="p-1.5 border-b border-slate-100 flex items-center gap-1 overflow-x-auto text-[10px] bg-slate-50/50">
            {districts.map((d) => (
              <button
                key={d}
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setSelectedDistrict(d);
                  setSelectedStation("");
                }}
                className={cn(
                  "px-2.5 py-0.5 rounded-md font-medium whitespace-nowrap transition-colors shrink-0 cursor-pointer",
                  selectedDistrict === d
                    ? "cms-persona-chip-selected bg-[#203c88] !text-white font-semibold shadow-xs"
                    : "bg-white text-slate-700 hover:bg-slate-100 hover:text-slate-950 border border-slate-200"
                )}
                style={
                  selectedDistrict === d
                    ? { backgroundColor: "#203c88", color: "#ffffff", borderColor: "#203c88" }
                    : undefined
                }
              >
                {d === "ALL" ? "All Districts" : d}
              </button>
            ))}
          </div>

          <div className="px-2 py-1.5">
            <select
              aria-label={isHindi ? "पुलिस थाना" : "Police station"}
              value={selectedStation}
              onChange={event => setSelectedStation(event.target.value)}
              className="w-full rounded border border-slate-200 bg-white px-2 py-1 text-xs"
            >
              <option value="">{isHindi ? "सभी थाने" : "All stations"}</option>
              {stations.map(station => <option key={station} value={station}>{station}</option>)}
            </select>
          </div>

          {/* Minimalist List: Role badge + Name, click enters that officer's ID view */}
          <div className="p-1 space-y-0.5 max-h-80 overflow-y-auto">
            {filteredUsers.map((user) => {
              const isViewed = isViewAs && currentUser.id === user.id;
              const isPending = pendingId === user.id;
              const roleInfo = getRoleBadge(user);

              return (
                <button
                  key={user.id}
                  type="button"
                  disabled={isPending}
                  onClick={() => handleView(user)}
                  className={cn(
                    "w-full flex items-center justify-between px-2.5 py-2 rounded-lg text-left transition-colors text-xs group",
                    isViewed
                      ? "bg-amber-50 text-amber-950 font-semibold ring-1 ring-amber-300"
                      : "text-slate-700 hover:bg-slate-50 hover:text-slate-950",
                    isPending && "opacity-60"
                  )}
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <span
                      className={cn(
                        "text-[9px] font-bold px-1.5 py-0.5 rounded border font-mono shrink-0",
                        roleInfo.colorClass
                      )}
                    >
                      {roleInfo.badge}
                    </span>
                    <span className="truncate">{user.name}</span>
                  </div>
                  {isPending ? (
                    <span className="text-[9px] text-slate-400 shrink-0 ml-1.5">…</span>
                  ) : isViewed ? (
                    <span className="text-[9px] font-semibold text-amber-700 shrink-0 ml-1.5">
                      {isHindi ? "इस ID में हैं — बाहर निकलें" : "Viewing — exit"}
                    </span>
                  ) : (
                    <span className="text-[9px] text-slate-400 shrink-0 ml-1.5">
                      {isHindi ? "इसमें जाएँ" : "Enter"}
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          {/* Exit view while viewing another ID */}
          {isViewAs && (
            <div className="px-2 pb-1 pt-1 border-t border-slate-100">
              <button
                type="button"
                disabled={Boolean(pendingId)}
                onClick={() => {
                  setIsOpen(false);
                  void exitViewAs();
                }}
                className="w-full text-left px-2 py-1.5 rounded-md text-[11px] font-semibold text-[#203c88] hover:bg-slate-50 disabled:opacity-60"
              >
                {isHindi ? "← अपनी Developer Admin ID पर लौटें" : "← Return to Developer Admin"}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
