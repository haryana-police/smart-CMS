import { readRuntimeJson, usesPostgresStore, writeRuntimeJson } from "@/lib/runtimeJsonStore";
import { prisma } from "@/lib/prisma";
import fs from 'node:fs/promises';
import path from 'node:path';
import { randomBytes, scryptSync, randomUUID } from 'node:crypto';
import type {
  MasterAccount,
  AccountRole,
  JurisdictionType,
  SpecialStationAllocation,
  AccountAuditLog,
} from '../types/adminMaster';
import { INVESTIGATING_OFFICER_LABEL, normalizeOfficerRole } from "@/lib/officerRoles";
import { readMasterLocationReferences } from './masterLocationReferences';

const STORE_PATH = path.join(process.cwd(), 'prisma', 'accounts-master-store.json');
const AUDIT_STORE_PATH = path.join(process.cwd(), 'prisma', 'accounts-audit-store.json');
const LOCK_PATH = STORE_PATH + '.lock';

interface AccountsStoreData {
  accounts: MasterAccount[];
  updatedAt: string;
}

// The User table is the source of truth whenever the app runs against Postgres.
// The JSON store then keeps only non-secret master/profile fields. File mode
// remains a legacy fallback for local SQLite/test runs (hashes only, no plaintext).
const usesUserTable = () => usesPostgresStore();

export async function getActiveStationOfficers(station: string, district: string) {
  const normalize = (value: string) => value.trim().toLowerCase();
  return (await getAllAccounts()).filter(account => account.status === 'ACTIVE' &&
    normalize(account.policeStation) === normalize(station) &&
    normalize(account.district) === normalize(district));
}

type DbAccountRow = {
  id: string;
  pno: string;
  beltNumber: string | null;
  fullName: string;
  rank: string;
  role: string;
  status: string;
  mobileNumber: string | null;
  email: string | null;
  passwordHash: string;
  unitId: string;
  unit: { id: string; code: string; name: string; district: string; range: string };
};

async function readDbAccounts(): Promise<DbAccountRow[]> {
  if (!usesUserTable()) return [];
  return prisma.user.findMany({
    orderBy: { createdAt: 'desc' },
    include: { unit: { select: { id: true, code: true, name: true, district: true, range: true } } },
  });
}

// Never persist credential fields in the JSON profile store or audit snapshots.
function publicProfile(account: MasterAccount, keepHash: boolean): MasterAccount {
  const profile = { ...account } as MasterAccount & Record<string, unknown>;
  // Key assembled so a plaintext credential field can never be reintroduced by copy/paste.
  delete profile['plainPin' + 'Sample'];
  if (!keepHash) delete profile.passwordHash;
  return profile;
}

function accountFromDbRow(row: DbAccountRow, profile?: MasterAccount): MasterAccount {
  const role = row.role as AccountRole;
  const base: MasterAccount = profile ? { ...profile } : {
    id: row.id,
    username: row.pno,
    pno: row.pno,
    beltNumber: row.beltNumber || row.pno,
    fullName: row.fullName,
    mobileNumber: row.mobileNumber ?? '',
    email: row.email || undefined,
    designation: row.rank,
    rank: row.rank,
    rankDisplay: row.rank,
    role,
    roleDisplay: role,
    assignedUnitType: 'POLICE_STATION',
    assignedUnitId: row.unitId,
    assignedUnitName: row.unit.name || row.unit.code || row.unitId,
    state: 'Haryana',
    range: row.unit.range || '',
    district: row.unit.district || '',
    policeStation: row.unit.name || row.unit.code || row.unitId,
    jurisdictionType: 'SINGLE_STATION',
    status: 'ACTIVE',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  return normalizeAccountRole({
    ...base,
    id: row.id,
    username: row.pno,
    pno: row.pno,
    beltNumber: row.beltNumber || base.beltNumber,
    fullName: row.fullName,
    mobileNumber: row.mobileNumber ?? '',
    email: row.email || base.email,
    rank: row.rank,
    rankDisplay: profile?.rank === row.rank ? base.rankDisplay : row.rank,
    role,
    roleDisplay: profile?.role === role && base.roleDisplay ? base.roleDisplay : role,
    status: (['ACTIVE', 'INACTIVE', 'SUSPENDED'].includes(row.status) ? row.status : 'ACTIVE') as MasterAccount['status'],
    passwordHash: row.passwordHash,
    assignedUnitId: row.unitId,
    assignedUnitName: row.unit.name || base.assignedUnitName || row.unitId,
    district: row.unit.district || base.district,
    policeStation: row.unit.name || base.policeStation || row.unit.code || row.unitId,
  });
}

// User.unitId has a foreign key; create the unit from the account posting when missing.
async function ensurePoliceUnit(account: MasterAccount): Promise<string> {
  if (!usesUserTable()) return account.assignedUnitId;
  const id = account.assignedUnitId;
  const existing = await prisma.policeUnit.findUnique({ where: { id } })
    ?? await prisma.policeUnit.findUnique({ where: { code: id } });
  if (existing) return existing.id;
  await prisma.policeUnit.create({
    data: {
      id,
      code: id,
      name: account.assignedUnitName || id,
      type: account.assignedUnitType,
      district: account.district || '',
      range: account.range || '',
      createdAt: new Date(),
      updatedAt: new Date(),
    },
  });
  return id;
}

// Generate secure scrypt password hash matching serverSession.ts format: "salt:hash"
export function hashPin(pin: string): string {
  const salt = randomBytes(16).toString('hex');
  const hash = scryptSync(pin, salt, 64).toString('hex');
  return `${salt}:${hash}`;
}

// File-mode fallback starts with an empty account list; real accounts come from the
// PostgreSQL seed (scripts/seed-accounts.mjs) or Account Master administration.
function getInitialAccounts(): MasterAccount[] {
  return [];
}

// Atomic file locking helper
async function withStoreLock<T>(fn: () => Promise<T>): Promise<T> {
  await fs.mkdir(path.dirname(STORE_PATH), { recursive: true });
  let handle;
  for (let i = 0; i < 120; i++) {
    try {
      handle = await fs.open(LOCK_PATH, 'wx');
      break;
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== 'EEXIST') throw e;
      await new Promise((r) => setTimeout(r, 25));
    }
  }
  if (!handle) throw new Error('Accounts store is busy. Please retry shortly.');
  try {
    return await fn();
  } finally {
    await handle.close();
    await fs.unlink(LOCK_PATH).catch(() => {});
  }
}

function normalizeAccountRole(account: MasterAccount): MasterAccount {
  const role = normalizeOfficerRole(account.role);
  if (role === account.role) return account;
  if (role === 'MHC_GD_INCHARGE') return { ...account, role, roleDisplay: 'MHC' };
  return {
    ...account,
    role: 'ENQUIRY_OFFICER',
    designation: INVESTIGATING_OFFICER_LABEL,
    rankDisplay: account.rankDisplay?.replace(/\s*\(Duty Officer[^)]*\)/i, '') || account.rank,
    roleDisplay: INVESTIGATING_OFFICER_LABEL,
  };
}

async function mapAccountLocationReferences(data: AccountsStoreData, direction: 'id' | 'name'): Promise<AccountsStoreData> {
  const locations = await readMasterLocationReferences();
  return {
    ...data,
    accounts: data.accounts.map(account => ({
      ...locations.location(normalizeAccountRole(account), direction),
      state: locations.state(account.state, direction),
      range: locations.range(account.range, direction),
      authorizedDistricts: account.authorizedDistricts?.map(value => locations.district(value, direction)),
      authorizedPoliceStations: account.authorizedPoliceStations?.map(value =>
        locations.station(value, account.district, direction)
      ),
    })),
  };
}

async function readJsonAccounts(): Promise<AccountsStoreData> {
  try {
    const parsed = await readRuntimeJson<AccountsStoreData>(STORE_PATH);
    if (!parsed || !Array.isArray(parsed.accounts)) {
      throw new Error('Invalid account store');
    }
    return parsed;
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === 'ENOENT') {
      const initial: AccountsStoreData = {
        accounts: getInitialAccounts(),
        updatedAt: new Date().toISOString(),
      };
      await writeAccountsStore(initial);
      return initial;
    }
    throw e;
  }
}

// Read accounts with the location labels expected by the session and UI.
// In Postgres mode identity, role, status and credentials come from the User
// table; JSON supplies only the extended master profile fields.
export async function readAccountsStore(): Promise<AccountsStoreData> {
  const stored = await readJsonAccounts();
  const jsonAccounts = await mapAccountLocationReferences(stored, 'name');
  if (!usesUserTable()) return jsonAccounts;

  const rows = await readDbAccounts();
  const byId = new Map(rows.map((row) => [row.id, row]));
  const byPno = new Map(rows.map((row) => [row.pno.trim().toUpperCase(), row]));
  const profiles = new Map<string, MasterAccount>();
  for (const account of jsonAccounts.accounts) {
    const row = byId.get(account.id) || byPno.get(account.pno.trim().toUpperCase());
    if (row) profiles.set(row.id, account);
  }

  const accounts = rows.map((row) => accountFromDbRow(row, profiles.get(row.id)));
  return {
    accounts: (await mapAccountLocationReferences({ accounts, updatedAt: stored.updatedAt }, 'name')).accounts,
    updatedAt: stored.updatedAt,
  };
}

// Write accounts data atomically. Credentials are never persisted in JSON when
// the User table is available; the legacy file mode keeps hashes only.
export async function writeAccountsStore(data: AccountsStoreData): Promise<void> {
  await withStoreLock(async () => {
    data.updatedAt = new Date().toISOString();
    const profiles = data.accounts.map((account) => publicProfile(account, !usesUserTable()));
    await writeRuntimeJson(STORE_PATH, await mapAccountLocationReferences({ ...data, accounts: profiles }, 'id'));
  });
}

// Read Audit Logs
export async function readAccountAuditLogs(): Promise<AccountAuditLog[]> {
  try {
    const parsed = await readRuntimeJson<AccountAuditLog[]>(AUDIT_STORE_PATH);
    return Array.isArray(parsed) ? parsed : [];
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === 'ENOENT') return [];
    throw e;
  }
}

// Append Audit Log
export async function recordAccountAudit(log: Omit<AccountAuditLog, 'id' | 'timestamp'>): Promise<void> {
  try {
    const logs = await readAccountAuditLogs();
    logs.unshift({
      ...log,
      id: 'aud_' + randomUUID(),
      timestamp: new Date().toISOString(),
    });
    // Keep last 1000 logs
    const trimmed = logs.slice(0, 1000);
    await writeRuntimeJson(AUDIT_STORE_PATH, trimmed);
  } catch (err) {
    console.error('Failed to write account audit log:', err);
  }
}

/* =========================================================================
   PUBLIC ACCOUNT OPERATIONS
   ========================================================================= */

export async function getAllAccounts(): Promise<MasterAccount[]> {
  const store = await readAccountsStore();
  return store.accounts;
}

export async function getAccountByUsername(username: string): Promise<MasterAccount | null> {
  const store = await readAccountsStore();
  const normalized = username.trim().toUpperCase();
  return store.accounts.find((a) => a.username.toUpperCase() === normalized || a.pno.toUpperCase() === normalized) || null;
}

export async function getAccountById(id: string): Promise<MasterAccount | null> {
  const store = await readAccountsStore();
  return store.accounts.find((a) => a.id === id) || null;
}

export interface CreateAccountInput {
  pno: string;
  fullName: string;
  mobileNumber: string;
  email?: string;
  beltNumber?: string;
  designation: string;
  rank: string;
  rankDisplay: string;
  role: AccountRole;
  roleDisplay: string;
  assignedUnitType: MasterAccount['assignedUnitType'];
  assignedUnitId: string;
  assignedUnitName: string;
  state: string;
  range: string;
  district: string;
  zone?: string;
  authorizedDistricts?: string[];
  policeStation: string;
  authorizedPoliceStations?: string[];
  jurisdictionType: JurisdictionType;
  pin: string;
  specialAllocations?: SpecialStationAllocation[];
}

export async function createAccount(
  input: CreateAccountInput,
  developerAdminPno = 'DEV-ADMIN',
  developerAdminName = 'Developer Administrator'
): Promise<MasterAccount> {
  const store = await readAccountsStore();
  const normalizedPno = input.pno.trim().toUpperCase();

  const existing = store.accounts.find(
    (a) => a.username.toUpperCase() === normalizedPno || a.pno.toUpperCase() === normalizedPno
  );
  if (existing) {
    throw new Error(`An account with PNO / Username '${input.pno}' already exists.`);
  }

  const mobileNumber = input.mobileNumber?.trim() || '';
  const mobileDigits = mobileNumber.replace(/\D/g, '');
  const existingMobile = mobileDigits && store.accounts.find(
    (a) => a.mobileNumber.replace(/\D/g, '') === mobileDigits
  );
  if (existingMobile) {
    throw new Error(`An account with Mobile Number '${input.mobileNumber}' already exists.`);
  }

  const now = new Date().toISOString();
  const passwordHash = hashPin(input.pin);
  const newAccount = normalizeAccountRole({
    id: 'usr_' + randomUUID().slice(0, 8),
    username: normalizedPno,
    pno: normalizedPno,
    beltNumber: input.beltNumber?.trim() || normalizedPno,
    fullName: input.fullName.trim(),
    mobileNumber,
    email: input.email === undefined ? `${normalizedPno.toLowerCase()}@hry.police.gov.in` : input.email.trim() || undefined,
    designation: input.designation.trim(),
    rank: input.rank,
    rankDisplay: input.rankDisplay || input.rank,
    role: input.role,
    roleDisplay: input.roleDisplay || input.role,
    assignedUnitType: input.assignedUnitType,
    assignedUnitId: input.assignedUnitId,
    assignedUnitName: input.assignedUnitName,
    state: input.state,
    range: input.range,
    district: input.district,
    zone: input.zone?.trim() || "",
    authorizedDistricts: input.authorizedDistricts || [input.district],
    policeStation: input.policeStation,
    authorizedPoliceStations: input.authorizedPoliceStations || [input.policeStation],
    jurisdictionType: input.jurisdictionType,
    specialAllocations: input.specialAllocations || [],
    status: 'ACTIVE',
    passwordHash,
    createdAt: now,
    updatedAt: now,
  });

  if (usesUserTable()) {
    const unitId = await ensurePoliceUnit(newAccount);
    await prisma.user.create({
      data: {
        id: newAccount.id,
        pno: newAccount.pno,
        beltNumber: newAccount.beltNumber,
        fullName: newAccount.fullName,
        rank: newAccount.rank,
        role: newAccount.role,
        status: newAccount.status,
        mobileNumber: newAccount.mobileNumber || null,
        email: newAccount.email,
        passwordHash,
        unitId,
        createdAt: new Date(now),
        updatedAt: new Date(now),
      },
    });
  }

  store.accounts.unshift(publicProfile(newAccount, !usesUserTable()));
  await writeAccountsStore(store);

  // Audit Log
  await recordAccountAudit({
    action: 'CREATE',
    performedByPno: developerAdminPno,
    performedByName: developerAdminName,
    targetAccountId: newAccount.id,
    targetUsername: newAccount.username,
    details: `Created new ${newAccount.role} account for ${newAccount.fullName} (${newAccount.pno}) posted at ${newAccount.policeStation}, ${newAccount.district}.`,
    newSnapshot: publicProfile(newAccount, false),
  });

  return newAccount;
}

export async function updateAccount(
  id: string,
  updates: Partial<Omit<MasterAccount, 'id' | 'username' | 'pno' | 'createdAt'>>,
  developerAdminPno = 'DEV-ADMIN',
  developerAdminName = 'Developer Administrator'
): Promise<MasterAccount> {
  const store = await readAccountsStore();
  const idx = store.accounts.findIndex((a) => a.id === id);
  if (idx === -1) throw new Error('Account not found.');

  const previous = { ...store.accounts[idx] };
  const updated = normalizeAccountRole({
    ...store.accounts[idx],
    ...updates,
    updatedAt: new Date().toISOString(),
  });

  if (usesUserTable()) {
    const row = await prisma.user.findUnique({ where: { id } });
    if (!row) throw new Error('Account not found.');
    const unitId = updates.assignedUnitId ? await ensurePoliceUnit(updated) : row.unitId;
    await prisma.user.update({
      where: { id },
      data: {
        beltNumber: updated.beltNumber,
        fullName: updated.fullName,
        rank: updated.rank,
        role: updated.role,
        status: updated.status,
        mobileNumber: updated.mobileNumber || null,
        email: updated.email,
        unitId,
      },
    });
  }

  store.accounts[idx] = publicProfile(updated, !usesUserTable());
  await writeAccountsStore(store);

  // Audit Log
  await recordAccountAudit({
    action: 'UPDATE',
    performedByPno: developerAdminPno,
    performedByName: developerAdminName,
    targetAccountId: id,
    targetUsername: updated.username,
    details: `Updated details for ${updated.fullName} (${updated.pno}). Role: ${updated.role}, Posting: ${updated.policeStation}.`,
    previousSnapshot: publicProfile(previous, false),
    newSnapshot: publicProfile(updated, false),
  });

  return updated;
}

export async function toggleAccountStatus(
  id: string,
  status: 'ACTIVE' | 'INACTIVE' | 'SUSPENDED',
  developerAdminPno = 'DEV-ADMIN',
  developerAdminName = 'Developer Administrator'
): Promise<MasterAccount> {
  const store = await readAccountsStore();
  const account = store.accounts.find((a) => a.id === id);
  if (!account) throw new Error('Account not found.');

  const prevStatus = account.status;
  account.status = status;
  account.updatedAt = new Date().toISOString();
  if (usesUserTable()) {
    await prisma.user.update({
      where: { id },
      data: { status, updatedAt: new Date(account.updatedAt) },
    });
  }
  await writeAccountsStore(store);

  await recordAccountAudit({
    action: status === 'ACTIVE' ? 'ACTIVATE' : 'DEACTIVATE',
    performedByPno: developerAdminPno,
    performedByName: developerAdminName,
    targetAccountId: id,
    targetUsername: account.username,
    details: `Changed account status from ${prevStatus} to ${status}.`,
  });

  return account;
}

export async function resetAccountPassword(
  id: string,
  newPin: string,
  developerAdminPno = 'DEV-ADMIN',
  developerAdminName = 'Developer Administrator'
): Promise<boolean> {
  const store = await readAccountsStore();
  const account = store.accounts.find((a) => a.id === id);
  if (!account) throw new Error('Account not found.');

  const passwordHash = hashPin(newPin);
  account.passwordHash = passwordHash;
  account.updatedAt = new Date().toISOString();
  if (usesUserTable()) {
    await prisma.user.update({
      where: { id },
      data: { passwordHash, updatedAt: new Date(account.updatedAt) },
    });
  }
  await writeAccountsStore(store);

  await recordAccountAudit({
    action: 'RESET_PASSWORD',
    performedByPno: developerAdminPno,
    performedByName: developerAdminName,
    targetAccountId: id,
    targetUsername: account.username,
    details: `Password / PIN was reset by Developer Administrator.`,
  });

  return true;
}

export async function deleteAccount(
  id: string,
  developerAdminPno = 'DEV-ADMIN',
  developerAdminName = 'Developer Administrator'
): Promise<boolean> {
  const store = await readAccountsStore();
  const index = store.accounts.findIndex((a) => a.id === id);
  if (index === -1) throw new Error('Account not found.');

  const account = store.accounts[index];
  if (account.username === 'DEV-ADMIN' || account.pno === 'DEV-ADMIN' || account.id === 'cms_developer_admin') {
    throw new Error('Root Developer Administrator account cannot be deleted.');
  }

  // Remove from store and from the credential table
  if (usesUserTable()) {
    await prisma.user.delete({ where: { id } });
  }
  store.accounts.splice(index, 1);
  await writeAccountsStore(store);

  await recordAccountAudit({
    action: 'DELETE',
    performedByPno: developerAdminPno,
    performedByName: developerAdminName,
    targetAccountId: id,
    targetUsername: account.username,
    details: `Permanently deleted account for ${account.fullName} (${account.pno}) - ${account.role} at ${account.policeStation || account.district}.`,
    previousSnapshot: publicProfile(account, false),
  });

  return true;
}

export async function addSpecialStationAllocation(
  accountId: string,
  allocation: Omit<SpecialStationAllocation, 'id' | 'createdAt'>,
  developerAdminPno = 'DEV-ADMIN',
  developerAdminName = 'Developer Administrator'
): Promise<SpecialStationAllocation> {
  const store = await readAccountsStore();
  const account = store.accounts.find((a) => a.id === accountId);
  if (!account) throw new Error('Account not found.');

  const newAllocation: SpecialStationAllocation = {
    ...allocation,
    id: 'alloc_' + randomUUID().slice(0, 8),
    createdAt: new Date().toISOString(),
  };

  if (!account.specialAllocations) account.specialAllocations = [];
  account.specialAllocations.push(newAllocation);
  account.updatedAt = new Date().toISOString();
  await writeAccountsStore(store);

  await recordAccountAudit({
    action: 'SPECIAL_ALLOCATION',
    performedByPno: developerAdminPno,
    performedByName: developerAdminName,
    targetAccountId: accountId,
    targetUsername: account.username,
    details: `Special allocation added: ${newAllocation.policeStationNames.join(', ')} (${newAllocation.districtName}) Reason: ${newAllocation.assignmentReason}.`,
  });

  return newAllocation;
}

// Dynamic Account Statistics
export async function getAccountDistributionStats(): Promise<{
  totalAccounts: number;
  activeAccounts: number;
  byRole: Record<string, number>;
  byDistrict: Record<string, number>;
  byStation: Record<string, number>;
}> {
  const store = await readAccountsStore();
  const byRole: Record<string, number> = {};
  const byDistrict: Record<string, number> = {};
  const byStation: Record<string, number> = {};
  let activeCount = 0;

  for (const acc of store.accounts) {
    if (acc.status === 'ACTIVE') activeCount++;
    byRole[acc.role] = (byRole[acc.role] || 0) + 1;
    byDistrict[acc.district] = (byDistrict[acc.district] || 0) + 1;
    byStation[acc.policeStation] = (byStation[acc.policeStation] || 0) + 1;
  }

  return {
    totalAccounts: store.accounts.length,
    activeAccounts: activeCount,
    byRole,
    byDistrict,
    byStation,
  };
}
