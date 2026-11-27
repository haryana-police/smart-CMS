"use client";

import { isMhcOrMmRole } from "@/lib/officerRoles";
import React, { useState } from "react";
import Link from "next/link";
import { canRegisterFir } from "@/lib/firIntegrity";
import { usePathname } from "next/navigation";
import { Shield, Bell, Menu, X, UserCog, BookOpen, FileText, ChevronDown, ArrowLeft, LayoutGrid, PlusCircle, Scale, ClipboardList, FileBarChart, FileCheck2, BookmarkCheck, ReceiptText, Home, Bot } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { TopBarHindiAutocorrect } from "./TopBarHindiAutocorrect";
import { TopBarDictation } from "./TopBarDictation";
import { TopBarModuleSwitcher } from "./TopBarModuleSwitcher";
import { TopBarThemeToggle } from "./TopBarThemeToggle";
import { TopBarNotifications } from "./TopBarNotifications";
import { TopBarLanguageSwitcher } from "./TopBarLanguageSwitcher";
import { TopBarPersonaSwitcher } from "./TopBarPersonaSwitcher";
import { useLanguage } from "@/context/LanguageContext";
import { useEscapeKey } from "@/hooks/useEscapeKey";
import { cn } from "@/lib/utils";

export function MobileHeader({ mobileParthHidden, onToggleMobileParth }: {
  mobileParthHidden: boolean;
  onToggleMobileParth: () => void;
}) {
  const pathname = usePathname();
  const { currentUser, sessionUser, isViewAs, logout } = useAuth();
  const { t } = useLanguage();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [showSignOutModal, setShowSignOutModal] = useState(false);

  useEscapeKey(drawerOpen && !showSignOutModal, () => setDrawerOpen(false));
  useEscapeKey(showSignOutModal, () => setShowSignOutModal(false));

  const isRoznamcha = pathname.startsWith("/general-diary");
  const isFir = pathname.startsWith("/fir") || pathname.startsWith("/fir-workspace");
  const isComplaints = !isFir && (pathname.startsWith("/complaints") || pathname.startsWith("/enquiry-workspace"));
  const isRegistrations = pathname.startsWith("/registrations");
  const isReports = pathname.startsWith("/reports");
  const isProsecution = pathname.startsWith("/prosecution");

  const isMhc = isMhcOrMmRole(currentUser?.role);
  const isSho = currentUser?.role === "SHO" || currentUser?.id === "usr_sho_1";
  const isSuperior = currentUser?.role === "DSP_SUBDIV" || currentUser?.role === "SP_DISTRICT" || currentUser?.role === "SUPER_ADMIN";
  const canRegisterComplaint = isMhc || isSho || isSuperior;

  return (
    <>
      <header className="print:hidden lg:hidden sticky top-0 z-45 bg-white/95 dark:bg-[#0d1930]/95 backdrop-blur-sm border-b border-slate-200/80 dark:border-[#1e2c48] text-slate-900 dark:text-slate-100 shadow-2xs">
        {/* Main Bar */}
        <div className="px-2.5 sm:px-3.5 py-1.5 sm:py-2 flex items-center justify-between gap-2">
          {/* Police Crest & Station Title */}
          <div className="flex items-center gap-2 min-w-0 flex-1">
            <div className="w-8 h-8 rounded-md bg-slate-900 flex items-center justify-center text-white shrink-0">
              <Shield className="w-4 h-4" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="text-[10px] font-semibold text-slate-500 dark:text-slate-300 tracking-wider uppercase truncate">
                  {isRoznamcha ? t("Roznamcha GD") : isFir ? t("FIR Module") : isComplaints ? t("Complaints") : isRegistrations ? t("Registrations") : isReports ? t("Reports") : isProsecution ? t("Prosecution") : "HP CMS"}
                </span>
                <span
                  className="text-[10px] bg-[#eef1ff] !text-[#203c88] dark:!bg-[#1e3a8a] dark:!text-[#ffffff] dark:!border-[#3b82f6] px-1.5 py-0.5 rounded border border-[#6d85bd]/60 font-mono font-bold shrink-0"
                >
                  {currentUser.rank.slice(0, 3)}
                </span>
              </div>
              <h2 className="text-xs font-semibold text-slate-900 dark:text-slate-100 truncate">
                {currentUser.stationName}
              </h2>
            </div>
          </div>

          {/* Action Controls (>=44px tap targets on small screens; secondary utilities inside drawer <640px) */}
          <div className="flex items-center gap-1 sm:gap-1.5 shrink-0">
            {/* Direct Home Link */}
            <Link
              href="/"
              title="Home"
              aria-label="Home"
              className={cn(
                "min-w-[44px] min-h-[44px] sm:min-w-9 sm:min-h-9 rounded-md border transition-colors flex items-center justify-center shrink-0",
                pathname === "/" ? "bg-[#203c88] text-white border-[#203c88]" : "bg-white text-slate-800 hover:bg-slate-100 border-slate-200 dark:bg-[#172747] dark:border-[#3b5284] dark:text-white"
              )}
            >
              <Home className="w-4 h-4" />
            </Link>

            {/* Officer Notifications Bell */}
            <TopBarNotifications isMobile={true} />
            <TopBarHindiAutocorrect />

            {/* Tablet-only inline utilities; kept inside drawer on <640px phones to prevent overlap */}
            <div className="hidden sm:flex items-center gap-1.5">
              <TopBarModuleSwitcher isMobile={true} />
              <TopBarThemeToggle />
              <TopBarDictation isMobile={true} />
              <TopBarLanguageSwitcher isMobile={true} />
              <TopBarPersonaSwitcher isMobile={true} />
            </div>

            {/* Drawer menu trigger */}
            <button
              type="button"
              onClick={() => setDrawerOpen(!drawerOpen)}
              aria-label="Toggle menu"
              aria-expanded={drawerOpen}
              className="min-w-[44px] min-h-[44px] sm:min-w-9 sm:min-h-9 rounded-md hover:bg-slate-100 text-slate-600 dark:text-slate-100 active:scale-95 flex items-center justify-center shrink-0 border border-slate-200 dark:border-[#273b63]"
            >
              {drawerOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>
          </div>
        </div>
      </header>

      {/* Mobile Drawer Menu */}
      {drawerOpen && (
        <div className="print:hidden fixed inset-0 z-[60] lg:hidden flex" role="dialog" aria-modal="true" aria-label="Mobile navigation menu">
          <div
            className="fixed inset-0 bg-black/40 backdrop-blur-xs transition-opacity"
            onClick={() => setDrawerOpen(false)}
          />
          <div className="relative w-4/5 max-w-xs bg-white dark:bg-[#0d1930] h-full text-slate-800 dark:text-slate-100 flex flex-col shadow-xl z-10 border-r border-slate-200 dark:border-[#223456]">
            <div className="p-3.5 border-b border-slate-200/80 bg-slate-50/60 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-md bg-slate-900 flex items-center justify-center text-white">
                  <Shield className="w-3.5 h-3.5" />
                </div>
                <div>
                  <h3 className="text-xs font-semibold text-slate-900">{t("Haryana Police CMS")}</h3>
                  <p className="text-[10px] text-slate-400">{currentUser.stationName}</p>
                </div>
              </div>
              <button type="button" onClick={() => setDrawerOpen(false)} aria-label="Close menu" className="min-w-[44px] min-h-[44px] flex items-center justify-center text-slate-400 hover:text-slate-700">
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Quick Utilities inside the mobile drawer */}
            <div className="p-2.5 border-b border-slate-200/80 dark:border-[#223456] bg-slate-50/80 dark:bg-[#091326]">
              <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-2">
                {t("Quick Tools")}
              </p>
              <div className="flex flex-wrap items-center gap-2">
                <div className="contents sm:hidden">
                  <TopBarModuleSwitcher isMobile={true} />
                  <TopBarThemeToggle />
                  <TopBarDictation isMobile={true} />
                </div>
                <TopBarLanguageSwitcher isMobile={true} />
                <button
                  type="button"
                  onClick={onToggleMobileParth}
                  aria-label={t("Floating PARTH button")}
                  aria-pressed={!mobileParthHidden}
                  title={mobileParthHidden ? t("Show PARTH") : t("Hide PARTH")}
                  className={cn(
                    "flex size-11 shrink-0 items-center justify-center rounded-md border transition-colors",
                    mobileParthHidden
                      ? "border-slate-200 bg-white text-slate-500 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-300"
                      : "border-blue-300 bg-blue-50 text-blue-800 dark:border-blue-500 dark:bg-blue-950 dark:text-blue-200"
                  )}
                >
                  <Bot className="size-5" aria-hidden="true" />
                </button>
                <div className="contents sm:hidden">
                  <TopBarPersonaSwitcher isMobile={true} />
                </div>
              </div>
            </div>

            <div className="p-3 border-b border-slate-200/80 bg-white">
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs font-semibold text-slate-900">{sessionUser.name}</p>
                {isViewAs && (
                  <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-amber-100 text-amber-800 border border-amber-300 shrink-0">
                    Viewing
                  </span>
                )}
              </div>
              <p className="text-[11px] text-slate-600">{t(sessionUser.roleDisplay)}</p>
              <p className="text-[10px] text-slate-400 font-mono mt-0.5">PNO: {sessionUser.pno}</p>
              {isViewAs && (
                <p className="mt-1.5 text-[10px] leading-snug text-amber-800 bg-amber-50 border border-amber-200 rounded px-1.5 py-1">
                  Opened under your own ID — {currentUser.name} ({currentUser.roleDisplay}) view. Data and changes follow that role.
                </p>
              )}
            </div>

            {/* Back to Module Selector Button in Drawer */}
            <div className="p-2.5 bg-slate-50/60 border-b border-slate-200/80">
              <Link
                href="/"
                onClick={() => setDrawerOpen(false)}
                className="w-full flex items-center justify-center gap-2 py-1.5 px-3 rounded-md bg-white hover:bg-slate-100 text-slate-800 text-xs font-medium border border-slate-200/80 transition-colors"
              >
                <LayoutGrid className="w-3.5 h-3.5 text-slate-600" />
                <span>&larr; {t("Modules Portal")}</span>
              </Link>
            </div>

            <nav className="flex-1 overflow-y-auto p-3 space-y-1">
              {isRoznamcha ? (
                <>
                  <div className="pt-1 pb-1 text-[10px] uppercase font-semibold text-slate-400">
                    {t("Roznamcha GD")}
                  </div>
                  <Link
                    href="/general-diary"
                    onClick={() => setDrawerOpen(false)}
                    className="block px-2.5 py-1.5 rounded-md text-xs font-medium text-slate-700 hover:bg-slate-100"
                  >
                    {t("Smart General Diary")}
                  </Link>
                  <Link
                    href="/general-diary/new"
                    onClick={() => setDrawerOpen(false)}
                    className="block px-2.5 py-1.5 rounded-md text-xs font-semibold text-red-600 hover:bg-red-50"
                  >
                    + {t("New GD Entry")}
                  </Link>
                  <Link
                    href="/general-diary?tab=SUGGESTIONS_DRAFTS"
                    onClick={() => setDrawerOpen(false)}
                    className="block px-2.5 py-1.5 rounded-md text-xs font-medium text-purple-700 hover:bg-purple-50"
                  >
                    ✨ {t("Auto-Suggestions & Drafts")}
                  </Link>
                  <Link
                    href="/general-diary?type=SHIFT_RELIEF_TURNOVER"
                    onClick={() => setDrawerOpen(false)}
                    className="block px-2.5 py-1.5 rounded-md text-xs font-medium text-slate-700 hover:bg-slate-100"
                  >
                    {t("Shift Turnover")}
                  </Link>
                  <Link
                    href="/general-diary?type=PATROL_DEPARTURE_RETURN"
                    onClick={() => setDrawerOpen(false)}
                    className="block px-2.5 py-1.5 rounded-md text-xs font-medium text-slate-700 hover:bg-slate-100"
                  >
                    {t("Patrol & Night Domination")}
                  </Link>
                </>
              ) : isComplaints ? (
                <>
                  <div className="pt-1 pb-1 text-[10px] uppercase font-semibold text-slate-400">
                    {t("Complaints")}
                  </div>
                  <Link
                    href="/complaints"
                    onClick={() => setDrawerOpen(false)}
                    className="block px-2.5 py-1.5 rounded-md text-xs font-medium text-slate-700 hover:bg-slate-100"
                  >
                    {t("Complaints Register")}
                  </Link>
                  {canRegisterComplaint && (
                    <Link
                      href="/complaints/register"
                      onClick={() => setDrawerOpen(false)}
                      className="block px-2.5 py-1.5 rounded-md text-xs font-semibold text-red-600 hover:bg-red-50 flex items-center gap-1.5"
                    >
                      <PlusCircle className="w-3.5 h-3.5" />
                      {t("Register Complaint")}
                    </Link>
                  )}
                  <Link
                    href="/enquiry-workspace"
                    onClick={() => setDrawerOpen(false)}
                    className="block px-2.5 py-1.5 rounded-md text-xs font-medium text-slate-700 hover:bg-slate-100"
                  >
                    {t("Field Enquiry Workspace")}
                  </Link>
                </>
              ) : isFir ? (
                <>
                  <div className="pt-1 pb-1 text-[10px] uppercase font-semibold text-slate-400">
                    {t("FIR")}
                  </div>
                  <Link
                    href="/fir"
                    onClick={() => setDrawerOpen(false)}
                    className="block px-2.5 py-1.5 rounded-md text-xs font-medium text-slate-700 hover:bg-slate-100"
                  >
                    {t("FIR Register")}
                  </Link>
                  <Link
                    href="/fir/part-b"
                    onClick={() => setDrawerOpen(false)}
                    className="block px-2.5 py-1.5 rounded-md text-xs font-medium text-slate-700 hover:bg-slate-100"
                  >
                    {t("FIR Part B")}
                  </Link>
                  <Link
                    href="/fir/complete-cases"
                    onClick={() => setDrawerOpen(false)}
                    className="block px-2.5 py-1.5 rounded-md text-xs font-medium text-slate-700 hover:bg-slate-100"
                  >
                    {t("Complete cases")}
                  </Link>
                  {canRegisterFir(currentUser?.role) && (
                    <Link
                      href="/fir/register"
                      onClick={() => setDrawerOpen(false)}
                      className="block px-2.5 py-1.5 rounded-md text-xs font-semibold text-red-600 hover:bg-red-50 flex items-center gap-1.5"
                    >
                      <PlusCircle className="w-3.5 h-3.5" />
                      {t("Register FIR")}
                    </Link>
                  )}
                  <Link
                    href="/fir-workspace"
                    onClick={() => setDrawerOpen(false)}
                    className="block px-2.5 py-1.5 rounded-md text-xs font-medium text-slate-700 hover:bg-slate-100"
                  >
                    {t("Investigation Workspace")}
                  </Link>
                </>
              ) : isRegistrations ? (
                <>
                  <div className="pt-1 pb-1 text-[10px] uppercase font-semibold text-slate-400">
                    {t("Registrations")}
                  </div>
                  <Link
                    href="/registrations"
                    onClick={() => setDrawerOpen(false)}
                    className="block px-2.5 py-1.5 rounded-md text-xs font-medium text-slate-700 hover:bg-slate-100"
                  >
                    {t("Registrations Register")}
                  </Link>
                </>
              ) : isReports ? (
                <>
                  <div className="pt-1 pb-1 text-[10px] uppercase font-semibold text-slate-400">
                    {t("Reports")}
                  </div>
                  <Link
                    href="/reports"
                    onClick={() => setDrawerOpen(false)}
                    className="block px-2.5 py-1.5 rounded-md text-xs font-medium text-slate-700 hover:bg-slate-100"
                  >
                    {t("Crime SITREP & Judicial Audit Console")}
                  </Link>
                </>
              ) : isProsecution ? (
                <>
                  <div className="pt-1 pb-1 text-[10px] uppercase font-semibold text-slate-400">
                    {t("Prosecution")}
                  </div>
                  <Link
                    href="/prosecution?tab=challan_scrutiny&subtab=scrutiny_perform"
                    onClick={() => setDrawerOpen(false)}
                    className="block px-2.5 py-1.5 rounded-md text-xs font-medium text-slate-700 hover:bg-slate-100"
                  >
                    {t("Challan Scrutiny")}
                  </Link>
                  <Link
                    href="/prosecution?tab=courts&subtab=bail_reply"
                    onClick={() => setDrawerOpen(false)}
                    className="block px-2.5 py-1.5 rounded-md text-xs font-medium text-slate-700 hover:bg-slate-100"
                  >
                    {t("Courts")}
                  </Link>
                  <Link
                    href="/prosecution/iif-vi"
                    aria-current={pathname === "/prosecution/iif-vi" ? "page" : undefined}
                    onClick={() => setDrawerOpen(false)}
                    className="block rounded-md px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-100 aria-[current=page]:bg-[#203c88] aria-[current=page]:text-white"
                  >
                    IIF-VI
                  </Link>
                  <Link
                    href="/prosecution/iif-vii"
                    aria-current={pathname === "/prosecution/iif-vii" ? "page" : undefined}
                    onClick={() => setDrawerOpen(false)}
                    className="block rounded-md px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-100 aria-[current=page]:bg-[#203c88] aria-[current=page]:text-white"
                  >
                    IIF-VII
                  </Link>
                  <Link
                    href="/acts-sections"
                    onClick={() => setDrawerOpen(false)}
                    className="block px-2.5 py-1.5 rounded-md text-xs font-medium text-slate-700 hover:bg-slate-100"
                  >
                    {t("ACT and SECTIONs")}
                  </Link>
                </>
              ) : (
                <>
                  <div className="pt-1 pb-1 text-[10px] uppercase font-semibold text-slate-400">
                    {t("Modules")}
                  </div>
                  <Link
                    href="/general-diary"
                    onClick={() => setDrawerOpen(false)}
                    className="block px-2.5 py-1.5 rounded-md text-xs font-medium text-slate-700 hover:bg-slate-100"
                  >
                    {t("Smart General Diary")}
                  </Link>
                  <Link
                    href="/complaints"
                    onClick={() => setDrawerOpen(false)}
                    className="block px-2.5 py-1.5 rounded-md text-xs font-medium text-slate-700 hover:bg-slate-100"
                  >
                    {t("Complaints Register")}
                  </Link>
                  <Link
                    href="/fir"
                    onClick={() => setDrawerOpen(false)}
                    className="block px-2.5 py-1.5 rounded-md text-xs font-medium text-slate-700 hover:bg-slate-100"
                  >
                    {t("FIR Register")}
                  </Link>
                  <Link
                    href="/registrations"
                    onClick={() => setDrawerOpen(false)}
                    className="block px-2.5 py-1.5 rounded-md text-xs font-medium text-slate-700 hover:bg-slate-100"
                  >
                    {t("Registrations")}
                  </Link>
                  <Link
                    href="/acts-sections"
                    onClick={() => setDrawerOpen(false)}
                    className="block px-2.5 py-2 rounded-md text-xs font-medium text-slate-700 hover:bg-slate-100"
                  >
                    {t("ACT and SECTIONs")}
                  </Link>
                  <Link
                    href="/reports"
                    onClick={() => setDrawerOpen(false)}
                    className="block px-2.5 py-2 rounded-md text-xs font-medium text-slate-700 hover:bg-slate-100"
                  >
                    {t("Reports & Audit")}
                  </Link>
                  <Link
                    href="/telecom"
                    onClick={() => setDrawerOpen(false)}
                    className="block px-2.5 py-2 rounded-md text-xs font-medium text-slate-700 hover:bg-slate-100"
                  >
                    {t("Telecom Evidence Analysis")}
                  </Link>
                  <Link
                    href="/prosecution"
                    onClick={() => setDrawerOpen(false)}
                    className="block px-2.5 py-2 rounded-md text-xs font-medium text-slate-700 hover:bg-slate-100"
                  >
                    {t("Prosecution & Courts")}
                  </Link>
                  <Link
                    href="/audits"
                    onClick={() => setDrawerOpen(false)}
                    className="block px-2.5 py-2 rounded-md text-xs font-medium text-slate-700 hover:bg-slate-100"
                  >
                    {t("Audits & Inspection")}
                  </Link>
                  <Link
                    href="/tada"
                    onClick={() => setDrawerOpen(false)}
                    className="block px-2.5 py-2 rounded-md text-xs font-medium text-amber-800 bg-amber-50/60 hover:bg-amber-100"
                  >
                    {t("TA DA Form (यात्रा भत्ता प्रपत्र)")}
                  </Link>
                </>
              )}

              <div className="pt-2 border-t border-slate-200/80 my-2"></div>
              <button
                onClick={() => {
                  setDrawerOpen(false);
                  window.dispatchEvent(new CustomEvent("cms-open-role-switcher"));
                }}
                className="w-full text-left px-2.5 py-1.5 rounded-md text-xs font-medium text-slate-700 hover:bg-slate-100 flex items-center gap-2"
              >
                <UserCog className="w-3.5 h-3.5 text-slate-500" /> {t("Switch Police Role")}
              </button>
            </nav>

            <div className="p-3 border-t border-slate-200/80 bg-slate-50/60">
              <button
                onClick={() => {
                  setDrawerOpen(false);
                  setShowSignOutModal(true);
                }}
                className="w-full flex items-center justify-center gap-2 py-1.5 rounded-md bg-white hover:bg-rose-50 text-slate-700 hover:text-rose-700 border border-slate-200/80 text-xs font-medium transition-colors cursor-pointer"
              >
                {t("Sign Out")}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Mobile Sign Out Confirmation Modal */}
      {showSignOutModal && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in-0 duration-150">
          <div
            className="bg-white rounded-2xl shadow-2xl border border-slate-200/80 max-w-sm w-full p-6 text-slate-800 animate-in zoom-in-95 duration-150"
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="mobile-signout-modal-title"
          >
            <div className="flex items-center gap-3.5 mb-3.5">
              <div className="w-11 h-11 rounded-xl bg-rose-50 text-rose-600 flex items-center justify-center shrink-0 border border-rose-200/60 shadow-2xs">
                <Shield className="w-5 h-5 text-rose-600" />
              </div>
              <div className="min-w-0">
                <h3 id="mobile-signout-modal-title" className="text-sm font-bold text-slate-900 leading-tight">
                  {t("Sign Out Confirmation")}
                </h3>
                <p className="text-xs text-slate-500 truncate mt-0.5">
                  {sessionUser.name}
                </p>
              </div>
            </div>

            <p className="text-xs text-slate-600 mb-6 leading-relaxed">
              {t("Are you sure you want to sign out of Haryana Police CMS?")}
            </p>

            <div className="grid grid-cols-2 gap-3 pt-1 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setShowSignOutModal(false)}
                className="w-full py-2.5 px-4 rounded-xl text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 active:scale-98 transition-all cursor-pointer border border-slate-300 text-center shadow-2xs"
              >
                {t("Cancel")}
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowSignOutModal(false);
                  logout();
                }}
                className="w-full py-2.5 px-4 rounded-xl text-xs font-bold text-white bg-rose-600 hover:bg-rose-700 active:scale-98 transition-all cursor-pointer border border-rose-700 text-center shadow-xs"
              >
                {t("Confirm")}
              </button>
            </div>
          </div>
        </div>
      )}

    </>
  );
}
