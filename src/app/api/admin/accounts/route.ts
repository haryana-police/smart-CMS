import { apiAccess, forbidden } from '@/lib/apiSecurity';
import { demoEnabled, sessionPrincipal } from '@/lib/serverSession';
import {
  getAllAccounts,
  createAccount,
  updateAccount,
  toggleAccountStatus,
  resetAccountPassword,
  deleteAccount,
  addSpecialStationAllocation,
  getAccountDistributionStats,
  readAccountAuditLogs,
} from '@/services/accountMasterService';

export const runtime = 'nodejs';

function isDeveloperAdmin(user: any): boolean {
  return user.id === 'cms_developer_admin' || user.role === 'SUPER_ADMIN';
}

export async function GET(req: Request) {
  const view = new URL(req.url).searchParams.get('view');
  if (view === 'officer-switcher') {
    if (!demoEnabled()) return forbidden();
    const accounts = await getAllAccounts();
    const officers = accounts.filter(account => account.status === 'ACTIVE').map(account => ({
      id: account.id,
      name: account.fullName,
      role: account.role,
      roleDisplay: account.roleDisplay,
      rank: account.rank,
      district: account.district,
      stationName: account.policeStation,
    }));
    return Response.json({ officers }, { headers: { 'Cache-Control': 'no-store' } });
  }
  const actor = await apiAccess(req);
  if (actor instanceof Response) return actor;
  if (!isDeveloperAdmin(actor)) return forbidden('Developer Administrator access required for Account Master.');

  try {
    if (view === 'audits') {
      const logs = await readAccountAuditLogs();
      return Response.json({ auditLogs: logs });
    }

    const [accounts, stats, auditLogs] = await Promise.all([
      getAllAccounts(),
      getAccountDistributionStats(),
      readAccountAuditLogs(),
    ]);

    return Response.json({
      accounts,
      stats,
      auditLogs: auditLogs.slice(0, 50),
    });
  } catch (err: any) {
    return Response.json({ error: err.message || 'Failed to fetch account master data.' }, { status: 500 });
  }
}

export async function POST(req: Request) {
  const actor = await apiAccess(req);
  if (actor instanceof Response) return actor;
  if (!isDeveloperAdmin(actor)) return forbidden('Developer Administrator access required.');

  try {
    const body = await req.json();
    const newAccount = await createAccount(body, actor.pno, actor.name);
    return Response.json({ success: true, account: newAccount }, { status: 201 });
  } catch (err: any) {
    return Response.json({ error: err.message || 'Failed to generate account.' }, { status: 400 });
  }
}

export async function PUT(req: Request) {
  const actor = await apiAccess(req);
  if (actor instanceof Response) return actor;
  if (!isDeveloperAdmin(actor)) return forbidden('Developer Administrator access required.');

  try {
    const body = await req.json();
    const { action, accountId, updates, status, pin, allocation } = body;

    if (!accountId) {
      return Response.json({ error: 'accountId is required.' }, { status: 400 });
    }

    if (action === 'toggle-status') {
      if (!status) return Response.json({ error: 'status is required.' }, { status: 400 });
      const updated = await toggleAccountStatus(accountId, status, actor.pno, actor.name);
      return Response.json({ success: true, account: updated });
    }

    if (action === 'reset-pin') {
      if (!pin || pin.length < 4) {
        return Response.json({ error: 'PIN must be at least 4 digits.' }, { status: 400 });
      }
      const ok = await resetAccountPassword(accountId, pin, actor.pno, actor.name);
      return Response.json({ success: ok, message: 'Password/PIN reset successfully.' });
    }

    if (action === 'special-allocation') {
      if (!allocation || !allocation.districtId || !allocation.policeStationIds?.length) {
        return Response.json({ error: 'Invalid special allocation details.' }, { status: 400 });
      }
      const newAlloc = await addSpecialStationAllocation(
        accountId,
        {
          ...allocation,
          grantedByPno: actor.pno,
          status: 'ACTIVE',
        },
        actor.pno,
        actor.name
      );
      return Response.json({ success: true, allocation: newAlloc });
    }

    if (action === 'delete') {
      const ok = await deleteAccount(accountId, actor.pno, actor.name);
      return Response.json({ success: ok, message: 'Account deleted successfully.' });
    }

    if (action === 'update') {
      const updated = await updateAccount(accountId, updates || {}, actor.pno, actor.name);
      return Response.json({ success: true, account: updated });
    }

    return Response.json({ error: `Unknown action '${action}'.` }, { status: 400 });
  } catch (err: any) {
    return Response.json({ error: err.message || 'Failed to update account.' }, { status: 400 });
  }
}

export async function DELETE(req: Request) {
  const actor = await apiAccess(req);
  if (actor instanceof Response) return actor;
  if (!isDeveloperAdmin(actor)) return forbidden('Developer Administrator access required.');

  try {
    const url = new URL(req.url);
    let accountId = url.searchParams.get('id') || url.searchParams.get('accountId');
    if (!accountId) {
      try {
        const body = await req.json();
        accountId = body.accountId || body.id;
      } catch (_) {}
    }

    if (!accountId) {
      return Response.json({ error: 'accountId is required.' }, { status: 400 });
    }

    const ok = await deleteAccount(accountId, actor.pno, actor.name);
    return Response.json({ success: ok, message: 'Account deleted successfully.' });
  } catch (err: any) {
    return Response.json({ error: err.message || 'Failed to delete account.' }, { status: 400 });
  }
}
