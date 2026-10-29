import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtempSync, rmSync, writeFileSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openDb } from '../src/db.js';
import { configurePreview, PREVIEW_DATE } from '../src/preview.js';

const flags=dir=>({NODE_ENV:'development',FICTIONAL_PREVIEW:'true',PREVIEW_HOSTED:'false',PREVIEW_DATA_DIR:dir,SESSION_SECRET:'fixture-secret-with-more-than-forty-eight-characters-long',SEED_DEMO:'true',FICTIONAL_AUDIO_DEMO:'false',FICTIONAL_CLEARINGHOUSE_DEMO:'true',LIVE_CLEARINGHOUSE_ENABLED:'false',PAYER_ADAPTER:'none',COOKIE_SECURE:'false',DATABASE_PATH:join(dir,'clinic.db'),UPLOAD_DIR:join(dir,'uploads'),AUDIO_DIR:join(dir,'private-audio'),HOST:'127.0.0.1',PORT:'0'});
test('preview fails closed for unsafe flags, public binding, existing data and missing gate',t=>{
 const dir=mkdtempSync(join(tmpdir(),'fdm-isolation-'));t.after(()=>rmSync(dir,{recursive:true,force:true}));
 const env=flags(dir);
 for(const delta of [{NODE_ENV:'production'},{PAYER_ADAPTER:'real'},{LIVE_CLEARINGHOUSE_ENABLED:'true'},{FICTIONAL_AUDIO_DEMO:'true'},{HOST:'0.0.0.0'},{DATABASE_PATH:join(tmpdir(),'other.db')},{PREVIEW_HOSTED:'true',COOKIE_SECURE:'true'}])assert.throws(()=>configurePreview({...env,...delta}));
 assert.equal(configurePreview(env).enabled,true);
 const other=mkdtempSync(join(tmpdir(),'fdm-existing-'));t.after(()=>rmSync(other,{recursive:true,force:true}));writeFileSync(join(other,'existing.txt'),'must not be adopted');assert.throws(()=>configurePreview(flags(other)),/nonempty/);
 symlinkSync(join(other,'existing.txt'),join(dir,'clinic.db'));assert.throws(()=>configurePreview(env),/symlinks/);
});

async function start(t,{hosted=false,dir}={}){
 const dataDir=dir||mkdtempSync(join(tmpdir(),'fdm-preview-http-'));
 const env={...process.env,...flags(dataDir),...(hosted?{PREVIEW_HOSTED:'true',COOKIE_SECURE:'true',PREVIEW_ACCESS_USER:'reviewer',PREVIEW_ACCESS_PASSWORD:'test-only-random-gate-password-12345'}:{})};
 const child=spawn(process.execPath,['src/server.js'],{env,stdio:['ignore','pipe','pipe']});
 let errors='',output='';child.stderr.on('data',d=>errors+=d);
 const stop=async()=>{if(child.exitCode===null&&child.signalCode===null){child.kill();await once(child,'exit')}};
 t.after(async()=>{await stop();if(!dir)rmSync(dataDir,{recursive:true,force:true})});
 const url=await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('Preview startup timeout '+errors)),10000);child.on('exit',()=>{clearTimeout(timer);reject(Error(errors))});child.stdout.on('data',d=>{output+=d;const m=/http:\/\/127\.0\.0\.1:\d+/.exec(output);if(m){clearTimeout(timer);resolve(m[0])}})});
 const gate='Basic '+Buffer.from('reviewer:test-only-random-gate-password-12345').toString('base64');
 async function request(path,{user,method='GET',body,csrf=true,access=hosted,authorization}={}){const headers={};if(access)headers.Authorization=authorization||gate;if(user){headers.Cookie=user.cookie;if(csrf)headers['X-CSRF-Token']=user.csrf}if(body!==undefined)headers['Content-Type']='application/json';return fetch(url+path,{method,headers,body:body===undefined?undefined:JSON.stringify(body)})}
 async function login(role){const r=await request('/api/login',{method:'POST',body:{email:role+'@example.test',password:'DemoOnly!ChangeMe123'}});assert.equal(r.status,200);return {cookie:r.headers.get('set-cookie').split(';')[0],cookieHeader:r.headers.get('set-cookie'),...await r.json()}}
 return {request,login,stop,dataDir};
}
test('hosted gate covers app/assets/APIs before login, preserves health and secure sessions',async t=>{
 const s=await start(t,{hosted:true});
 for(const path of ['/','/app.js','/preview.js','/api/preview','/api/login']){const r=await s.request(path,{access:false});assert.equal(r.status,401);assert.match(r.headers.get('www-authenticate'),/Basic/)}
 assert.equal((await s.request('/',{authorization:'Basic '+Buffer.from('reviewer:wrong').toString('base64')})).status,401);
 assert.equal((await s.request('/health',{access:false})).status,200);
 assert.equal((await s.request('/api/preview')).status,401); // gate is not app identity
 const doctor=await s.login('doctor');assert.match(doctor.cookieHeader,/Secure/);assert.match(doctor.cookieHeader,/HttpOnly/);assert.match(doctor.cookieHeader,/SameSite=Strict/);
 assert.equal((await s.request('/api/preview',{user:doctor})).status,200);
});
test('fictional workflow covers source review, coverage, checkout, simulation, privacy and restart',async t=>{
 const s=await start(t),doctor=await s.login('doctor'),biller=await s.login('biller'),patient=await s.login('patient');
 const get=async(path,user=doctor)=>{const r=await s.request(path,{user});assert.equal(r.status,200);return r.json()};
 const post=async(path,body,user=doctor)=>{const r=await s.request(path,{user,method:'POST',body});assert.ok(r.ok,await r.clone().text());return r.json()};
 const scopedDb=openDb(join(s.dataDir,'clinic.db'));
 scopedDb.prepare("INSERT INTO users (id,org_id,email,name,role,password_hash) SELECT 'other-doctor','demo-clinic','other-doctor@example.test','Other Fictional Doctor','PHYSICIAN',password_hash FROM users WHERE id='doctor-001'").run();scopedDb.close();
 const otherDoctor=await s.login('other-doctor');
 assert.equal((await s.request('/api/encounters/enc-001/sections',{user:otherDoctor,method:'POST',body:{kind:'PLAN',content:'unassigned attempt'}})).status,403);
 const info=await get('/api/preview');assert.equal(info.scenarios.length,3);assert.equal(info.pr3_included,false);assert.equal(info.live_transmission_enabled,false);assert.equal(info.device_ingestion_enabled,false);
 const services=await get('/api/encounters/enc-001/services');assert.equal(services.services[0].catalog_candidates[0].code,'J3301');assert.deepEqual(services.services[0].gaps,[]);
 const toxin=await get('/api/encounters/enc-preview-toxin/services');assert.deepEqual(toxin.services[0].gaps,[]);assert.equal(toxin.services[0].toxin_summary.administered_units,150);assert.equal(toxin.services[0].toxin_summary.discarded_units,50);assert.equal(toxin.services[0].details.toxin.product.brand,'BOTOX');
 const ordered=await get('/api/encounters/enc-preview-order/services');assert.equal(ordered.services[0].state,'ORDERED');assert.equal(ordered.services[0].billing_review_allowed,false);
 const context={encounter_id:'enc-001',plan_reference:'FICTIONAL-PLAN-001',procedure_system:'HCPCS',procedure_code:'J3301',diagnosis_code:'M54.50',units:4,place_of_service:'11'};
 assert.equal((await get('/api/billing/coverage?'+new URLSearchParams(context),biller)).status,'NOT_VERIFIED');
 await post('/api/billing/coverage',{...context,evidence:{reviewed:true,source_kind:'PLAN_DOCUMENT',source_reference:'FICTIONAL-DOCUMENT-001',status:'CONDITIONAL',checked_on:new Date().toISOString().slice(0,10),expires_on:'2099-01-01',eligibility:'UNKNOWN',network:'UNKNOWN',provider_enrollment:'UNKNOWN',requirements:'Fictional only; authorization unknown',cost_sharing:'Unknown'}},biller);
 const coverage=await get('/api/billing/coverage?'+new URLSearchParams(context),biller);assert.equal(coverage.status,'POLICY_ONLY');assert.equal(coverage.authenticated_insurer_response,false);
 const reviewPath='/api/encounters/enc-001/coding-review',review={service_id:services.services[0].id,procedure_system:'HCPCS',procedure_code:'J3301',diagnosis_code:'M54.50',units:4,rationale:'Fictional four 10 mg billing units for source-linked 40 mg record; no recommendation',reviewed:true};
 assert.equal((await s.request(reviewPath,{user:biller,method:'POST',body:review})).status,409); // sign first
 assert.equal((await s.request('/api/encounters/enc-001/sign',{user:doctor,method:'POST',csrf:false,body:{}})).status,403);
 await post('/api/encounters/enc-001/sign',{});
 const reviewed=await post(reviewPath,review,biller);
 const claim=await post('/api/encounters/enc-001/checkout',{lines:[{...reviewed.line,charge_cents:100}]});assert.equal(claim.status,'AWAITING_CONNECTOR');assert.equal(claim.total_cents,400);
 for(const role of [patient,biller])assert.equal((await s.request('/api/encounters/enc-001/sections',{user:role,method:'POST',body:{kind:'PLAN',content:'attempt'}})).status,403);
 assert.equal((await s.request('/api/files',{user:patient,method:'POST',body:{}})).status,403);
 assert.equal((await s.request('/api/encounters?patientId=patient-preview-other',{user:patient})).status,403);
 assert.equal((await get('/api/patients',patient)).length,1);
 await post('/api/claims/'+claim.id+'/simulate',{scenario:'DENIED'},biller);await post('/api/claims/'+claim.id+'/process-simulation',{},biller);
 const simulation=await get('/api/claims/'+claim.id+'/transmissions',biller);assert.equal(simulation.transmissions[0].status,'SIMULATED_DENIED');assert.equal(simulation.live_transmission_enabled,false);
 assert.equal((await s.request('/api/claims/'+claim.id+'/transmissions',{user:patient})).status,403);
 const patientClaim=(await get('/api/claims',patient))[0];assert.equal(patientClaim.status,'PRACTICE_PROCESSING');assert.equal(patientClaim.transmission,undefined);
 await s.stop();const restarted=await start(t,{dir:s.dataDir});
 const newDoctor=await restarted.login('doctor');assert.equal((await (await restarted.request('/api/preview',{user:newDoctor})).json()).scenarios[0].status,'CHECKED_OUT');
 assert.equal((await restarted.request('/api/preview',{user:doctor})).status,401); // sessions do not survive restart
 assert.equal((await (await restarted.request('/api/encounters',{user:newDoctor})).json()).length,3);
 assert.equal(PREVIEW_DATE,'2026-10-09');
});
