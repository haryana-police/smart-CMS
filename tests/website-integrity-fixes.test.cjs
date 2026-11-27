const fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript'),path=require('node:path');
const {test}=require('node:test'),assert=require('node:assert/strict');
function environment(seed={},mocks={},fail=false){
 const values=new Map(Object.entries(seed));const modules=new Map();let failWrites=fail;
 const localStorage={getItem:k=>values.get(k)??null,setItem:(k,v)=>{if(failWrites)throw Error('quota');values.set(k,v);},removeItem:k=>values.delete(k)};
 const window={localStorage,dispatchEvent(){},addEventListener(){},removeEventListener(){}};
 function load(file){file=path.normalize(file);if(modules.has(file))return modules.get(file);const exports={};modules.set(file,exports);
 const context={exports,fetch:mocks["test:fetch"],window,localStorage,Date,Intl,Math,structuredClone,Error,Response,Request,URL,Buffer,setTimeout,clearTimeout,process,CustomEvent:function(){},console:{warn(){},error(){},log(){}},require(n){if(n==='server-only')return {};if(n in mocks)return mocks[n];if(n.startsWith('@/') && /\.(json|cjs)$/.test(n))return require(path.resolve('src',n.slice(2)));if(n.startsWith('@/'))return load('src/'+n.slice(2)+'.ts');if(n.startsWith('.') && /\.(json|cjs)$/.test(n))return require(path.resolve(path.dirname(file),n));if(n.startsWith('.'))return load(path.resolve(path.dirname(file),n)+'.ts');return require(n);}};
 vm.runInNewContext(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText,context,{filename:file});return exports;}
 return {load,values,failWrites:()=>{failWrites=true;}};
}
test('report approval and CHI project into the FIR once and preserve later reopening',()=>{
 const apply=environment().load('src/lib/finalReportFirState.ts').applyFinalReportState;
 const fir={id:'f',status:'UNDER_INVESTIGATION',reports:[]};
 const report={id:'r',complaintId:'f',versionNumber:1,createdBy:'io',finalReportData:{formType:'CHARGESHEET',reportNo:'10',chargeSheetType:'Complete',courtType:'Court',judgeName:'Judge',briefFacts:'Recorded facts'},finalReportWorkflow:{state:'UNDER_CHECKING'}};
 const checked=apply(fir,report);assert.equal(checked.trackingState,'PART_B_UNDER_CHECKING');
 report.finalReportWorkflow={state:'COMPLETED',chiNumber:'CHI1',chiSubmittedAt:'2026-10-27T20:00:00Z',chiSubmittedBy:'io'};
 const complete=apply(checked,report);assert.equal(complete.status,'CHARGESHEET_FILED');assert.equal(complete.finalFormDate,'2026-10-28');assert.equal(complete.completionHistory.length,1);assert.equal(complete.challanRecords[0].courtSubmittedAt,report.finalReportWorkflow.chiSubmittedAt);
 assert.equal(apply(complete,report),complete);
 const reopened={...complete,trackingState:'PART_B_REOPEN',status:'UNDER_INVESTIGATION'};assert.equal(apply(reopened,report),reopened);
 report.finalReportWorkflow={...report.finalReportWorkflow,state:'PARTIAL'};
 const partial=apply(checked,report);assert.equal(partial.trackingState,'PART_B_PARTIAL');assert.equal(partial.completionHistory,undefined);assert.equal(partial.challanRecords[0].challanMode,'PARTIAL');
});
test('duplicate register numbers never replace records and ambiguous number updates fail',()=>{
 const s=environment({'cms_registrations_data':'[]'}).load('src/services/registrationService.ts').RegistrationService;
 s.addEntry({id:'a',type:'MISSING_PERSON',regNumber:'1/2026',stationName:'A'});
 assert.throws(()=>s.addEntry({id:'b',type:'MISSING_PERSON',regNumber:'1/2026',stationName:'A'}));
 s.addEntry({id:'c',type:'LOST_PROPERTY',regNumber:'1/2026',stationName:'A'});
 assert.throws(()=>s.updateEntry('1/2026',{status:'CLOSED'}));assert.equal(s.getEntries().length,2);
});
test('different registration types and stations retain equal registration numbers; empty stays empty',()=>{
 const env=environment({'cms_registrations_data':'[]'});const s=env.load('src/services/registrationService.ts').RegistrationService;
 assert.equal(s.getEntries().length,0);s.addEntry({id:'mp',type:'MISSING_PERSON',regNumber:'0002/2019',stationName:'A'});s.addEntry({id:'lp',type:'LOST_PROPERTY',regNumber:'0002/2019',stationName:'A'});s.addEntry({id:'mp-b',type:'MISSING_PERSON',regNumber:'0002/2019',stationName:'B'});assert.equal(s.getEntries().length,3);
 s.setAllEntries([]);assert.equal(s.getEntries().length,0);
});
test('registration save failure keeps previous record and never replaces photographs',()=>{
 const env=environment({'cms_registrations_data':'[]'});const s=env.load('src/services/registrationService.ts').RegistrationService;const photo='data:image/png;base64,'+'a'.repeat(50000);
 s.addEntry({id:'photo',type:'UIDB',regNumber:'1',photoUrl:photo});assert.equal(JSON.parse(env.values.get('cms_registrations_data'))[0].photoUrl,photo);
 env.failWrites();assert.throws(()=>s.updateEntry('photo',{personName:'not saved'}));assert.equal(s.getEntries()[0].personName,undefined);
});
test('missing person creation never supplies identity, old dates, GD, address or findings',()=>{
 const env=environment({'haryana_police_cms_missing_person_records_v1':'[]'});const s=env.load('src/services/missingPersonService.ts').missingPersonService;
 const record=s.saveRecord({id:'new',firstName:'Provided',registrationYear:'2028'});assert.equal(record.firstName,'Provided');for(const key of ['gdNumber','gdDateTime','firNumber','complainantUid','occupation','nameOfEo','remarks','dateSinceMissing'])assert.equal(record[key],'',key);assert.equal(record.idList.length,0);assert.equal(record.presentAddress.houseNo,'');
 env.failWrites();assert.throws(()=>s.saveRecord({id:'new',firstName:'Rejected',registrationNumber:record.registrationNumber}));assert.equal(s.getRecordById('new').firstName,'Provided');
});
test('lost property numbering uses maximum; empty year starts at one',()=>{
 const e=environment({'haryana_police_cms_lost_property_records_v1':JSON.stringify([{registrationNumber:'0001/2026',registrationYear:'2026'},{registrationNumber:'0003/2026',registrationYear:'2026'}])});const s=e.load('src/services/lostPropertyService.ts').lostPropertyService;assert.equal(s.getNextRegistrationNumber('2026'),'0004/2026');assert.equal(s.getNextRegistrationNumber('2028'),'0001/2028');
});
test('TA ownership never falls back to empty or partial names; deletion and edits check owner',async()=>{
 const rows=new Map(),lines=[],events=[];const when='2026-01-01T00:00:00.000Z';
 const user={id:'me',name:'Officer Name',district:'D',stationName:'PS A'};
 rows.set('other',{ownerId:'someone-else',status:'DRAFT',updatedAt:when,deleted:false,payload:JSON.stringify({id:'other',userId:'someone-else',userName:'',status:'DRAFT',createdAt:when,updatedAt:when,form1TourProgramme:{employeeName:'',journeys:[]},form2JourneyDetails:{journeys:[]},form3MainPage:{}})});
 const prisma={$transaction:arg=>Array.isArray(arg)?Promise.all(arg):arg(prisma),
  $queryRaw:(strings,...values)=>{const sql=strings.join('?'),s=sql.trim();
   if(sql.includes('TaDaBillLine'))return Promise.resolve(lines.filter(l=>rows.get(l.billId)?.ownerId===user.id).map(l=>({billId:l.billId,form:l.form,payload:l.payload})));
   if(s.startsWith('SELECT id FROM "TaDaBill"'))return Promise.resolve([...rows.entries()].filter(([,r])=>r.ownerId===user.id&&r.deleted).map(([id])=>({id})));
   if(s.startsWith('SELECT "ownerId"'))return Promise.resolve(rows.has(values[0])?[rows.get(values[0])]:[]);
   return Promise.resolve([...rows.values()].filter(r=>r.ownerId===user.id&&!r.deleted).map(r=>({payload:r.payload})));
  },
  $executeRaw:(strings,...values)=>{const s=strings.join('?').trim();
   if(s.startsWith('UPDATE "TaDaBill" SET "deleted"')){const r=rows.get(values[1]);if(!r||r.ownerId!==values[2]||r.updatedAt!==values[3]||r.deleted)return Promise.resolve(0);r.deleted=true;r.updatedAt=values[0];return Promise.resolve(1);}
   if(s.startsWith('UPDATE "TaDaBill" SET "status"')){const r=rows.get(values[4]);if(!r||r.ownerId!==values[5]||r.deleted)return Promise.resolve(0);r.status=values[0];r.updatedAt=values[1];r.payload=values[2];return Promise.resolve(1);}
   if(s.startsWith('INSERT INTO "TaDaBill"')){rows.set(values[0],{ownerId:values[1],status:values[2],updatedAt:values[3],payload:values[4],deleted:false});return Promise.resolve(1);}
   if(s.startsWith('DELETE FROM "TaDaBillLine"')){for(let i=lines.length-1;i>=0;i--)if(lines[i].billId===values[0])lines.splice(i,1);return Promise.resolve(1);}
   if(s.startsWith('INSERT INTO "TaDaBillLine"')){lines.push({billId:values[0],form:values[1],position:values[2],payload:values[3]});return Promise.resolve(1);}
   if(s.startsWith('INSERT INTO "TaDaBillEvent"')){events.push({billId:values[1],officerId:values[2]});return Promise.resolve(1);}
   return Promise.resolve(0);
  }};
 const e=environment({},{'@/lib/apiSecurity':{apiAccess:async()=>user,forbidden:(reason)=>Response.json({error:reason||'Forbidden'},{status:403})},'@/lib/prisma':{prisma}});
 const route=e.load('src/app/api/tada/route.ts');
 const post=body=>route.POST(new Request('http://localhost/api/tada',{method:'POST',body:JSON.stringify(body)}));
 const get=async()=>(await (await route.GET(new Request('http://localhost/api/tada'))).json());
 const bill=(id,userId)=>({id,userId,userName:'Officer Name',status:'DRAFT',createdAt:when,updatedAt:when,form1TourProgramme:{journeys:[]},form2JourneyDetails:{journeys:[]},form3MainPage:{}});
 // Listing is owner-scoped: the foreign bill (even with an empty name) never leaks.
 assert.equal((await get()).bills.length,0);
 // Editing another officer's bill is refused even when the payload claims this user's id.
 assert.equal((await post({action:'save',bill:bill('other','me')})).status,403);
 // A bill whose userId is not the session user is refused outright.
 assert.equal((await post({action:'save',bill:bill('mine','someone-else')})).status,403);
 // Deleting another officer's bill is refused.
 assert.equal((await post({action:'delete',id:'other',updatedAt:when})).status,403);
 // The own draft saves under the session user and appears in the owner-scoped listing.
 assert.equal((await post({action:'save',bill:bill('mine','me')})).status,200);
 assert.equal(rows.get('mine').ownerId,'me');
 assert.equal((await get()).bills.length,1);
 // Deleting the own draft succeeds and archives it.
 assert.equal((await post({action:'delete',id:'mine',updatedAt:rows.get('mine').updatedAt})).status,200);
 assert.equal((await get()).bills.length,0);
});
test('TA extraction from no GD creates no invented journeys or financial approval',async()=>{
 const e=environment({}, {'@/services/generalDiaryService':{},'./generalDiaryService':{GeneralDiaryService:{getEntries:async()=>[]}}});const s=e.load('src/services/tadaAutoFillService.ts').tadaAutoFillService;
 const month=e.load('src/services/tadaAutoFillService.ts').getSpecificMonthInfo(2026,8);const user={id:'u',name:'Test',stationName:'A',district:'D'};assert.equal((await s.extractUserGDEntries(user,month)).length,0);const bill=s.buildTADABill(user,month,[]);assert.equal(bill.form2JourneyDetails.totalClaimAmount,0);assert.equal(bill.form3MainPage.certContentsVerified,false);assert.equal(bill.form3MainPage.appropriationAmount,0);
});
test('SITREP uses event dates from older FIRs and ignores unverified recoveries and undated arrests',async()=>{
 const firs=[{id:'old',firNumber:'1',firDate:'2025-01-01',district:'Panipat',policeStation:'PS City Panipat',category:'PROPERTY_THEFT_BURGLARY',actsAndSections:'164',status:'CHARGESHEET_FILED',finalFormDate:'2026-10-26',accusedList:[{name:'A',isArrested:true,arrestDate:'2026-10-26'},{name:'Undated',isArrested:true}],propertiesList:[{propertyType:'Recovered',status:'RECOVERED',recoveredAt:'2026-10-26'},{propertyType:'Stolen',status:'STOLEN',recoveredAt:'2026-10-26'}]},{id:'new',firNumber:'2',firDate:'2026-10-26',district:'Panipat',policeStation:'PS City Panipat',category:'OTHER',actsAndSections:'164',status:'UNDER_INVESTIGATION',accusedList:[{name:'Other day',isArrested:true,arrestDate:'2026-10-25'}]}];
 const e=environment({}, {'./firService':{firService:{getAllFirs:()=>firs}},'./generalDiaryService':{GeneralDiaryService:{getEntries:async()=>[]}},'./complaintService':{ComplaintService:{getComplaints:async()=>[]}}});const s=e.load('src/services/reportsService.ts').ReportsService;const r=await s.getCrimeSitrep('2026-10-27','PS City Panipat','Panipat');assert.equal(r.firEntries.length,1);assert.equal(r.arrests.length,1);assert.match(r.arrests[0].accusedDetails,/^A/);assert.equal(r.recoveries.length,1);assert.equal(r.completeChallans.length,1);assert.equal(r.completeChallans[0].firNo.startsWith('1'),true);assert.equal(r.section1HeadCounts.find(r=>r.head==='Rape').totalNumber,'--');
});
test('comparative report supports new years and IGP assigns actual disjoint pendency ages',async()=>{
 const firs=[{firYear:2027,category:'PROPERTY_THEFT_BURGLARY',status:'UNDER_INVESTIGATION',firDate:'2024-01-01',policeStation:'A',district:'D',accusedList:[]},{firYear:2028,category:'PROPERTY_THEFT_BURGLARY',status:'CHARGESHEET_FILED',firDate:'2028-01-01',policeStation:'A',district:'D',accusedList:[]}];const e=environment({}, {'./firService':{firService:{getAllFirs:()=>firs}},'./generalDiaryService':{GeneralDiaryService:{getEntries:async()=>[]}},'./complaintService':{ComplaintService:{getComplaints:async()=>[]}}});const rows=e.load('src/lib/reportIntegrity.ts').comparativeCrimeRows(firs,2028);assert.equal(rows.find(r=>r.category==='Crime Against Property').reg2026,1);const {buildIgpBriefing}=e.load('src/lib/igpBriefing.ts');const data=buildIgpBriefing('D','2028-01-02',[{...firs[0],createdAt:'2024-01-01',policeStation:'PS City Panipat'}],[]);const {igpTables,igpCellKey}=e.load('src/lib/igpTemplate.ts');const row=igpTables(9)[0].rows.findIndex(cells=>cells.some(c=>c.c===1 && /city/i.test(c.text)));assert.ok(row>=2);assert.deepEqual([3,4,5,6,8,9,10].map(col=>data.values[igpCellKey(9,0,row,col)]),[1,0,0,1,0,0,1]);
});
test('complaint drafting never invents a compromise, visit, witness or offence finding',()=>{const e=environment();const s=e.load('src/utils/complaintAnalysisEngine.ts');const r=s.analyzeComplaintForEnquiry({complaintNumber:'1',complainantName:'A',subject:'no compromise, theft',documents:[{fileName:'compromise.pdf'}]});assert.equal(r.classification,'REVIEW_REQUIRED');assert.equal(r.isFirRecommended,false);assert.equal(r.analyzedDocuments.length,0);assert.match(r.proformaFindingsText.standard_4row,/must be entered/);});
test('protected APIs reject unsigned requests before accessing records or invoking AI',async()=>{
 const mocks={'@/lib/serverSession':{sessionUser:()=>null,sameOrigin:()=>true},'@/lib/prisma':{prisma:{}},'next/server':{NextResponse:Response},'@/services/gdSmartSuggestionService':{getSmartVerifiedSuggestions:()=>[]},'@/services/losslessCompressionService':{},'@/lib/suggestionStore':{},'@/services/agent/operatorModel':{}};
 const e=environment({},mocks);
 for(const [file,method] of [['builder/drafts/route.ts','GET'],['builder/templates/[id]/route.ts','DELETE'],['fir/records/route.ts','POST'],['fir/final-reports/route.ts','PATCH'],['fir/bail-details/route.ts','POST'],['general-diary/route.ts','POST'],['evidence/store/route.ts','GET'],['evidence/download/route.ts','GET'],['evidence/compress/route.ts','POST'],['cms-agent/operator/route.ts','POST'],['acts/process/route.ts','POST'],['dev/magic-editor/route.ts','POST']]){
  const handler=e.load('src/app/api/'+file)[method];const result=await handler(new Request('http://localhost/api/'+file,{method}),{params:Promise.resolve({id:'other'})});assert.equal(result.status,401,file);
 }
});
test('API access refuses foreign origins and development tools even for authenticated ordinary officers',async()=>{
 const e=environment({}, {'@/lib/serverSession':{sessionUser:()=>({id:'io',role:'ENQUIRY_OFFICER'}),sameOrigin:()=>false}});const access=e.load('src/lib/apiSecurity.ts').apiAccess;assert.equal((await access(new Request('http://localhost/api/fir/final-reports',{method:'POST'}))).status,403);assert.equal((await access(new Request('http://localhost/api/dev/magic-editor'))).status,403);
});
test('GD write failure does not report a locally locked or saved entry',async()=>{
 const e=environment({}, {'@/lib/suggestionStore':{suggestionStore:{}},'@/lib/generalDiaryConfig':{INITIAL_GD_TYPES:[]}});
 // This VM has no fetch: backend failure must propagate without fabricating a local receipt.
 const service=e.load('src/services/generalDiaryService.ts').GeneralDiaryService;await assert.rejects(service.addEntry({typeCode:'TEST',subject:'Test',narrative:'Facts'}));await assert.rejects(service.verifyAndLockEntry({subject:'Test'},{name:'Officer'}));
});


test('FIR browser mutations await server receipts, use server numbers, serialize versions and roll back rejected saves',async()=>{
 let state=[],server=[],fail=false,release;
 const gate=new Promise(resolve=>release=resolve);
 const target={getAllFirs:()=>structuredClone(state),getLocalMigrationRecords:()=>[],replaceServerRecords:records=>{state=structuredClone(records);},registerFir(record){state.push({...record});return record;},updateFir(id,updates){const record={...state.find(r=>r.id===id),...updates};state=state.map(r=>r.id===id?record:r);return record;}};
 let first=true;
 const e=environment({}, {'./firService':{firService:target},'test:fetch':async(url,options={})=>{
  if(options.method==='GET')return Response.json({records:server});
  if(first){first=false;await gate;}
  if(fail)return Response.json({error:'Server unavailable'},{status:503});
  const saved=[];
  for(const change of JSON.parse(options.body).changes){const old=server.find(r=>r.id===change.record.id);if((old?.persistenceVersion || 0)!==change.expectedVersion)return Response.json({error:'stale'},{status:409});const next={...change.record,firNumber:'SERVER/1',persistenceVersion:change.expectedVersion+1};server=[...server.filter(r=>r.id!==next.id),next];saved.push(next);}
  return Response.json({records:saved});
 }});
 const module=e.load('src/services/persistentFirService.ts'),service=module.persistentFirService,user={id:'sho',role:'SHO',stationName:'A',district:'D'};
 await module.firPersistence.hydrate(user);
 let settled=false;const pending=service.registerFir({id:'case',firNumber:'LOCAL/1'}).then(value=>{settled=true;return value;});await new Promise(resolve=>setImmediate(resolve));assert.equal(settled,false);release();const saved=await pending;assert.equal(saved.firNumber,'SERVER/1');assert.equal(saved.persistenceVersion,1);
 fail=true;await assert.rejects(service.updateFir('case',{incidentDetails:'Rejected'}),/Server unavailable/);assert.equal(state[0].incidentDetails,undefined);assert.match(module.firPersistence.getError(),/Server unavailable/);
 fail=false;await module.firPersistence.hydrate(user);await Promise.all([service.updateFir('case',{incidentDetails:'First'}),service.updateFir('case',{incidentDetails:'Second'})]);assert.equal(server[0].persistenceVersion,3);assert.equal(server[0].incidentDetails,'Second');
});
test('recorded dates accept display formats but reject impossible days; template examples never become case facts',()=>{
 const e=environment(),utils=e.load('src/lib/dataIntegrity.ts');assert.equal(utils.recordedCalendarDate('२६.१०.२०२६'),'2026-10-26');assert.equal(utils.recordedCalendarDate('30/02/2026'),'');
 const blank=utils.blankTemplateFacts({docTitle:'Arrest memo',noticeeName:'Invented',arrestDate:'18.09.2026',witnesses:[{name:'Invented witness'}],verified:true});assert.equal(blank.docTitle,'Arrest memo');assert.equal(blank.noticeeName,'');assert.equal(blank.arrestDate,'');assert.equal(blank.witnesses.length,0);assert.equal(blank.verified,false);
});

test('record transfer preserves original registration and requires independent approval', async () => {
 const units=[{id:'a',name:'Station A',district:'District'},{id:'b',name:'Office B',district:'District'}];
 const original={id:'record',firNumber:'FIR-1',policeStation:units[0].name,district:'District',assignedIoId:'previous-io',documents:[{id:'scan'}]};
 for(const kind of ['FIR','COMPLAINT']){
  let record=kind==='FIR'?{...original}:{...original,complaintNumber:'C-1',assignedEoId:'previous-io'};
  const source={id:'source',role:'SHO',unitId:'a',stationName:'Station A',district:'District'};
  const destination={...source,id:'destination',unitId:'b',stationName:'Office B'};
  const supervisor={...source,id:'supervisor',role:'SP_DISTRICT'};
  let user=source;
  const update=async(_id,change)=>(record=change(record));
  const {load}=environment({},{
   '@/lib/apiSecurity':{apiAccess:async()=>user,forbidden:()=>new Response(null,{status:403})},
   '@/lib/prisma':{prisma:{policeUnit:{findMany:async()=>units}}},
   '@/services/firRepository':{readFirRecords:async()=>[],updateFirTransfer:update,FirRepositoryConflict:class extends Error{}},
   '@/services/complaintRepository':{readComplaints:async()=>[],updateComplaintTransfer:update,ComplaintConflict:class extends Error{}},
  });
  const route=load('src/app/api/record-transfers/route.ts');
  const visible=actor=>kind==='FIR'?load('src/lib/firIntegrity.ts').isFirVisibleToUser(actor,record):load('src/utils/complaintPermissions.ts').canViewComplaint(actor,record).allowed;
  const post=body=>route.POST(new Request('http://localhost/api/record-transfers',{method:'POST',body:JSON.stringify({kind,recordId:record.id,...body})}));
  const submit={action:'request',destinationId:'b',reason:'Approved jurisdiction review'};
  assert.equal((await post(submit)).status,200);
  assert.equal(visible(source),true);
  assert.equal(visible(destination),false);
  assert.equal((await post(submit)).status,409);
  const decision={action:'decide',transferId:record.recordTransfers[0].id,decision:'APPROVED',note:'Destination confirmed'};
  assert.equal((await post(decision)).status,403);
  user=supervisor;
  assert.equal((await post(decision)).status,200);
  assert.equal((await post(decision)).status,409);
  assert.equal(visible(source),false);
  assert.equal(visible(destination),true);
  assert.equal(record.policeStation,'Station A');
  assert.equal(record.documents[0].id,'scan');
  assert.equal(record.recordTransfers[0].decidedBy,'supervisor');
  assert.equal(kind==='FIR'?record.assignedIoId:record.assignedEoId,undefined);
 }
});

test('complaint autofill retries truncated output without persisting unregistered data', async () => {
 const saved=new Map();
 let user={id:'owner'}, calls=0;
 const {load}=environment({},{
  'next/server':{NextResponse:Response},
  '@/lib/apiSecurity':{apiAccess:async()=>user},
  '@/lib/geminiProcessing':{PROCESSING_MODEL:'test',processingAIAvailable:()=>true,processWithAI:async parts=>{
   if(++calls===1)throw Error('Gemini output was truncated.');
   if (parts[0].text.startsWith('Read only the handwritten')) return JSON.stringify({identityLine:'Name:Sample Citizen W/O Sample Relative'});
   assert.match(parts.at(-1).text,/Leave incident.details empty/);
   return JSON.stringify({complainant:{name:'Sample Citizen'},incident:{details:'partial text'}});
  }},
  'node:fs/promises':{
   mkdir:async()=>{},writeFile:async(path,value)=>saved.set(path,value),
   rename:async(from,to)=>{saved.set(to,saved.get(from));saved.delete(from);},
   unlink:async path=>saved.delete(path),
   readFile:async path=>{if(!saved.has(path))throw Object.assign(Error('missing'),{code:'ENOENT'});return saved.get(path);},
  },
 });
 const route=load('src/app/api/complaints/autofill/route.ts');
 const form=new FormData();
 form.set('file',new Blob(['sample'],{type:'image/png'}),'sample.png');
 const response=await route.POST(new Request('http://localhost/api/complaints/autofill',{method:'POST',body:form}));
 assert.equal(response.status,200);
 const result=await response.json();
 assert.equal(result.data.complainant.name,'Sample Citizen');
 assert.equal(result.data.incident.details,'');
 assert.equal(result.transcriptOmitted,true);
 const req={nextUrl:new URL('http://localhost/api/complaints/autofill?id='+result.extractionId)};
 assert.equal(saved.size,0);
 assert.equal((await route.GET(req)).status,404);
 user={id:'another-officer'};
 assert.equal((await route.GET(req)).status,404);
});

test('complaint autofill ties the relation to the complainant in Hindi and English', () => {
 const {complaintRelationFromSource: relation}=environment().load('src/lib/complaintRelation.ts');
 const text='अमित पुत्र राम निवासी गांव। काजल पत्नी रोमी उर्फ सत्यम निवासी शहर।';
 assert.equal(relation(text,'काजल').type,'W/O');
 assert.equal(relation(text,'काजल').relative,'रोमी उर्फ सत्यम');
 assert.equal(relation('काजल पुत्री सुरेश','काजल').type,'D/O');
 assert.equal(relation('Kajal D/O Suresh, Amit S/O Ram','Kajal').type,'D/O');
 assert.equal(relation('काजल ने अमित पुत्र राम का नाम बताया।','काजल').type,undefined);
});

test('legal assistant keeps CMS suggestions when Gemini rejects the advisory', async () => {
 const {load}=environment({}, {
  '@/lib/apiSecurity':{apiAccess:async()=>({id:'officer'})},
  '@/lib/geminiProcessing':{PROCESSING_MODEL:'test',processingAIAvailable:()=>true,processWithAI:async()=>{throw new Error('Gemini processing failed (HTTP 503).');}},
  '@/services/caseAnalysisService':{},
  '@/services/complaintRepository':{readComplaints:async()=>[{id:'sample',incidentDetails:'Sample facts'}]},
  '@/utils/complaintPermissions':{canViewComplaint:()=>({allowed:true})},
  '@/services/savedCaseEvidence':{savedCaseEvidence:async()=>[]},
  '@/services/legalAssistantService':{LegalAssistantService:{analyzeComplaintSync:()=>({suggestedSections:[{sectionNumber:'sample'}]})}},
 });
 const route=load('src/app/api/case-writing/route.ts');
 const response=await route.POST(new Request('http://localhost/api/case-writing',{method:'POST',body:JSON.stringify({caseId:'sample',module:'COMPLAINT',purpose:'legal'})}));
 assert.equal(response.status,200);
 const result=await response.json();
 assert.equal(result.modelUsed,null);
 assert.match(result.report.advisoryWarning,/HTTP 503/);
 assert.equal(result.report.suggestedSections[0].sectionNumber,'sample');
});

test('view-as enters an officer ID with the developer session and never signs a second login',async()=>{
 let logins=0,cookies=0;const tokens=[];let principal=null,effective=null;
 const officer={id:'usr_sho_1',name:'Officer',role:'SHO',stationName:'PS Test'};
 const developer={id:'cms_developer_admin',name:'Developer Admin',role:'SUPER_ADMIN'};
 const {load}=environment({}, {
  'next/server':{NextResponse:{json:(body,options)=>{const r=Response.json(body,options);r.cookies={set(){cookies++;}};return r;}}},
  '@/lib/serverSession':{
    sameOrigin:()=>true,demoEnabled:()=>true,usesDemoSession:()=>false,
    SESSION_DURATION_MS:8*60*60*1000,REMEMBERED_ADMIN_DURATION_MS:7*24*60*60*1000,
    sessionUser:async()=>effective,sessionPrincipal:async()=>principal,
    viewableOfficer:async(id)=>id==='usr_sp_1'?{...officer,id:'usr_sp_1',role:'SP_DISTRICT'}:(id==='usr_sho_1'?officer:null),
    developerAdminUser:()=>developer,
    issueSession:(userId,...rest)=>{tokens.push({userId,viewAs:rest[2]||null});return 'signed';},
    validLogin:async()=>{logins++;return officer;},
  },
 });
 const route=load('src/app/api/auth/session/route.ts');
 const post=body=>route.POST(new Request('http://localhost/api/auth/session',{method:'POST',body:JSON.stringify(body)}));
 // Legacy persona switching stays disabled and never logs anyone in.
 const legacy=await post({switchTo:'usr_sho_1'});
 assert.equal(legacy.status,403);
 assert.match((await legacy.json()).error,/Persona switching is disabled/);
 assert.equal(logins,0);assert.equal(cookies,0);assert.equal(tokens.length,0);
 // A non-developer session cannot enter another ID.
 principal={userId:'usr_dsp_1',demo:true};effective=officer;
 assert.equal((await post({viewAs:'usr_sho_1'})).status,403);
 assert.equal(cookies,0);
 // The developer enters the SHO ID with their own session: no second login, officer stays signed out.
 principal={userId:'cms_developer_admin',demo:false};effective=officer;
 const enter=await post({viewAs:'usr_sho_1'});
 assert.equal(enter.status,200);
 const enterBody=await enter.json();
 assert.equal(enterBody.user.id,'usr_sho_1');
 assert.equal(enterBody.sessionUser.id,'cms_developer_admin');
 assert.equal(enterBody.viewAsActive,true);
 assert.deepEqual(tokens,[{userId:'cms_developer_admin',viewAs:'usr_sho_1'}]);
 assert.equal(logins,0);
 // The SP ID is also viewable with the developer session.
 const sp=await post({viewAs:'usr_sp_1'});
 assert.equal(sp.status,200);assert.equal((await sp.json()).user.id,'usr_sp_1');
 assert.equal(tokens[1].viewAs,'usr_sp_1');
 // Exiting returns the developer's own session and clears the view-as marker.
 const exit=await post({viewAs:null});
 assert.equal(exit.status,200);
 const exitBody=await exit.json();
 assert.equal(exitBody.user.id,'cms_developer_admin');
 assert.equal(exitBody.viewAsActive,false);
 assert.equal(tokens[2].viewAs,null);
 assert.equal(logins,0);
 // The session GET reports the active view and the real session user.
 principal={userId:'cms_developer_admin',demo:false,viewAs:'usr_sho_1'};
 const get=await route.GET(new Request('http://localhost/api/auth/session'));
 const getBody=await get.json();
 assert.equal(getBody.viewAsActive,true);
 assert.equal(getBody.sessionUser.id,'cms_developer_admin');
 assert.equal(getBody.user.id,'usr_sho_1');
 // Without a view-as marker the flag stays off.
 principal={userId:'cms_developer_admin',demo:false};effective=developer;
 const plain=await route.GET(new Request('http://localhost/api/auth/session'));
 assert.equal((await plain.json()).viewAsActive,false);
 // A normal officer login still works with its own cookie and no view-as marker.
 const normal=await post({pno:'HR-04291882',pin:'123456'});
 assert.equal(normal.status,200);assert.equal((await normal.json()).user.id,'usr_sho_1');
 assert.equal(tokens[3].userId,'usr_sho_1');assert.equal(tokens[3].viewAs,null);
 assert.equal(logins,1);assert.equal(cookies,4);
});

test('register visibility: station staff see their whole station, superiors their jurisdiction, IO/EO only their assignments',()=>{
 const permissions=environment().load('src/utils/complaintPermissions.ts');
 const firIntegrity=environment().load('src/lib/firIntegrity.ts');
 const complaint={complaintNumber:'C-1',policeStation:'PS City Panipat',district:'Panipat',assignedEoId:'usr_eo_1'};
 const fir={firNumber:'FIR/0001/2026',policeStation:'PS City Panipat',district:'Panipat',assignedIoId:'usr_eo_1'};
 const sho={id:'sho-x',role:'SHO',stationName:'PS City Panipat',district:'Panipat'};
 const mhc={id:'mhc-x',role:'MHC_GD_INCHARGE',stationName:'PS City Panipat',district:'Panipat'};
 const dsp={id:'dsp-x',role:'DSP_SUBDIV',unitId:'sdpo-1',stationName:'SDPO Office Panipat',district:'Panipat',jurisdictionUnits:['PS City Panipat']};
 const sp={id:'sp-x',role:'SP_DISTRICT',district:'Panipat'};
 const assignedIo={id:'usr_eo_1',role:'ENQUIRY_OFFICER',stationName:'PS City Panipat',district:'Panipat'};
 const otherIo={id:'usr_eo_2',role:'ENQUIRY_OFFICER',stationName:'PS City Panipat',district:'Panipat'};
 // MHC, SHO, DSP (subdivision) and SP (district) each see the station's whole register.
 for(const actor of [sho,mhc,dsp,sp]){
  assert.equal(permissions.canViewComplaint(actor,complaint).allowed,true,actor.role);
  assert.equal(firIntegrity.isFirVisibleToUser(actor,fir),true,actor.role);
 }
 // The assigned IO/EO sees exactly their own case.
 assert.equal(permissions.canViewComplaint(assignedIo,complaint).allowed,true,'assigned EO');
 assert.equal(firIntegrity.isFirVisibleToUser(assignedIo,fir),true,'assigned IO');
 // A different IO/EO of the SAME station sees nothing — not the station list, not others' cases.
 assert.equal(permissions.canViewComplaint(otherIo,complaint).allowed,false,'other EO');
 assert.equal(firIntegrity.isFirVisibleToUser(otherIo,fir),false,'other IO');
 // The Duty Officer is assignment-scoped too: their assigned case is visible, the station list is not.
 const duty={id:'usr_do_1',role:'DUTY_OFFICER',stationName:'PS City Panipat',district:'Panipat'};
 assert.equal(permissions.canViewComplaint(duty,{...complaint,assignedEoId:'usr_do_1'}).allowed,true,'assigned DO');
 assert.equal(permissions.canViewComplaint(duty,complaint).allowed,false,'unassigned DO');
 assert.equal(firIntegrity.isFirVisibleToUser(duty,{...fir,assignedIoId:'usr_do_1'}),true,'assigned DO FIR');
 assert.equal(firIntegrity.isFirVisibleToUser(duty,fir),false,'unassigned DO FIR');
 // Unassigned records are invisible to IO/EO even in their own station.
 assert.equal(permissions.canViewComplaint(assignedIo,{...complaint,assignedEoId:'usr_eo_2'}).allowed,false,'reassigned EO');
 assert.equal(firIntegrity.isFirVisibleToUser(assignedIo,{...fir,assignedIoId:'usr_eo_2'}),false,'reassigned IO');
 // Station staff and superiors never leak outside their jurisdiction.
 assert.equal(permissions.canViewComplaint(sho,{...complaint,policeStation:'PS Chandni Bagh Panipat'}).allowed,false,'SHO other station');
 assert.equal(firIntegrity.isFirVisibleToUser(sho,{...fir,policeStation:'PS Chandni Bagh Panipat'}),false,'SHO other station FIR');
 assert.equal(permissions.canViewComplaint(sp,{...complaint,district:'Karnal'}).allowed,false,'SP other district');
 assert.equal(firIntegrity.isFirVisibleToUser(sp,{...fir,district:'Karnal'}),false,'SP other district FIR');
 assert.equal(permissions.canViewComplaint(dsp,{...complaint,policeStation:'PS Samalkha Panipat'}).allowed,false,'DSP outside subdivision');
 assert.equal(firIntegrity.isFirVisibleToUser(dsp,{...fir,policeStation:'PS Samalkha Panipat'}),false,'DSP outside subdivision FIR');
});
