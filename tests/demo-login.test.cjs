const {test}=require('node:test');
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),ts=require('typescript'),crypto=require('node:crypto');
const modules=new Map();let dbQueries=0,dbUser=null,dbUnavailable=false,storeAccount=null;
const process_={...process,env:{...process.env,NODE_ENV:'test',CMS_SESSION_SECRET:'test-secret-'.repeat(4)}};
for(const key of ['ENABLE_DEMO_LOGIN','NEXT_PUBLIC_ENABLE_DEMO_LOGIN','CMS_DEVELOPER_ADMIN_PASSWORD','DISABLE_DEMO_LOGIN'])delete process_.env[key];
function load(file){
  if(modules.has(file))return modules.get(file);
  const exports={};modules.set(file,exports);
  const code=ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText;
  vm.runInNewContext(code,{exports,console,Date,Intl,Buffer,URL,Request,Response,structuredClone,globalThis:{},process:process_,setTimeout,queueMicrotask,require(n){
    if(n==='@/lib/prisma')return {prisma:{
      user:{findUnique:async({where})=>{
        dbQueries++;
        if(dbUnavailable)throw new Error('database unavailable');
        if(!dbUser)return null;
        return (where.id===dbUser.id || where.pno===dbUser.pno) ? dbUser : null;
      }},
      policeUnit:{findMany:async()=>[]},
    }};
    if(n==='@/services/accountMasterService')return {getAccountById:async(id)=>storeAccount && storeAccount.id===id ? storeAccount : null,getAccountByUsername:async(pno)=>storeAccount && storeAccount.pno===pno ? storeAccount : null};
    if(n.startsWith('@/')){const f='src/'+n.slice(2);return load(fs.existsSync(f+'.ts')?f+'.ts':f+'/index.ts');}
    if(n.startsWith('.'))return load(path.join(path.dirname(file),n+'.ts'));
    return require(n);
  }});
  return exports;
}
const {validLogin,sessionUser,sessionPrincipal,issueSession,demoEnabled,viewableOfficer}=load('src/lib/serverSession.ts');
const officer=(pno,pin)=>({
  id:'usr_real_1',pno,fullName:'Real Officer',rank:'SHO',role:'SHO',status:'ACTIVE',
  passwordHash:'test-salt:'+crypto.scryptSync(pin,'test-salt',64).toString('hex'),
  unit:{id:'unit-real',code:'REAL-01',name:'PS Test',district:'Panipat'},
});

test('database login verifies the assigned PIN and rejects wrong credentials',async()=>{
  process_.env.NODE_ENV='test';dbUnavailable=false;
  dbUser=officer('HR-04291882','real-pin');
  const user=await validLogin('HR-04291882','real-pin');
  assert.equal(user.id,'usr_real_1');assert.equal(user.stationName,'PS Test');
  assert.equal(await validLogin('HR-04291882','bad-pin'),null);
  assert.equal(await validLogin('HR-99999999','real-pin'),null);
  dbUser=null;
});

test('the legacy demo PIN 123456 no longer grants any account',async()=>{
  process_.env.NODE_ENV='test';dbUser=null;dbUnavailable=true;
  assert.equal(await validLogin('HR-04291882','123456'),null);
  dbUnavailable=false;
  assert.equal(await validLogin('HR-04291882','123456'),null);
});

test('retired officer roles resolve to Investigating Officer without changing the officer ID',async()=>{
  process_.env.NODE_ENV='test';dbUnavailable=false;
  for(const retiredRole of ['DUTY_OFFICER','SPECIAL_UNIT_DUTY_OFFICER']){
    dbUser={...officer('QA-IO','test-pin'),role:retiredRole};
    const session=await sessionUser(new Request('http://local',{headers:{cookie:'cms_session='+issueSession(dbUser.id)}}));
    assert.equal(session.id,dbUser.id);
    assert.equal(session.role,'ENQUIRY_OFFICER');
    assert.equal(session.roleDisplay,'Investigating Officer (IO)');
  }
  dbUser=null;
});

test('DEV-ADMIN requires the configured password and the demo PIN is not special',async()=>{
  process_.env.NODE_ENV='production';process_.env.CMS_DEVELOPER_ADMIN_PASSWORD='s3cret-password';dbUnavailable=false;dbUser=null;
  assert.equal(await validLogin('DEV-ADMIN','123456'),null);
  const dev=await validLogin('DEV-ADMIN','s3cret-password');
  assert.equal(dev.id,'cms_developer_admin');assert.equal(dev.role,'SUPER_ADMIN');
  delete process_.env.CMS_DEVELOPER_ADMIN_PASSWORD;
  assert.equal(await validLogin('DEV-ADMIN','s3cret-password'),null);
  process_.env.NODE_ENV='test';
});

test('one-click officer resolution falls back to the seeded account store when the database has no such user',async()=>{
  process_.env.NODE_ENV='test';dbUser=null;dbUnavailable=false;
  storeAccount={id:'acc_1',pno:'HR-11111111',fullName:'Store Officer',beltNumber:'1111',rank:'INSPECTOR',
    role:'SHO',roleDisplay:'Station House Officer (SHO)',status:'ACTIVE',policeStation:'PS Store',
    assignedUnitId:'unit-store',district:'Panipat',authorizedPoliceStations:['PS Store']};
  const resolved=await viewableOfficer('acc_1');
  assert.equal(resolved.id,'acc_1');assert.equal(resolved.stationName,'PS Store');
  assert.equal(await viewableOfficer('missing-id'),null);
  storeAccount=null;
});

test('an opted-out deployment rejects one-click demo resolution but keeps database logins',async()=>{
  process_.env.NODE_ENV='production';process_.env.DISABLE_DEMO_LOGIN='true';dbUnavailable=false;dbUser=null;
  assert.equal(demoEnabled(),false);
  storeAccount={id:'acc_1',pno:'HR-11111111',fullName:'Store Officer',beltNumber:'1111',rank:'INSPECTOR',
    role:'SHO',roleDisplay:'Station House Officer (SHO)',status:'ACTIVE',policeStation:'PS Store',
    assignedUnitId:'unit-store',district:'Panipat',authorizedPoliceStations:['PS Store']};
  assert.equal(await viewableOfficer('acc_1'),null);
  storeAccount=null;
  // A session token issued for an account that only existed as a demo profile no longer resolves.
  assert.equal(await sessionUser(new Request('http://local',{headers:{cookie:'cms_session='+issueSession('acc_1',undefined,true)}})),null);
  // Database credentials remain the source of truth in opted-out deployments.
  dbUser=officer('HR-04291882','real-pin');
  assert.equal((await validLogin('HR-04291882','real-pin')).id,'usr_real_1');
  dbUser=null;
  delete process_.env.DISABLE_DEMO_LOGIN;
  process_.env.NODE_ENV='test';
});

test('view-as resolves the viewed officer from the developer session and falls back safely',async()=>{
  process_.env.NODE_ENV='test';dbUnavailable=false;dbUser=null;
  const developer='cms_developer_admin';
  dbUser=officer('HR-04291882','real-pin');
  // The developer session with a view-as marker resolves to the viewed officer.
  const view=await sessionUser(new Request('http://local',{headers:{cookie:'cms_session='+issueSession(developer,undefined,false,dbUser.id)}}));
  assert.equal(view.id,dbUser.id);assert.equal(view.stationName,dbUser.unit.name);
  // The principal still exposes the real developer session behind the view.
  const principal=await sessionPrincipal(new Request('http://local',{headers:{cookie:'cms_session='+issueSession(developer,undefined,false,dbUser.id)}}));
  assert.equal(principal.userId,developer);assert.equal(principal.viewAs,dbUser.id);
  // Unknown targets and the developer identity itself fall back to the developer's own session.
  const fallback=await sessionUser(new Request('http://local',{headers:{cookie:'cms_session='+issueSession(developer,undefined,false,'missing-id')}}));
  assert.equal(fallback.id,developer);
  const self=await sessionUser(new Request('http://local',{headers:{cookie:'cms_session='+issueSession(developer,undefined,false,developer)}}));
  assert.equal(self.id,developer);
  // A non-developer session never gains another identity through a view-as marker.
  const unaffected=await sessionUser(new Request('http://local',{headers:{cookie:'cms_session='+issueSession(dbUser.id,undefined,false,dbUser.id)}}));
  assert.equal(unaffected.id,dbUser.id);
  // Without a marker (after exiting) the developer's own identity returns.
  const exited=await sessionUser(new Request('http://local',{headers:{cookie:'cms_session='+issueSession(developer)}}));
  assert.equal(exited.id,developer);
  dbUser=null;
});
