"use client";
import React,{createContext,useContext,useEffect,useState} from 'react';
import {useRouter} from 'next/navigation';
import {UserSession} from '@/types';
import {firPersistence} from '@/services/persistentFirService';

// Placeholder identity shown only while the real session has not resolved yet.
// It is not a login account: the server never recognizes this id.
const UNAUTHENTICATED: UserSession = { id: 'cms_unauthenticated', pno: '', name: 'Not signed in',
  rank: 'INSPECTOR', rankDisplay: '', role: 'VIEWER_AUDITOR', roleDisplay: '',
  stationName: '', stationCode: '', district: '' };
interface AuthContextType {
  /** The identity the UI is acting as: the viewed officer while in view-as, else the signed-in user. */
  currentUser:UserSession;
  /** The really signed-in session user — stays the Developer Admin while viewing another ID. */
  sessionUser:UserSession;
  isViewAs:boolean;
  /** True while the app tree is being re-mounted for a persona/view-as switch — the login redirect must not fire. */
  switching:boolean;
  enterViewAs:(user:Pick<UserSession,'id'>)=>Promise<boolean>;
  exitViewAs:()=>Promise<boolean>;
  isAuthenticated:boolean;
  logout:()=>void;
  login:(pno:string,pin:string,station?:string,rememberDevice?:boolean)=>Promise<boolean>;
}
const AuthContext=createContext<AuthContextType|undefined>(undefined);
export function AuthProvider({children}:{children:React.ReactNode}){
 const router=useRouter();
 const [currentUser,setCurrentUser]=useState(UNAUTHENTICATED),[sessionUser,setSessionUser]=useState(UNAUTHENTICATED),[isViewAs,setViewAs]=useState(false),[switching,setSwitching]=useState(false),[isAuthenticated,setAuthenticated]=useState(false),[ready,setReady]=useState(false);
 async function accept(user:UserSession,realUser?:UserSession,viewAs=false){setSwitching(true);setAuthenticated(false);localStorage.setItem('haryana_police_cms_user',user.id);localStorage.removeItem('cms_demo_logged_out');try{await firPersistence.hydrate(user).catch(()=>{});}finally{setCurrentUser(user);setSessionUser(realUser||user);setViewAs(viewAs);setAuthenticated(true);setSwitching(false);window.dispatchEvent(new CustomEvent('cms_user_switched',{detail:user}));}}
 useEffect(() => {
   let active = true;
   fetch('/api/auth/session', { cache: 'no-store' })
     .then(async (r) => {
       if (!active) return;
       if (r.ok) {
         const b = await r.json();
         if (b.user) {
           await accept(b.user, b.sessionUser, Boolean(b.viewAsActive));
           return;
         }
       }
     })
     .catch(() => {})
     .finally(() => {
       if (active) setReady(true);
     });
   return () => { active = false; };
 }, []);
 useEffect(() => {
   if (!isAuthenticated || !currentUser.unitId) return;
   let active = true;
   const checkPosting = async () => {
     try {
       const response = await fetch('/api/auth/session', { cache: 'no-store' });
       if (!active) return;
       if (response.status === 401) { setAuthenticated(false); return; }
       if (!response.ok) return;
       const { user } = await response.json() as { user: UserSession };
       if (active && (user.id !== currentUser.id || user.unitId !== currentUser.unitId ||
           user.role !== currentUser.role || user.stationName !== currentUser.stationName ||
           user.district !== currentUser.district ||
           JSON.stringify(user.jurisdictionUnits) !== JSON.stringify(currentUser.jurisdictionUnits))) {
         window.location.reload();
       }
     } catch { /* Protected requests still check the current posting. */ }
   };
   window.addEventListener('focus', checkPosting);
   const timer = window.setInterval(checkPosting, 30000);
   return () => {
     active = false;
     window.clearInterval(timer);
     window.removeEventListener('focus', checkPosting);
   };
 }, [isAuthenticated, currentUser]);
 const login=async(pno:string,pin:string,station?:string,rememberDevice?:boolean)=>{try{const r=await fetch('/api/auth/session',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({pno,pin,station,rememberDevice})});const b=await r.json();if(!r.ok){if(typeof window!=='undefined')(window as unknown as {__lastLoginError?:string}).__lastLoginError=b.error||'';return false;}await accept(b.user,b.sessionUser,Boolean(b.viewAsActive));return true;}catch(e:unknown){if(typeof window!=='undefined')(window as unknown as {__lastLoginError?:string}).__lastLoginError=e instanceof Error?e.message:'Network error';return false;}};
 // View-as never signs the Developer Admin out and never performs a second login:
 // the server re-issues the developer's own session with a view-as marker, so the
 // developer keeps their identity until they explicitly sign out.
 const enterViewAs=async(user:Pick<UserSession,'id'>)=>{
   if(sessionUser.id!=='cms_developer_admin')return false;
   try{
     await firPersistence.flush().catch(()=>{});
     const r=await fetch('/api/auth/session',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({viewAs:user.id})});
     const b=await r.json();
     if(!r.ok){if(typeof window!=='undefined')(window as unknown as {__lastViewAsError?:string}).__lastViewAsError=b.error||'Officer ID could not be opened.';return false;}
     await accept(b.user,b.sessionUser,Boolean(b.viewAsActive));return true;
   }catch(e:unknown){if(typeof window!=='undefined')(window as unknown as {__lastViewAsError?:string}).__lastViewAsError=e instanceof Error?e.message:'Network error';return false;}
 };
 const exitViewAs=async()=>{
   try{
     await firPersistence.flush().catch(()=>{});
     const r=await fetch('/api/auth/session',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({viewAs:null})});
     const b=await r.json();
     if(!r.ok)return false;
     await accept(b.user,b.sessionUser,false);return true;
   }catch{return false;}
 };
 const logout=async()=>{await firPersistence.flush().catch(()=>{});await fetch('/api/auth/session',{method:'DELETE'});setAuthenticated(false);localStorage.removeItem('haryana_police_cms_user');router.replace('/login');};
 if(!ready)return <div className="p-6 text-sm text-slate-600">Loading session…</div>;
 return <AuthContext.Provider value={{currentUser,sessionUser,isViewAs,switching,enterViewAs,exitViewAs,isAuthenticated,login,logout}}>{children}</AuthContext.Provider>;
}
export function useAuth(){const context=useContext(AuthContext);if(!context)throw new Error('useAuth must be used within an AuthProvider');return context;}
