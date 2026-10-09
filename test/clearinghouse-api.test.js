import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { once } from 'node:events';
import { openDb } from '../src/db.js';

async function start(t,extra={}) {
  const dir=mkdtempSync(join(tmpdir(),'clearinghouse-http-')),dbPath=join(dir,'db.sqlite');
  const child=spawn(process.execPath,['src/server.js'],{env:{...process.env,NODE_ENV:'development',SESSION_SECRET:'integration-test-secret-with-at-least-32-characters',SEED_DEMO:'true',FICTIONAL_CLEARINGHOUSE_DEMO:'true',LIVE_CLEARINGHOUSE_ENABLED:'false',DATABASE_PATH:dbPath,UPLOAD_DIR:join(dir,'uploads'),HOST:'127.0.0.1',PORT:'0',...extra},stdio:['ignore','pipe','pipe']});
  t.after(async()=>{if(child.exitCode===null){child.kill();await once(child,'exit')}rmSync(dir,{recursive:true,force:true})});
  let output='',errors='';child.stderr.on('data',d=>errors+=d);
  const url=await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('Startup timeout: '+errors)),10000);child.once('exit',()=>{clearTimeout(timer);reject(Error(errors))});child.stdout.on('data',d=>{output+=d;const m=/http:\/\/127\.0\.0\.1:\d+/.exec(output);if(m){clearTimeout(timer);resolve(m[0])}})});
  async function request(path,{user,method='GET',body,csrf=true}={}) {
    const headers={};if(user){headers.Cookie=user.cookie;if(csrf)headers['X-CSRF-Token']=user.csrf}if(body!==undefined)headers['Content-Type']='application/json';
    return fetch(url+path,{method,headers,body:body===undefined?undefined:JSON.stringify(body)});
  }
  async function login(email){const r=await request('/api/login',{method:'POST',body:{email,password:'DemoOnly!ChangeMe123'}});assert.equal(r.status,200);return {cookie:r.headers.get('set-cookie').split(';')[0],...await r.json()}}
  return {request,login,dbPath};
}
async function makeClaim({request,login}) {
  const doctor=await login('doctor@example.test');
  for(const kind of ['ASSESSMENT','PLAN'])assert.equal((await request('/api/encounters/enc-001/sections',{user:doctor,method:'POST',body:{kind,content:'Fictional documentation'}})).status,201);
  assert.equal((await request('/api/encounters/enc-001/sign',{user:doctor,method:'POST',body:{}})).status,200);
  const r=await request('/api/encounters/enc-001/checkout',{user:doctor,method:'POST',body:{lines:[{procedure_system:'CPT',procedure_code:'99213',diagnosis_code:'M54.50',units:1,charge_cents:15000}]}});
  assert.equal(r.status,201);return {claim:await r.json(),doctor};
}
test('HTTP simulation requires session, active billing role, CSRF and organization; no public response endpoint exists',async t=>{
  const s=await start(t),{claim,doctor}=await makeClaim(s),biller=await s.login('biller@example.test'),patient=await s.login('patient@example.test');
  const path=`/api/claims/${claim.id}`;
  assert.equal((await s.request(path+'/transmissions')).status,401);
  for(const user of [patient,doctor])for(const action of ['transmissions','simulate','process-simulation','correct-simulation'])assert.equal((await s.request(path+'/'+action,{user,method:action==='transmissions'?'GET':'POST',body:action==='transmissions'?undefined:{}})).status,403);
  assert.equal((await s.request(path+'/simulate',{user:biller,method:'POST',csrf:false,body:{scenario:'PAID'}})).status,403);
  const db=openDb(s.dbPath),hash=db.prepare('SELECT password_hash FROM users WHERE id=?').get('biller-001').password_hash;
  db.prepare('INSERT INTO organizations VALUES (?,?)').run('other','Other');db.prepare('INSERT INTO users (id,org_id,email,name,role,password_hash) VALUES (?,?,?,?,?,?)').run('other','other','other@example.test','Other','BILLER',hash);db.close();
  const other=await s.login('other@example.test');assert.equal((await s.request(path+'/transmissions',{user:other})).status,404);
  assert.equal((await s.request(path+'/simulate',{user:other,method:'POST',body:{scenario:'PAID'}})).status,404);
  assert.deepEqual(await (await s.request('/api/claims',{user:other})).json(),[]);
  assert.equal((await s.request('/api/clearinghouse/responses',{user:biller,method:'POST',body:{simulated:false}})).status,404);
  assert.equal((await s.request(path+'/simulate',{user:biller,method:'POST',body:{scenario:'PAID'}})).status,200);
  assert.equal((await s.request(path+'/process-simulation',{user:biller,method:'POST'})).status,200);
  const view=await (await s.request(path+'/transmissions',{user:biller})).json();assert.equal(view.live_transmission_enabled,false);assert.equal(view.transmissions[0].status,'SIMULATED_PAID');
  const claims=await (await s.request('/api/claims',{user:biller})).json();assert.equal(claims[0].transmission.status,'SIMULATED_PAID');assert.equal(claims[0].status,'AWAITING_CONNECTOR');
  const patientClaims=await (await s.request('/api/claims',{user:patient})).json();assert.equal(patientClaims[0].status,'PRACTICE_PROCESSING');assert.equal(patientClaims[0].transmission,undefined);
  assert.deepEqual(await (await s.request(path+'/payments',{user:patient})).json(),[]);
  assert.equal((await s.request('/clearinghouse.js')).status,200);
});
test('HTTP default remains disabled and queued',async t=>{
  const s=await start(t,{FICTIONAL_CLEARINGHOUSE_DEMO:'false'}),{claim}=await makeClaim(s),biller=await s.login('biller@example.test');
  const config=await (await s.request('/api/billing/connector',{user:biller})).json();assert.equal(config.simulation_enabled,false);assert.equal(config.live_transmission_enabled,false);
  assert.equal((await s.request(`/api/claims/${claim.id}/simulate`,{user:biller,method:'POST',body:{scenario:'PAID'}})).status,403);
  const view=await (await s.request(`/api/claims/${claim.id}/transmissions`,{user:biller})).json();assert.equal(view.transmissions[0].status,'QUEUED');
});
test('HTTP correction is reviewed, versioned and idempotent; response history stays separate',async t=>{
  const s=await start(t),{claim}=await makeClaim(s),biller=await s.login('biller@example.test'),path=`/api/claims/${claim.id}`;
  await s.request(path+'/simulate',{user:biller,method:'POST',body:{scenario:'REJECTED'}});await s.request(path+'/process-simulation',{user:biller,method:'POST'});
  for(const bad of [null,[],42])assert.equal((await s.request(path+'/correct-simulation',{user:biller,method:'POST',body:bad})).status,400);
  const correction={lines:[{procedure_system:'CPT',procedure_code:'99213',diagnosis_code:'M54.50',units:2,charge_cents:15000}],reason:'Review fictional units',reviewed:true,request_key:'http-correction-1'};
  assert.equal((await s.request(path+'/correct-simulation',{user:biller,method:'POST',body:{...correction,reviewed:false}})).status,400);
  assert.equal((await s.request(path+'/correct-simulation',{user:biller,method:'POST',body:correction})).status,201);
  const duplicate=await (await s.request(path+'/correct-simulation',{user:biller,method:'POST',body:correction})).json();assert.equal(duplicate.duplicate,true);
  await s.request(path+'/process-simulation',{user:biller,method:'POST'});const view=await (await s.request(path+'/transmissions',{user:biller})).json();
  assert.equal(view.transmissions.length,2);assert.equal(view.transmissions[0].status,'SIMULATED_PAID');assert.equal(view.transmissions[1].status,'SIMULATED_REJECTED');
  assert.deepEqual(await (await s.request(path+'/denials',{user:biller})).json(),[]);
});
test('production simulation, unseeded simulation, and attempted live enablement fail startup',async()=>{
  for(const extra of [{NODE_ENV:'production',SEED_DEMO:'false',FICTIONAL_CLEARINGHOUSE_DEMO:'true'},{SEED_DEMO:'false',FICTIONAL_CLEARINGHOUSE_DEMO:'true'},{FICTIONAL_CLEARINGHOUSE_DEMO:'false',LIVE_CLEARINGHOUSE_ENABLED:'true'}]){
    const dir=mkdtempSync(join(tmpdir(),'clearinghouse-startup-'));
    try{const child=spawn(process.execPath,['src/server.js'],{env:{...process.env,NODE_ENV:'development',SEED_DEMO:'false',FICTIONAL_AUDIO_DEMO:'false',SESSION_SECRET:'test-only-secret-with-at-least-32-characters',DATABASE_PATH:join(dir,'db.sqlite'),UPLOAD_DIR:join(dir,'uploads'),PORT:'0',...extra},stdio:['ignore','pipe','pipe']});
      let error='';child.stderr.on('data',d=>error+=d);const [code]=await once(child,'exit');assert.notEqual(code,0);assert.match(error,/Fictional clearinghouse requires|Real clearinghouse transmission is disabled/);
    }finally{rmSync(dir,{recursive:true,force:true})}
  }
});

test('code and coverage HTTP controls require staff session, organization access and CSRF',async t=>{
 const s=await start(t),biller=await s.login('biller@example.test'),doctor=await s.login('doctor@example.test'),patient=await s.login('patient@example.test');
 const codePath='/api/billing/codes?system=HCPCS&q=J3301&service_date=2026-10-09';
 assert.equal((await s.request(codePath)).status,401);assert.equal((await s.request(codePath,{user:patient})).status,403);assert.equal((await s.request(codePath,{user:doctor})).status,200);
 const c={encounter_id:'enc-001',plan_reference:'Fictional plan',procedure_system:'HCPCS',procedure_code:'J3301',diagnosis_code:'M54.50',modifier:'',units:1,place_of_service:'11'};
 const path='/api/billing/coverage?'+new URLSearchParams(c);assert.equal((await s.request(path,{user:patient})).status,403);assert.equal((await (await s.request(path,{user:biller})).json()).status,'NOT_VERIFIED');
 const evidence={reviewed:true,source_kind:'PLAN_DOCUMENT',source_reference:'Fictional fixture only',status:'CONDITIONAL',checked_on:new Date().toISOString().slice(0,10),expires_on:new Date().toISOString().slice(0,10),eligibility:'UNKNOWN',network:'UNKNOWN',provider_enrollment:'UNKNOWN',requirements:'Unknown',cost_sharing:'Unknown'};
 assert.equal((await s.request('/api/billing/coverage',{user:biller,method:'POST',csrf:false,body:{...c,evidence}})).status,403);
 assert.equal((await s.request('/api/billing/coverage',{user:doctor,method:'POST',body:{...c,evidence}})).status,403);
 assert.equal((await s.request('/api/billing/coverage',{user:biller,method:'POST',body:{...c,evidence}})).status,201);
 assert.equal((await (await s.request(path,{user:biller})).json()).status,'POLICY_ONLY');
 assert.equal((await s.request('/api/billing/codes/import',{user:biller,method:'POST',body:{}})).status,403);
 assert.equal((await s.request('/code-coverage.js')).status,200);
});
