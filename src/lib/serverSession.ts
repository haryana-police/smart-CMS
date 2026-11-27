import { createHmac, randomBytes, timingSafeEqual, scryptSync } from 'node:crypto';
import { INVESTIGATING_OFFICER_LABEL, normalizeOfficerRole } from '@/lib/officerRoles';
import type { UserSession } from '@/types';
import type { MasterAccount } from '@/types/adminMaster';

const globals = globalThis as typeof globalThis & { cmsSessionSecret?: string };
// Demo login is ON by default so a freshly deployed test VM works with no runtime setup.
// It now covers only the one-click officer roster (database/seeded accounts) and the
// one-click developer admin. An operational deployment must set DISABLE_DEMO_LOGIN=true;
// then the one-click cards are disabled and real credentials are required.
export const demoEnabled = () => process.env.DISABLE_DEMO_LOGIN !== 'true';

function secret() {
  const configured = process.env.CMS_SESSION_SECRET;
  if (configured && configured.length >= 32) return configured;
  if (process.env.NODE_ENV === 'production' && !demoEnabled()) throw new Error('CMS_SESSION_SECRET must contain at least 32 characters.');
  return globals.cmsSessionSecret ??= randomBytes(32).toString('hex');
}

const DEVELOPER_ADMIN_IDENTITY: Pick<UserSession, 'rank' | 'avatarUrl'> = {
  rank: 'SUPERINTENDENT_OF_POLICE',
  avatarUrl: '/avatars/sho.png',
};

export function developerAdminUser(): UserSession {
  return { ...DEVELOPER_ADMIN_IDENTITY, id: 'cms_developer_admin', pno: 'DEV-ADMIN', name: 'Developer Admin',
    role: 'SUPER_ADMIN', roleDisplay: 'Developer Administrator', rankDisplay: 'Developer Administrator',
    stationName: 'CMS Administration', stationCode: 'CMS-ADMIN', district: 'All Districts' };
}

export const SESSION_DURATION_MS = 8 * 60 * 60 * 1000;
export const REMEMBERED_ADMIN_DURATION_MS = 7 * 24 * 60 * 60 * 1000;

export function issueSession(userId: string, _legacyStation?: string, demo = false, viewAs?: string | null, expires = Date.now() + SESSION_DURATION_MS) {
  const payload: { userId: string; demo: boolean; version: number; expires: number; viewAs?: string } = { userId, demo, version: 3, expires };
  if (viewAs) payload.viewAs = viewAs;
  const value = Buffer.from(JSON.stringify(payload)).toString('base64url');
  return value + '.' + createHmac('sha256', secret()).update(value).digest('hex');
}

async function officerSession(user: { id: string; pno: string; beltNumber?: string | null; fullName: string; rank: string; role: string; status: string; unit: {id: string; name: string; code: string; district: string} }): Promise<UserSession | null> {
  if (user.status !== 'ACTIVE') return null;
  const { prisma } = await import('@/lib/prisma');
  const units = user.role === 'DSP_SUBDIV' ? await prisma.policeUnit.findMany({
    where: { district: user.unit.district }, select: { id: true, parentId: true, name: true },
  }) : [];
  const scope = new Set([user.unit.id]);
  for (let pass = 0; pass < units.length; pass++) {
    for (const unit of units) if (unit.parentId && scope.has(unit.parentId)) scope.add(unit.id);
  }
  const role = normalizeOfficerRole(user.role);
  return {
    id: user.id, pno: user.pno, beltNumber: user.beltNumber || undefined, name: user.fullName,
    rank: user.rank as UserSession['rank'], rankDisplay: user.rank,
    role: role as UserSession['role'], roleDisplay: role === 'ENQUIRY_OFFICER' ? INVESTIGATING_OFFICER_LABEL : role,
    stationName: user.unit.name, stationCode: user.unit.code, district: user.unit.district,
    unitId: user.unit.id, jurisdictionUnits: units.filter(unit => scope.has(unit.id)).map(unit => unit.name),
  };
}

type SessionPrincipal = { userId: string; demo: boolean; expires: number; viewAs?: string };

function readSessionToken(req: Request): SessionPrincipal | null {
  const cookie = req.headers.get('cookie')?.split(';').map(value => value.trim()).find(value => value.startsWith('cms_session='))?.slice(12);
  if (!cookie) return null;
  const [value, signature, extra] = cookie.split('.');
  if (extra || !value || !/^[a-f0-9]{64}$/.test(signature ?? '')) return null;
  const expected = createHmac('sha256', secret()).update(value).digest();
  if (!timingSafeEqual(expected, Buffer.from(signature, 'hex'))) return null;
  const data = JSON.parse(Buffer.from(value, 'base64url').toString());
  if (data.version !== 3 || !Number.isFinite(data.expires) || data.expires <= Date.now() || typeof data.userId !== 'string') return null;
  return { userId: data.userId, demo: Boolean(data.demo), expires: data.expires, viewAs: typeof data.viewAs === 'string' && data.viewAs ? data.viewAs : undefined };
}

// The raw signed-in principal: still the Developer Admin even while the session
// is viewing another officer's ID. Used by the session route to authorize
// entering, changing or leaving view-as without a second login.
export async function sessionPrincipal(req: Request): Promise<SessionPrincipal | null> {
  try {
    return readSessionToken(req);
  } catch {
    return null;
  }
}

// Officer IDs the Developer Admin may enter with their own session — every role is
// viewable, including the SP office; only the developer identity itself is excluded.
const accountMasterSessions = new WeakSet<UserSession>();

export function usesDemoSession(user: UserSession): boolean {
  return user.id !== 'cms_developer_admin' && (accountMasterSessions.has(user) || !user.unitId);
}

function masterAccountToSession(acc: MasterAccount): UserSession {
  const user: UserSession = {
    id: acc.id,
    pno: acc.pno,
    name: acc.fullName,
    beltNumber: acc.beltNumber,
    rank: acc.rank as UserSession['rank'],
    rankDisplay: acc.rankDisplay || acc.designation,
    role: (acc.role === 'DGP' || acc.role === 'ADGP' || acc.role === 'IG' || acc.role === 'DIG') ? 'SUPER_ADMIN' : acc.role as UserSession['role'],
    roleDisplay: acc.roleDisplay,
    stationName: acc.policeStation,
    stationCode: acc.assignedUnitId || 'HAR-GEN',
    district: acc.district,
    unitId: acc.assignedUnitId,
    jurisdictionUnits: acc.authorizedPoliceStations,
  };
  accountMasterSessions.add(user);
  return user;
}

export async function viewableOfficer(id: string): Promise<UserSession | null> {
  if (!id || id === 'cms_developer_admin') return null;
  // The User table is the source of truth. Legacy JSON accounts remain a fallback only.
  // A demo deployment must still work when the database is unseeded or unreachable.
  const { prisma } = await import('@/lib/prisma');
  let user = null;
  try {
    user = await prisma.user.findUnique({ where: { id }, include: { unit: true } });
  } catch {}
  if (user) return await officerSession(user);
  if (demoEnabled()) {
    try {
      const { getAccountById } = await import('@/services/accountMasterService');
      const acc = await getAccountById(id);
      if (acc && acc.status === 'ACTIVE') return masterAccountToSession(acc);
    } catch {}
  }
  return null;
}

async function baseSessionUser(userId: string, demo: boolean): Promise<UserSession | null> {
  if (userId === 'cms_developer_admin') return (demoEnabled() || process.env.CMS_DEVELOPER_ADMIN_PASSWORD) ? developerAdminUser() : null;
  const { prisma } = await import('@/lib/prisma');
  let user = null;
  try {
    user = await prisma.user.findUnique({ where: { id: userId }, include: { unit: true } });
  } catch {}
  if (user) return await officerSession(user);
  if (demo && demoEnabled()) {
    try {
      const { getAccountById } = await import('@/services/accountMasterService');
      const acc = await getAccountById(userId);
      if (acc && acc.status === 'ACTIVE') return masterAccountToSession(acc);
    } catch {}
  }
  return null;
}

export async function sessionUser(req: Request): Promise<UserSession | null> {
  try {
    const token = readSessionToken(req);
    if (!token) return null;
    const base = await baseSessionUser(token.userId, token.demo);
    if (!base) return null;
    // View-as: the developer keeps their own signed-in session while every screen and
    // record filter resolves to the viewed officer. An unknown, removed or temporarily
    // unresolvable target falls back to the developer's own view instead of ending the session.
    if (base.id === 'cms_developer_admin' && token.viewAs) {
      try {
        const viewed = await viewableOfficer(token.viewAs);
        if (viewed) return viewed;
      } catch {
        return base;
      }
    }
    return base;
  } catch {
    return null;
  }
}

export async function validLogin(pno: string, pin: string): Promise<UserSession | null> {
  if (pno.trim().toUpperCase() === 'DEV-ADMIN') {
    // The developer administrator signs in with the configured password; the one-click
    // login button uses the quickLoginId path instead of the demo PIN.
    const password = process.env.CMS_DEVELOPER_ADMIN_PASSWORD;
    if (!password) return null;
    const supplied = createHmac('sha256', secret()).update(pin).digest();
    const expected = createHmac('sha256', secret()).update(password).digest();
    return timingSafeEqual(supplied, expected) ? developerAdminUser() : null;
  }
  // User table is checked first so credentials come from the database, not the legacy JSON store.
  const { prisma } = await import('@/lib/prisma');
  let user = null;
  try {
    user = await prisma.user.findUnique({ where: { pno: pno.trim().toUpperCase() }, include: { unit: true } });
  } catch {}
  if (user) {
    const [salt, hash, extra] = user.passwordHash.split(':');
    if (extra || !salt || !/^[a-f0-9]{128}$/.test(hash ?? '')) return null;
    return timingSafeEqual(scryptSync(pin, salt, 64), Buffer.from(hash, 'hex')) ? officerSession(user) : null;
  }
  if (demoEnabled()) {
    try {
      const { getAccountByUsername } = await import('@/services/accountMasterService');
      const acc = await getAccountByUsername(pno);
      if (acc && acc.status === 'ACTIVE') {
        if (acc.passwordHash) {
          const [salt, hash, extra] = acc.passwordHash.split(':');
          if (!extra && salt && /^[a-f0-9]{128}$/.test(hash ?? '')) {
            const match = timingSafeEqual(scryptSync(pin, salt, 64), Buffer.from(hash, 'hex'));
            if (match) return masterAccountToSession(acc);
          }
        }
      }
    } catch {}
  }
  return null;
}

export function sameOrigin(req:Request){
 const origin=req.headers.get('origin');
 if(!origin)return true;
 try{
  const originHost=new URL(origin).host;
  const hosts=[req.headers.get('x-forwarded-host'),req.headers.get('host')]
   .filter((value):value is string=>Boolean(value))
   .flatMap(value=>value.split(','))
   .map(value=>value.trim())
   .filter(Boolean);
  if(hosts.includes(originHost))return true;
  if(origin===new URL(req.url).origin)return true;
  // Allow test VM IP or local network host connections
  const allowed=(process.env.CMS_ALLOWED_ORIGINS || '').split(',').map(value=>value.trim()).filter(Boolean);
  if(allowed.includes(origin)) return true;
 }catch{}
 return false;
}
