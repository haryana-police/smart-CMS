"use client";

import { isMhcOrMmRole } from "@/lib/officerRoles";
import React from "react";
import Link from "next/link";
import { canRegisterFir } from "@/lib/firIntegrity";
import { usePathname } from "next/navigation";
import {
  FileText,
  PlusCircle,
  BookOpen,
  UserCheck,
  Clock,
  LayoutGrid,
  Building,
  Flame,
  Scale,
  ClipboardList,
  FileBarChart,
  BookmarkCheck,
  FileCheck2,
  ReceiptText,
  Sparkles,
  CheckCircle2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/context/AuthContext";

interface MobileNavItem {
  name: string;
  href: string;
  icon: React.ElementType;
  isPrimaryAction?: boolean;
  opensRegisterPrint?: boolean;
}

export function MobileBottomNav() {
  const pathname = usePathname();
  const { currentUser } = useAuth();

  const isFir = pathname.startsWith("/fir") || pathname.startsWith("/fir-workspace");
  const isComplaints = !isFir && (pathname.startsWith("/complaints") || pathname.startsWith("/enquiry-workspace"));
  const isRoznamcha = pathname.startsWith("/general-diary");
  const isRegistrations = pathname.startsWith("/registrations");
  const isReports = pathname.startsWith("/reports");
  const isProsecution = pathname.startsWith("/prosecution");
  const isActs = pathname.startsWith("/acts-sections");

  // Only MHC, SHO, and Superior officers can register complaints / FIR
  const isMhc = isMhcOrMmRole(currentUser?.role);
  const isSho = currentUser?.role === "SHO" || currentUser?.id === "usr_sho_1";
  const isSuperior = currentUser?.role === "DSP_SUBDIV" || currentUser?.role === "SP_DISTRICT" || currentUser?.role === "SUPER_ADMIN";
  const canRegisterComplaint = isMhc || isSho || isSuperior;

  // 1. Navigation items strictly for FIR Module
  const firItems: MobileNavItem[] = [
    { name: "FIR Register", href: "/fir", icon: Scale },
    { name: "Part B", href: "/fir/part-b", icon: FileCheck2 },
    ...(canRegisterFir(currentUser?.role)
      ? [{ name: "Register FIR", href: "/fir/register", icon: PlusCircle, isPrimaryAction: true }]
      : []),
    { name: "Complete", href: "/fir/complete-cases", icon: CheckCircle2 },
    { name: "Modules", href: "/", icon: LayoutGrid },
  ];

  // 2. Navigation items strictly for Complaint Module
  const complaintItems: MobileNavItem[] = [
    { name: "Complaints", href: "/complaints", icon: FileText },
    { name: "Enquiry", href: "/enquiry-workspace", icon: UserCheck },
    ...(canRegisterComplaint
      ? [{ name: "Register Complaint", href: "/complaints/register", icon: PlusCircle, isPrimaryAction: true }]
      : []),
    { name: "CM Window", href: "/complaints?priority=CM_WINDOW_VIP", icon: Flame },
    { name: "Modules", href: "/", icon: LayoutGrid },
  ];

  // 3. Navigation items strictly for Roznamcha GD Module
  const roznamchaItems: MobileNavItem[] = [
    { name: "GD Diary", href: "/general-diary", icon: BookOpen },
    { name: "Drafts", href: "/general-diary?tab=SUGGESTIONS_DRAFTS", icon: Sparkles },
    { name: "New GD", href: "/general-diary/new", icon: PlusCircle, isPrimaryAction: true },
    { name: "Register", href: "/general-diary?printRegister=1", icon: BookOpen, opensRegisterPrint: true },
    { name: "Modules", href: "/", icon: LayoutGrid },
  ];

  // 4. Navigation items strictly for Registrations Module
  const registrationsItems: MobileNavItem[] = [
    { name: "Registers", href: "/registrations", icon: ClipboardList },
    { name: "Missing", href: "/registrations?tab=MISSING_PERSON", icon: UserCheck },
    { name: "New Entry", href: "/registrations", icon: PlusCircle, isPrimaryAction: true },
    { name: "Bare Acts", href: "/acts-sections", icon: Scale },
    { name: "Modules", href: "/", icon: LayoutGrid },
  ];

  // 5. Navigation items strictly for Reports Module
  const reportsItems: MobileNavItem[] = [
    { name: "SITREP", href: "/reports?tab=crime_sitrep", icon: FileBarChart },
    { name: "Diary", href: "/reports?tab=weekly_crime_diary", icon: BookOpen },
    { name: "IGP Review", href: "/reports?tab=igp_presentation", icon: FileText },
    { name: "Saved", href: "/reports?tab=saved_reports", icon: BookmarkCheck },
    { name: "Modules", href: "/", icon: LayoutGrid },
  ];

  // 6. Navigation items strictly for Prosecution Module
  const prosecutionItems: MobileNavItem[] = [
    { name: "Scrutiny", href: "/prosecution?tab=challan_scrutiny&subtab=scrutiny_perform", icon: FileCheck2 },
    { name: "Rules", href: "/prosecution?tab=challan_scrutiny&subtab=common_malpractices", icon: Scale },
    { name: "Bail Reply", href: "/prosecution?tab=courts&subtab=bail_reply", icon: ReceiptText },
    { name: "Status", href: "/prosecution?tab=courts&subtab=status_report", icon: FileText },
    { name: "Modules", href: "/", icon: LayoutGrid },
  ];

  // 7. Navigation items strictly for Acts & Sections Module
  const actsItems: MobileNavItem[] = [
    { name: "Bare Acts", href: "/acts-sections", icon: Scale },
    { name: "FIR", href: "/fir", icon: Scale },
    { name: "Complaints", href: "/complaints", icon: FileText },
    { name: "Roznamcha", href: "/general-diary", icon: BookOpen },
    { name: "Modules", href: "/", icon: LayoutGrid },
  ];

  // 8. Navigation items for Portal Home / Station / Settings
  const portalItems: MobileNavItem[] = [
    { name: "Roznamcha", href: "/general-diary", icon: BookOpen },
    { name: "Complaints", href: "/complaints", icon: FileText },
    { name: "FIR", href: "/fir", icon: Scale },
    { name: "Station", href: "/station-profile", icon: Building },
    { name: "Modules", href: "/", icon: LayoutGrid },
  ];

  const currentNav = isFir
    ? firItems
    : isComplaints
    ? complaintItems
    : isRoznamcha
    ? roznamchaItems
    : isRegistrations
    ? registrationsItems
    : isReports
    ? reportsItems
    : isProsecution
    ? prosecutionItems
    : isActs
    ? actsItems
    : portalItems;

  const gridColsClass =
    currentNav.length === 5
      ? "grid-cols-5"
      : currentNav.length === 4
      ? "grid-cols-4"
      : currentNav.length === 3
      ? "grid-cols-3"
      : "grid-cols-5";

  return (
    <nav className="print:hidden lg:hidden fixed bottom-0 left-0 right-0 z-40 bg-white/95 dark:bg-[#0d1930]/95 backdrop-blur-sm border-t border-slate-200/80 dark:border-[#1e2c48] shadow-lg pb-safe">
      <div className={cn("grid h-[var(--cms-mobile-nav-height)] max-w-lg mx-auto items-center px-1", gridColsClass)}>
        {currentNav.map((item) => {
          const Icon = item.icon;
          const isActive = !item.opensRegisterPrint && (
            item.href === "/"
              ? pathname === "/"
              : item.href.includes("?")
              ? pathname === item.href.split("?")[0]
              : pathname === item.href);

          if (item.isPrimaryAction) {
            return (
              <div key={item.name} className="flex flex-col items-center justify-center -mt-4">
                <Link
                  href={item.href}
                  className="flex flex-col items-center justify-center w-12 h-12 rounded-full bg-red-600 hover:bg-red-700 text-white shadow-md border-2 border-white active:scale-95 transition-all"
                  aria-label={item.name}
                  title={item.name}
                >
                  <PlusCircle className="w-6 h-6" />
                </Link>
                <span className="text-[9px] font-bold text-red-600 mt-0.5 tracking-tight uppercase">
                  {item.name}
                </span>
              </div>
            );
          }

          return (
            <Link
              key={item.name}
              href={item.href}
              onNavigate={(event) => {
                if (!item.opensRegisterPrint || pathname !== "/general-diary") return;
                event.preventDefault();
                const url = new URL(window.location.href);
                url.searchParams.set("printRegister", "1");
                window.history.replaceState(null, "", url);
              }}
              className={cn(
                "flex flex-col items-center justify-center h-full min-h-[44px] py-1 text-center transition-colors active:scale-95",
                isActive ? "text-red-700 font-semibold" : "text-slate-500 hover:text-slate-800"
              )}
            >
              <Icon className={cn("w-4.5 h-4.5", isActive ? "text-red-600" : "text-slate-500")} />
              <span className="text-[10px] mt-0.5 tracking-tight truncate max-w-[64px]">{item.name}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
