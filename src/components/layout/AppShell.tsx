"use client";

import { isMhcOrMmRole } from "@/lib/officerRoles";
import React, { useState } from "react";
import { usePathname } from "next/navigation";
import { useGuardedRouter as useRouter } from "@/hooks/useGuardedRouter";
import { Sidebar } from "./Sidebar";
import { MobileHeader } from "./MobileHeader";
import { MobileBottomNav } from "./MobileBottomNav";
import { TopBarHindiAutocorrect } from "./TopBarHindiAutocorrect";
import { TopBarDictation } from "./TopBarDictation";
import { TopBarModuleSwitcher } from "./TopBarModuleSwitcher";
import { TopBarThemeToggle } from "./TopBarThemeToggle";
import { TopBarNotifications } from "./TopBarNotifications";
import { TopBarLanguageSwitcher } from "./TopBarLanguageSwitcher";
import { TopBarPersonaSwitcher } from "./TopBarPersonaSwitcher";
import { useAuth } from "@/context/AuthContext";
import { useLanguage } from "@/context/LanguageContext";
import {
  PlusCircle,
  BookOpen,
  ChevronDown,
  Building,
  FileText,
  LayoutGrid,
  Scale,
  Home,
} from "lucide-react";
import Link from "next/link";
import { canRegisterFir } from "@/lib/firIntegrity";
import { Button } from "@/components/ui/button";
import { DraggableAgentButton } from "@/components/agent/DraggableAgentButton";
import { GlobalUploadCameraModal } from "@/components/ui/camera-capture-button";
import { FirPersistenceStatus } from "@/components/fir/FirPersistenceStatus";
import { ViewAsBanner } from "./ViewAsBanner";
import { cn } from "@/lib/utils";


export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { currentUser, sessionUser, isAuthenticated, switching } = useAuth();
  const { t } = useLanguage();

  const router = useRouter();
  const [complaintSaveError,setComplaintSaveError]=useState('');
  const [parthPreference, setParthPreference] = useState<{ key: string; hidden: boolean }>();
  const parthPreferenceKey = `cms:mobile-parth-hidden:${sessionUser.id}`;
  const mobileParthHidden = parthPreference?.key === parthPreferenceKey && parthPreference.hidden;

  React.useEffect(() => {
    if (!isAuthenticated) return;
    let hidden = false;
    try {
      hidden = localStorage.getItem(parthPreferenceKey) === "true";
    } catch {
      // The setting still works for the current session.
    }
    setParthPreference({ key: parthPreferenceKey, hidden });
  }, [isAuthenticated, parthPreferenceKey]);

  function setMobileParthHidden(hidden: boolean) {
    setParthPreference({ key: parthPreferenceKey, hidden });
    try {
      localStorage.setItem(parthPreferenceKey, String(hidden));
    } catch {
      // The setting still works for the current session.
    }
  }

  React.useEffect(() => {
    const showSaveError = (event: Event) => setComplaintSaveError(String((event as CustomEvent).detail));
    window.addEventListener("complaints_save_error", showSaveError);
    return () => window.removeEventListener("complaints_save_error", showSaveError);
  }, []);


  // If unauthenticated and not on /login, redirect to /login — unless a persona/view-as
  // switch is remounting the tree right now: that must never send the developer to /login.
  React.useEffect(() => {
    if (!isAuthenticated && pathname !== "/login" && !switching) {
      router.replace("/login");
    }
  }, [isAuthenticated, pathname, router, switching]);

  // If on login page or unauthenticated, render without shell
  if (!isAuthenticated && pathname !== "/login") return null;
  if (pathname === "/login") {
    return <>{children}</>;
  }

  const isFir = pathname.startsWith("/fir") || pathname.startsWith("/fir-workspace");
  const isComplaints = !isFir && (pathname.startsWith("/complaints") || pathname.startsWith("/enquiry-workspace"));

  // Only MHC, SHO, and Superior officers can register complaints/FIR (EOs cannot register complaints or FIR)
  const isMhc = isMhcOrMmRole(currentUser?.role);
  const isSho = currentUser?.role === "SHO" || currentUser?.id === "usr_sho_1";
  const isSuperior = currentUser?.role === "DSP_SUBDIV" || currentUser?.role === "SP_DISTRICT" || currentUser?.role === "SUPER_ADMIN";
  const canRegisterComplaint = isMhc || isSho || isSuperior;

  return (
    <div className="cms-shell min-h-screen bg-white flex flex-col lg:flex-row antialiased text-slate-800">
      {complaintSaveError&&<div role="alert" className="fixed top-3 left-3 right-3 z-[150] bg-amber-50 text-amber-950 border border-amber-400 rounded-lg p-3 text-sm shadow-lg">{complaintSaveError}<button className="ml-4 underline" onClick={()=>setComplaintSaveError('')}>Dismiss</button></div>}
      {/* Desktop Collapsible Hover Sidebar */}
      <Sidebar />

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0 min-h-screen pb-20 lg:pb-8">
        <FirPersistenceStatus />
        {/* Developer view-as indicator: stays visible while browsing another officer's ID */}
        <ViewAsBanner />
        {/* Mobile Header */}
        <MobileHeader
          mobileParthHidden={mobileParthHidden}
          onToggleMobileParth={() => setMobileParthHidden(!mobileParthHidden)}
        />

        {/* Desktop Top Header Bar - Minimalist, clean backdrop-blur */}
        <header className="cms-topbar hidden lg:flex items-center justify-between min-h-14 px-6 bg-white text-slate-800 border-b border-slate-200/90 sticky top-0 z-45">
          {/* Left: Home Button + Station & Active Module Indicator */}
          <div className="flex items-center gap-3">
            {/* Direct HOME button to navigate to Modules Portal view */}
            <Link
              href="/"
              title="Modules Portal (Home)"
              className={cn(
                "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all border shadow-xs cursor-pointer",
                pathname === "/"
                  ? "bg-[#203c88] !text-white border-[#203c88] shadow-xs hover:bg-[#1a3170]"
                  : "bg-slate-50 hover:bg-slate-100 text-slate-700 hover:text-[#203c88] border-slate-200"
              )}
            >
              <Home className={cn("w-3.5 h-3.5 shrink-0", pathname === "/" ? "!text-white" : "text-slate-600")} />
              <span className={pathname === "/" ? "!text-white font-bold" : "font-bold"}>
                {t("HOME") || "HOME"}
              </span>
            </Link>

            <div className="h-4 w-px bg-slate-300"></div>

            <div className="flex items-center gap-2 text-slate-800">
              <Building className="w-3.5 h-3.5 text-slate-600 shrink-0" />
              <span className="font-semibold text-xs text-slate-800 tracking-tight whitespace-nowrap">
                {currentUser.stationName}
              </span>
              <span
                className="cms-topbar-district-badge text-[10px] bg-[#eef1ff] !text-[#203c88] dark:!bg-[#1e3a8a] dark:!text-[#ffffff] dark:!border-[#3b82f6] px-1.5 py-0.5 rounded border border-[#6d85bd]/60 font-semibold shadow-xs"
              >
                {currentUser.district}
              </span>
            </div>
            <div className="h-4 w-px bg-slate-300"></div>

            {/* Switch Module Dropdown with LayoutGrid Icon */}
            <TopBarModuleSwitcher />

            {/* Light / Dark Theme Toggle (Sun / Moon) */}
            <TopBarThemeToggle />
          </div>

          {/* Right Header Controls */}
          <div className="flex items-center gap-2.5">
            {/* Officer Notifications Bell Icon */}
            <TopBarNotifications />

            {/* In FIR Module (e.g. /fir Register Page), Red Register FIR Button right after Bell icon */}
            {isFir && pathname !== "/fir" && pathname !== "/fir/register" && canRegisterFir(currentUser?.role) && (
              <Link href="/fir/register">
                <Button size="sm" className="gap-1.5 text-xs bg-red-600 hover:bg-red-700 text-white font-bold shadow-xs">
                  <PlusCircle className="w-3.5 h-3.5" />
                  {t("Register FIR")}
                </Button>
              </Link>
            )}

            {/* Universal Police Dictation (Hindi & English Voice Input) */}
            <TopBarDictation />
            <TopBarHindiAutocorrect />

            {/* Bilingual Instant Language Switcher (Hindi / English) */}
            <TopBarLanguageSwitcher />

            {isComplaints && pathname !== '/complaints' && pathname !== '/complaints/register' && canRegisterComplaint && (
              <Link href="/complaints/register">
                <Button size="sm" className="gap-1.5 text-xs bg-red-600 hover:bg-red-700 text-white shadow-xs">
                  <PlusCircle className="w-3.5 h-3.5" />
                  {t("Register Complaint")}
                </Button>
              </Link>
            )}


            {/* Police Persona Switcher Icon with Dropdown */}
            <TopBarPersonaSwitcher />
          </div>
        </header>

        {/* Dynamic Page Content */}
        <main className="cms-main flex-1 p-3 sm:p-6 w-full mx-auto min-w-0">{children}</main>

        {/* Mobile Bottom Navigation */}
        <MobileBottomNav />
      </div>

      {/* Floating Draggable CMS AI Agent */}
      <DraggableAgentButton
        hiddenOnMobile={mobileParthHidden}
        onHideOnMobile={() => setMobileParthHidden(true)}
      />

      {/* Universal Camera & File Upload Option Selector */}
      <GlobalUploadCameraModal />




    </div>
  );
}
