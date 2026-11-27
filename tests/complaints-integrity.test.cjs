const {test,after}=require('node:test');
const assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),vm=require('node:vm'),ts=require('typescript');
const temp=fs.mkdtempSync(path.join(os.tmpdir(),'cms-complaints-'));fs.mkdirSync(path.join(temp,'prisma'));fs.writeFileSync(path.join(temp,'prisma','complaints-store.json'),'[]');
const modules=new Map(),storage=new Map(),events=[];let actor='usr_mhc_1',quota=false,failSave=false;let route, alternatePosting;
const window={localStorage:{getItem:k=>storage.get(k)??null,removeItem:k=>storage.delete(k),setItem:(k,v)=>{if(quota)throw new Error('Quota');storage.set(k,v);}},dispatchEvent:e=>events.push(e),addEventListener:()=>{}};
class CustomEvent{constructor(type,options){this.type=type;this.detail=options?.detail;}}
const process_={...process,cwd:()=>temp,env:{...process.env,NODE_ENV:'test',CMS_SESSION_SECRET:'test-secret-'.repeat(4)}};
function load(file){if(modules.has(file))return modules.get(file);const exports={};modules.set(file,exports);const code=ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText;
vm.runInNewContext(code,{exports,console,Date,Intl,Map,Set,Buffer,URL,Request,Response,structuredClone,crypto:require('node:crypto').webcrypto,globalThis:{},process:process_,setTimeout,queueMicrotask,window,CustomEvent,fetch:async(url,options={})=>{if(failSave&&options.method==='POST')return Response.json({error:'Simulated backend failure'},{status:503});const auth=load('src/lib/serverSession.ts');const req=new Request('http://local'+url,{...options,headers:{...options.headers,cookie:'cms_session='+auth.issueSession(actor)}});return (options.method==='POST'?route.POST:route.GET)(req);},require(n){
 if(n==='@/lib/prisma')return {prisma:{user:{findUnique:async({where})=>{
   const person=USERS.find(row=>row.id===where.id || row.pno===where.pno);
   if(!person || (where.pno && person.id!=='usr_sho_1'))return null;
   return {...person,fullName:person.name,status:'ACTIVE',passwordHash:'test-salt:'+require('node:crypto').scryptSync('test-secret-pin','test-salt',64).toString('hex'),
     unit:alternatePosting && person.id==='usr_sho_1' ? alternatePosting : {id:'unit-'+person.stationCode,code:person.stationCode,name:person.stationName,district:person.district}};
 }},policeUnit:{findMany:async()=>[]}}};
 if(n==='next/server')return {NextResponse:Response};
 if(n==='./generalDiaryService')return {GeneralDiaryService:new Proxy({},{get:()=>async()=>({id:'qa-gd'})})};
 if(n==='./evidenceBlobStore')return {evidenceBlobStore:{put:async()=>{},get:async()=>null}};
 if(n==='./complaintAutoFillService')return {complaintAutoFillService:{}};
 if(n==='./universalEvidenceService')return {universalEvidenceService:{registerAndProcess:async()=>({id:'qa-processed'})}};
 if(n.startsWith('@/')){let f='src/'+n.slice(2);return load(fs.existsSync(f+'.ts')?f+'.ts':f+'/index.ts');}
 if(n.startsWith('.'))return load(path.join(path.dirname(file),n+'.ts'));
 return require(n);
 }});return exports;}
// Local fixture accounts replacing the removed hardcoded demo personas. The fake
// prisma User table serves these rows so the integrity tests stay self-contained.
const USERS=[
 {id:'usr_sho_1',pno:'HR-04291882',name:'Inspector Rajesh Kumar',rank:'INSPECTOR',role:'SHO',roleDisplay:'Station House Officer (SHO)',stationName:'PS City Panipat',stationCode:'HAR-PNP-PS-01',district:'Panipat'},
 {id:'usr_mhc_1',pno:'HR-05192834',name:'HC Devinder Kumar',rank:'HEAD_CONSTABLE',role:'MHC_GD_INCHARGE',roleDisplay:'Moharrir Head Constable (MHC)',stationName:'PS City Panipat',stationCode:'HAR-PNP-PS-01',district:'Panipat'},
 {id:'usr_eo_1',pno:'HR-07182930',name:'Sub-Inspector Vikram Singh',rank:'SUB_INSPECTOR',role:'ENQUIRY_OFFICER',roleDisplay:'Investigating Officer (IO)',stationName:'PS City Panipat',stationCode:'HAR-PNP-PS-01',district:'Panipat'},
 {id:'usr_eo_2',pno:'HR-07182931',name:'Sub-Inspector Naresh Kumar',rank:'SUB_INSPECTOR',role:'ENQUIRY_OFFICER',roleDisplay:'Investigating Officer (IO)',stationName:'PS City Panipat',stationCode:'HAR-PNP-PS-01',district:'Panipat'},
];
route=load('src/app/api/complaints/route.ts');
const {issueSession,sessionUser,validLogin}=load('src/lib/serverSession.ts'),permissions=load('src/utils/complaintPermissions.ts');
const {nextComplaintNumber}=load('src/lib/complaintNumber.ts'),integrity=load('src/lib/complaintIntegrity.ts');
const {ComplaintService:s}=load('src/services/complaintService.ts');
const payload={source:'WALK_IN_STATION',category:'OTHER_GENERAL',priority:'ROUTINE',incidentDate:'2026-10-27',incidentPlace:'Test place',complainantName:'Test Citizen',complainantMobile:'9999999999',complainantAddress:'Test address',complainantCity:'Panipat',complainantDistrict:'Panipat',accusedList:[]};
const post=(body,user='usr_sho_1')=>route.POST(new Request('http://local/api/complaints',{method:'POST',headers:{cookie:'cms_session='+issueSession(user),'Content-Type':'application/json'},body:JSON.stringify(body)}));
let saved;
test('MM and MHC can work with their station complaints without assigning officers',()=>{
 const unit={id:'chandnibagh',name:'PS Chandnibagh',district:'Panipat'};
 const complaint={custodyUnit:unit};
 for(const role of ['MHC_GD_INCHARGE','MM']){
  const user={id:role,role,unitId:unit.id,stationName:unit.name,district:unit.district};
  assert.equal(permissions.canViewComplaint(user,complaint).allowed,true);
  assert.equal(permissions.canCreateDocument(user,complaint).allowed,true);
  assert.equal(permissions.canReassignEO(user,complaint).allowed,false);
  assert.equal(permissions.canViewComplaint(user,{custodyUnit:{...unit,id:'other'}}).allowed,false);
 }
});
test('unsigned/forged sessions cannot access API; empty register stays empty',async()=>{
 assert.equal((await route.GET(new Request('http://local/api/complaints?viewerRole=SHO'))).status,401);
 assert.equal((await route.POST(new Request('http://local/api/complaints',{method:'POST',body:JSON.stringify({complaints:[]})}))).status,401);
 assert.equal(await sessionUser(new Request('http://local',{headers:{cookie:'cms_session=forged.123'}})),null);
 assert.equal(await validLogin('not-a-user','123456'),null);assert.equal(await validLogin('HR-04291882','wrong'),null);
 const r=await route.GET(new Request('http://local/api/complaints',{headers:{cookie:'cms_session='+issueSession('usr_sho_1')}}));assert.equal((await r.json()).complaints.length,0);
});
test('permission checks use exact officer identity, station, district and document ownership',()=>{
 const c={assignedEoId:'other',assignedEoName:'SI Ram Kumar',policeStation:'PS City Panipat',district:'Panipat'};
 assert.equal(permissions.isUserAssignedEo({id:'different',name:'Ram',role:'ENQUIRY_OFFICER'},c),false);
 // Assignment alone grants EO visibility — even across a station boundary.
 assert.equal(permissions.canViewComplaint({id:'other',role:'ENQUIRY_OFFICER',stationName:'Other PS'},c).allowed,true);
 // An EO without the assignment sees nothing, not even their own station's list.
 assert.equal(permissions.canViewComplaint({id:'different',role:'ENQUIRY_OFFICER',stationName:'PS City Panipat'},c).allowed,false);
 assert.equal(permissions.canViewComplaint({id:'sho',role:'SHO'},c).allowed,false);
 assert.equal(permissions.canViewComplaint({id:'sp',role:'SP_DISTRICT',district:'Karnal'},c).allowed,false);
 assert.equal(permissions.canDeleteDocument({id:'other',pno:'123'},{createdByUserId:'HR-12345'}).allowed,false);
 assert.equal(permissions.isUserAssignedEo({id:'usr_eo_1',pno:'HR-07182930'}, {assignedEoName:'SI Vikram Singh',assignedEoPno:'07182930'}),true);
});
test('numbering resets yearly and uses the actual district',()=>{
 assert.equal(nextComplaintNumber([{complaintNumber:'HAR-PNP-2025-CMP-CTY-0099',policeStation:'PS City Panipat'}],2026,'PS City Panipat','Panipat'),'HAR-PNP-2026-CMP-CTY-0001');
 assert.equal(nextComplaintNumber([],2026,'PS City Gurugram','Gurugram'),'HAR-GGM-2026-CMP-CTY-0001');
 assert.equal(nextComplaintNumber([{complaintNumber:'HAR-PNP-2026-CMP-SAD-0099',policeStation:'PS Sadar',district:'Panipat'}],2026,'PS Sadar','Gurugram'),'HAR-GGM-2026-CMP-SAD-0001');
});
test('closed age freezes even after later edits, direct FIR queue remains pending',()=>{
 const closed=integrity.stabilizeComplaint({createdAt:'2026-10-01',updatedAt:'2026-10-10',status:'COMPLETE'});
 const edited=integrity.stabilizeComplaint({...closed,updatedAt:'2026-10-20'},closed);
 assert.equal(integrity.computeDaysPending(edited),9);
 assert.equal(integrity.computeDaysPending({createdAt:'2026-10-01',status:'FIR_REGISTER'},new Date('2026-10-20T10:00:00Z')),19);
});
test('registration is durable and storage quota cannot trim any complaints',async()=>{
 storage.set('haryana_police_cms_user',actor);
 const legacyKey='haryana_police_cms_complaints_v1';storage.set(legacyKey,'[]');quota=true;
 saved=await s.createComplaint(payload,'Test MHC','PS City Panipat','Panipat');
 assert.equal(saved.persistenceVersion,1);assert.ok(saved.complaintNumber.includes('-PNP-'));
 const actual=JSON.parse(fs.readFileSync(path.join(temp,'prisma','complaints-store.json')));assert.equal(actual.length,1);assert.equal(actual[0].id,saved.id);
 assert.equal(storage.has(legacyKey),false);
 assert.equal(storage.get('haryana_police_cms_user'),actor);
 assert.equal(events.some(e=>e.type==='complaints_cache_warning'),false);quota=false;
});
test('MHC can attach the permanent intake docket before EO assignment',async()=>{
 const record=await s.addDocument(saved.id,{fileName:'Registered_Complaint_QA.pdf',fileCategory:'REGISTERED COMPLAINT DOCKET',uploadedBy:'Test MHC',fileSize:'1 KB',dataUrl:'data:application/pdf;base64,JVBERg==',isPermanentRegistrationDoc:true});
 assert.ok(record.id);const row=JSON.parse(fs.readFileSync(path.join(temp,'prisma','complaints-store.json')))[0];assert.equal(row.documents.length,1);
 // The store row is persisted in ID direction; post the normalized record instead.
 saved=(await (await route.GET(new Request('http://local/api/complaints',{headers:{cookie:'cms_session='+issueSession('usr_mhc_1')}}))).json()).complaints[0];
});
test('backend rejects bulk replacement, stale updates, and another officer assignment',async()=>{
 assert.equal((await post({complaints:[]})).status,400);
 let r=await post({operation:'assignEnquiryOfficer',changes:[{complaint:{...saved,assignedEoId:'usr_eo_1'},expectedVersion:saved.persistenceVersion}]},'usr_mhc_1');assert.equal(r.status,403);
 r=await post({operation:'assignEnquiryOfficer',changes:[{complaint:{...saved,assignedEoId:'usr_eo_1',assignedEoName:'Sub-Inspector Vikram Singh'},expectedVersion:saved.persistenceVersion}]});assert.equal(r.status,200);saved=(await r.json()).complaints[0];
 const stale=await post({operation:'save',changes:[{complaint:saved,expectedVersion:1}]});assert.equal(stale.status,409);
 const hidden=await route.GET(new Request('http://local/api/complaints',{headers:{cookie:'cms_session='+issueSession('usr_eo_2')}}));assert.equal((await hidden.json()).complaints.length,0);
 const escalation=await post({operation:'save',changes:[{complaint:{...saved,shoDecision:'APPROVE'},expectedVersion:saved.persistenceVersion}]},'usr_eo_1');assert.equal(escalation.status,403);
});
test('service reports backend failures and rolls back failed registration',async()=>{
 const before=JSON.parse(fs.readFileSync(path.join(temp,'prisma','complaints-store.json'))).length;failSave=true;
 await assert.rejects(s.createComplaint(payload,'Test MHC','PS City Panipat','Panipat'),/Simulated backend failure/);failSave=false;
 assert.equal(JSON.parse(fs.readFileSync(path.join(temp,'prisma','complaints-store.json'))).length,before);
});
test('simultaneous writes use record versions and cannot clobber a newer save',async()=>{
 const body={operation:'save',changes:[{complaint:{...saved,subject:'Concurrent A'},expectedVersion:saved.persistenceVersion}]};
 const other={operation:'save',changes:[{complaint:{...saved,subject:'Concurrent B'},expectedVersion:saved.persistenceVersion}]};
 const results=await Promise.all([post(body),post(other)]);assert.deepEqual(results.map(r=>r.status).sort(),[200,409]);
 const rows=JSON.parse(fs.readFileSync(path.join(temp,'prisma','complaints-store.json')));assert.equal(rows.length,1);assert.equal(rows[0].persistenceVersion,saved.persistenceVersion+1);
});
test('malformed nested records and another users document deletion are rejected',async()=>{
 // The store row is persisted in ID direction; post the normalized record instead.
 const current=(await (await route.GET(new Request('http://local/api/complaints',{headers:{cookie:'cms_session='+issueSession('usr_sho_1')}}))).json()).complaints[0];
 let r=await post({operation:'save',changes:[{complaint:{...current,reports:'not-an-array'},expectedVersion:current.persistenceVersion}]});assert.equal(r.status,400);
 r=await post({operation:'save',changes:[{complaint:{...current,documents:[...(current.documents||[]),{id:'qa-doc',fileName:'evidence.pdf',createdByUserId:'usr_eo_2'}]},expectedVersion:current.persistenceVersion}]});assert.equal(r.status,200);
 const updated=(await r.json()).complaints[0];assert.equal(updated.documents.find(d=>d.id==='qa-doc').createdByUserId,'usr_sho_1');r=await post({operation:'deleteDocument',changes:[{complaint:{...updated,documents:[]},expectedVersion:updated.persistenceVersion}]},'usr_eo_1');assert.equal(r.status,403);
});
test('missing assignment actor cannot bypass the service and hidden profiles stay hidden',async()=>{
 storage.set('haryana_police_cms_user','usr_mhc_1');
 await assert.rejects(s.assignEnquiryOfficer(saved.id,'usr_eo_2','Other EO','ASI','TEST','Unverified actor'),/Access Denied/);
 actor='usr_eo_2';storage.set('haryana_police_cms_user',actor);
 assert.equal(await s.getComplaintById(saved.id),undefined);actor='usr_mhc_1';storage.set('haryana_police_cms_user',actor);
});
test('more than 30 records remain available when browser cache is full',async()=>{
 const changes=Array.from({length:35},(_,i)=>({complaint:{...saved,id:'quota-'+i,complaintNumber:`HAR-PNP-2026-CMP-CTY-${String(i+2).padStart(4,'0')}`,createdAt:'2026-10-27T00:00:00Z',updatedAt:'2026-10-27T00:00:00Z',assignedEoId:undefined,assignedEoName:undefined,persistenceVersion:undefined},expectedVersion:0}));
 const result=await post({operation:'createComplaint',changes});assert.equal(result.status,200);
 quota=true;const records=await s.getComplaints({viewerRole:'MHC_GD_INCHARGE',viewerStation:'PS City Panipat'});quota=false;
 assert.equal(records.length,36);assert.equal(JSON.parse(fs.readFileSync(path.join(temp,'prisma','complaints-store.json'))).length,36);
});
test('production rejects demo PIN and accepts only database credentials',async()=>{
 const env=process_.env;const previous={NODE_ENV:env.NODE_ENV,DISABLE:env.DISABLE_DEMO_LOGIN};env.NODE_ENV='production';env.DISABLE_DEMO_LOGIN='true';
 assert.equal(await validLogin('HR-04291882','123456'),null);
 assert.equal((await validLogin('HR-04291882','test-secret-pin')).id,'usr_sho_1');assert.equal(await validLogin('HR-06281923','test-secret-pin'),null);
 Object.assign(env,previous);
 if(previous.DISABLE===undefined)delete env.DISABLE_DEMO_LOGIN;
});
test('an existing session resolves a transferred officer against the new posting',async()=>{
 const request=new Request('http://local',{headers:{cookie:'cms_session='+issueSession('usr_sho_1')}});
 const before=await sessionUser(request);
 const original={district:before.district,policeStation:before.stationName};
 assert.equal(permissions.canViewComplaint(before,original).allowed,true);
 alternatePosting={id:'unit-other',name:'Other Station',code:'OTHER',district:before.district};
 try {
   const after=await sessionUser(request);
   assert.equal(after.unitId,'unit-other');
   assert.equal(permissions.canViewComplaint(after,original).allowed,false);
   assert.equal(permissions.canViewComplaint(after,{...original,policeStation:'Other Station'}).allowed,true);
 } finally { alternatePosting=undefined; }
});
after(()=>fs.rmSync(temp,{recursive:true,force:true}));

test('DEV-ADMIN requires the configured password in every mode; the demo PIN is never special',async()=>{
 const env=process_.env;const previous={NODE_ENV:env.NODE_ENV,PASSWORD:env.CMS_DEVELOPER_ADMIN_PASSWORD,DISABLE:env.DISABLE_DEMO_LOGIN};
 try{
  env.NODE_ENV='production';delete env.CMS_DEVELOPER_ADMIN_PASSWORD;env.DISABLE_DEMO_LOGIN='true';
  assert.equal(await validLogin('DEV-ADMIN','123456'),null);
  delete env.DISABLE_DEMO_LOGIN;env.NODE_ENV='test';
  assert.equal(await validLogin('DEV-ADMIN','123456'),null);
  env.NODE_ENV='production';env.CMS_DEVELOPER_ADMIN_PASSWORD='test-dev-password';
  assert.equal((await validLogin('DEV-ADMIN','test-dev-password')).id,'cms_developer_admin');
  assert.equal(await validLogin('DEV-ADMIN','123456'),null);
  // The password path stays available in opted-out (operational) deployments.
  env.DISABLE_DEMO_LOGIN='true';
  assert.equal((await validLogin('DEV-ADMIN','test-dev-password')).id,'cms_developer_admin');
 }finally{
  env.NODE_ENV=previous.NODE_ENV;
  if(previous.PASSWORD===undefined)delete env.CMS_DEVELOPER_ADMIN_PASSWORD;else env.CMS_DEVELOPER_ADMIN_PASSWORD=previous.PASSWORD;
  if(previous.DISABLE===undefined)delete env.DISABLE_DEMO_LOGIN;else env.DISABLE_DEMO_LOGIN=previous.DISABLE;
 }
});
