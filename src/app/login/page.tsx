"use client";

import React, { useState } from "react";
import { useGuardedRouter as useRouter } from "@/hooks/useGuardedRouter";
import { Shield, Lock, User, AlertCircle, ArrowRight, Eye, EyeOff } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { Button } from "@/components/ui/button";

type OfficerCard = {
  id: string;
  name: string;
  roleDisplay: string;
  district: string;
  stationName: string;
};

export default function LoginPage() {
  const router = useRouter();
  const { login, isAuthenticated, sessionUser, enterViewAs } = useAuth();
  const [pickerEnabled, setPickerEnabled] = useState(false);
  const [localAutoAdmin, setLocalAutoAdmin] = useState(false);
  const [officers, setOfficers] = useState<OfficerCard[]>([]);
  const [loadingOfficers, setLoadingOfficers] = useState(true);
  const [officerLoadError, setOfficerLoadError] = useState(false);
  const [selectedStation, setSelectedStation] = useState("");
  const [officerSearch, setOfficerSearch] = useState("");
  const pinInput = React.useRef<HTMLInputElement>(null);
  const isDeveloper = isAuthenticated && sessionUser.id === "cms_developer_admin";
  const showOfficerPicker = pickerEnabled || (localAutoAdmin && isDeveloper);
  React.useEffect(() => {
    fetch("/api/auth/session", { cache: "no-store" }).then(response => response.json()).then(data => {
      setPickerEnabled(data.officerPickerEnabled === true);
      setLocalAutoAdmin(data.localAutoAdmin === true);
    }).catch(() => {});
  }, []);
  React.useEffect(() => {
    if (!showOfficerPicker) return;
    const controller = new AbortController();
    fetch("/api/admin/accounts?view=officer-switcher", { signal: controller.signal })
      .then(async response => {
        if (!response.ok) throw new Error("Could not load officer accounts.");
        const data = await response.json();
        if (!controller.signal.aborted) setOfficers(data.officers);
      })
      .catch(() => { if (!controller.signal.aborted) setOfficerLoadError(true); })
      .finally(() => { if (!controller.signal.aborted) setLoadingOfficers(false); });
    return () => controller.abort();
  }, [isDeveloper, showOfficerPicker]);
  const [pno, setPno] = useState("");
  const [pin, setPin] = useState("");
  const [rememberDevice, setRememberDevice] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const [selectedDistrict, setSelectedDistrict] = useState<string>("Panipat");
  const officerDistricts = [...new Set(officers.map(officer => officer.district))];
  const officerDistrict = officerDistricts.includes(selectedDistrict) ? selectedDistrict : officerDistricts[0];
  const districtOfficers = officers.filter(officer => officer.district === officerDistrict);
  const stations = [...new Set(districtOfficers.map(officer => officer.stationName))];
  const station = stations.includes(selectedStation) ? selectedStation : stations.length === 1 ? stations[0] : "";
  const searchTerm = officerSearch.trim().toLowerCase();
  const visibleOfficers = districtOfficers.filter(officer =>
    (!station || officer.stationName === station) &&
    (!searchTerm || officer.name.toLowerCase().includes(searchTerm) || officer.roleDisplay.toLowerCase().includes(searchTerm))
  );

  const signIn = async (username: string, password: string) => {
    setError(null);
    setIsLoading(true);
    const ok = await login(username, password, undefined, rememberDevice);
    setIsLoading(false);
    if(ok){
      setPin("");
      if (!showOfficerPicker || username.trim().toUpperCase() !== "DEV-ADMIN") router.push('/');
    }else setError((window as any).__lastLoginError || 'Invalid PNO or PIN. Please verify your credentials.');
  };

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const fields = new FormData(event.currentTarget);
    void signIn(String(fields.get("username") ?? ""), String(fields.get("password") ?? ""));
  };

  const quickLogin = async (quickLoginId: string, errorMessage: string) => {
    setError(null);
    setIsLoading(true);
    try {
      const response = await fetch("/api/auth/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ quickLoginId }),
      });
      if (!response.ok) {
        setError(errorMessage);
        setIsLoading(false);
        return;
      }
      window.location.href = "/";
    } catch {
      setError(errorMessage);
      setIsLoading(false);
    }
  };

  const openDeveloperRoster = () => {
    void quickLogin("cms_developer_admin", "Developer admin login failed.");
  };

  const handleOfficerView = async (officer: OfficerCard) => {
    await quickLogin(officer.id, "Officer account could not be opened.");
  };

  return (
    <div className="min-h-screen bg-slate-950 flex flex-col justify-center items-center p-4 sm:p-6 text-slate-100">
      <div className="w-full max-w-5xl">
        {/* Header Insignia with Official CMS Haryana Police Logo */}
        <div className="text-center mb-6 flex flex-col items-center">
          <div className="bg-white/95 rounded-2xl p-3 shadow-lg border border-slate-200/40 inline-flex items-center justify-center max-w-[340px] w-full">
            <img
              src="/cms-haryana-logo.png"
              alt="CMS Case Management System - Haryana Police"
              className="h-20 sm:h-22 w-auto object-contain drop-shadow-xs"
            />
          </div>
        </div>

        {/* Two-Column Split Layout: Half Left (Login Form) & Half Right (Demo Personas) */}
        <div className={`grid grid-cols-1 ${showOfficerPicker ? 'lg:grid-cols-2' : 'max-w-md mx-auto'} gap-6 items-stretch`}>
          {/* Half Left: Police Personnel Login Card */}
          <div className="bg-white rounded-xl shadow-lg border border-slate-200 p-6 sm:p-7 text-slate-900 flex flex-col justify-between">
            <div>
              <div className="border-b border-slate-100 pb-3 mb-4">
                <div className="flex items-center gap-2">
                  <Shield className="w-5 h-5 text-[#203c88]" />
                  <h2 className="text-base font-bold text-slate-900">Police Personnel Login</h2>
                </div>
                <p className="text-xs text-slate-500 mt-1">
                  Sign in with your assigned PNO and PIN.
                </p>
              </div>

              {error && (
                <div className="mb-4 p-2.5 bg-rose-50 border border-rose-200 text-rose-800 text-xs rounded-lg flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0 text-rose-700" />
                  <span>{error}</span>
                </div>
              )}

              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label htmlFor="login-pno" className="block text-xs font-semibold text-slate-700 mb-1">
                    Permanent Police Number (PNO)
                  </label>
                  <div className="relative">
                    <User className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                    <input
                      id="login-pno"
                      name="username"
                      autoComplete="username"
                      type="text"
                      value={pno}
                      onChange={(e) => setPno(e.target.value)}
                      placeholder="e.g. HR-04291882"
                      required
                      className="w-full pl-9 pr-3 py-2 text-xs sm:text-sm bg-slate-50 border border-slate-300 rounded-lg focus:ring-1 focus:ring-slate-800 focus:outline-none font-mono"
                    />
                  </div>
                </div>

                <div>
                  <label htmlFor="login-password" className="block text-xs font-semibold text-slate-700 mb-1">
                    Security PIN / Password
                  </label>
                  <div className="relative">
                    <Lock className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                    <input
                      ref={pinInput}
                      id="login-password"
                      name="password"
                      autoComplete="current-password"
                      type={showPassword ? "text" : "password"}
                      value={pin}
                      onChange={(e) => setPin(e.target.value)}
                      placeholder="••••••"
                      required
                      className="w-full pl-9 pr-10 py-2 text-xs sm:text-sm bg-slate-50 border border-slate-300 rounded-lg focus:ring-1 focus:ring-slate-800 focus:outline-none font-mono"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      tabIndex={-1}
                      className="absolute right-3 top-2.5 text-slate-400 hover:text-slate-700 focus:outline-none cursor-pointer"
                      aria-label={showPassword ? "Hide password" : "Show password"}
                      title={showPassword ? "Hide password" : "Show password"}
                    >
                      {showPassword ? (
                        <EyeOff className="w-4 h-4" />
                      ) : (
                        <Eye className="w-4 h-4" />
                      )}
                    </button>
                  </div>
                </div>

                {pno.trim().toUpperCase() === "DEV-ADMIN" && (
                  <label className="flex items-center gap-2 text-xs text-slate-700">
                    <input type="checkbox" checked={rememberDevice}
                      onChange={event => setRememberDevice(event.target.checked)} />
                    Remember this device for 7 days
                  </label>
                )}
                <Button
                  type="submit"
                  variant="primary"
                  size="lg"
                  isLoading={isLoading}
                  className="w-full font-semibold text-xs sm:text-sm bg-[#203c88] hover:bg-[#1a3170] text-white mt-3 cursor-pointer"
                >
                  Sign In to CMS Portal
                </Button>
              </form>
            </div>

            <div className="mt-6 pt-3 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-400">
              <span>Security: RESTRICTED</span>
              <span>CCTNS / ICJS Integrated</span>
            </div>
          </div>

          {showOfficerPicker && (
            <section className="flex flex-col justify-between rounded-xl border border-slate-200 bg-white p-6 text-slate-900 shadow-lg sm:p-7">
              <div>
                <div className="mb-3 flex items-center justify-between border-b border-slate-100 pb-3">
                  <h2 className="text-base font-bold">Officer Login by District</h2>
                  <span className="rounded bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-700">1-Click Login</span>
                </div>
                <>
                    <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                      <div className="flex flex-wrap gap-2">
                        {officerDistricts.map(district => (
                          <button key={district} type="button" aria-pressed={district === officerDistrict}
                            onClick={() => { setSelectedDistrict(district); setSelectedStation(""); }}
                            className={`rounded-md px-2.5 py-1 text-xs font-semibold ${district === officerDistrict ? "bg-[#203c88] text-white" : "bg-slate-100 text-slate-700"}`}>
                            {district}
                          </button>
                        ))}
                      </div>
                      <input
                        type="search"
                        aria-label="Search officer accounts"
                        value={officerSearch}
                        onChange={event => setOfficerSearch(event.target.value)}
                        placeholder="Search officer or role..."
                        className="w-full sm:w-48 rounded-lg border border-slate-300 bg-slate-50 px-2.5 py-1 text-xs text-slate-800 placeholder:text-slate-400 focus:border-[#203c88] focus:bg-white focus:outline-none"
                      />
                    </div>
                    {stations.length > 0 && (
                      <select aria-label="Police station" value={station} onChange={event => setSelectedStation(event.target.value)}
                        className="mb-3 w-full rounded-lg border border-slate-300 bg-slate-50 px-2.5 py-1.5 text-xs">
                        {stations.length > 1 && <option value="">All police stations</option>}
                        {stations.map(name => <option key={name} value={name}>{name}</option>)}
                      </select>
                    )}
                    <div aria-label="Officer accounts" className="grid max-h-72 grid-cols-1 gap-1.5 overflow-y-auto pr-0.5">
                      {visibleOfficers.map(officer => (
                        <button key={officer.id} type="button" disabled={isLoading} onClick={() => handleOfficerView(officer)}
                          className="flex w-full items-center justify-between rounded-lg border border-slate-200 bg-slate-50 p-2.5 text-left hover:border-blue-300 hover:bg-blue-50 disabled:opacity-60">
                          <div>
                            <p className="text-xs font-semibold text-slate-800">{officer.name}</p>
                            <p className="mt-0.5 text-[10px] text-slate-500">{officer.roleDisplay}</p>
                          </div>
                          <ArrowRight className="ml-2 h-3.5 w-3.5 shrink-0 text-slate-400" />
                        </button>
                      ))}
                    </div>
                    {(loadingOfficers || officerLoadError || visibleOfficers.length === 0) && (
                      <p role="status" className="text-xs text-slate-600">
                        {loadingOfficers ? "Loading officer accounts…" : officerLoadError ? "Could not load officer accounts. Refresh to try again." : "No officer accounts found."}
                      </p>
                    )}
                  </>
              </div>
              <button type="button" disabled={isLoading}
                onClick={openDeveloperRoster}
                className="mt-4 flex w-full items-center justify-between rounded-lg bg-slate-900 p-2.5 text-left text-xs font-semibold text-white hover:bg-slate-800">
                {isDeveloper ? "Open Developer Admin dashboard" : "Developer Admin"}
                <ArrowRight className="h-3.5 w-3.5 text-slate-300" />
              </button>
            </section>
          )}

        </div>

        {/* Security Notice */}
        <p className="text-center text-[11px] text-slate-200 mt-6 max-w-sm mx-auto">
          Authorized Haryana Police Personnel Only. Unauthorized access is punishable under IT Act 2000.
        </p>
      </div>
    </div>
  );
}
