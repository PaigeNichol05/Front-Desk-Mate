import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { once } from 'node:events';
import { createHash } from 'node:crypto';

async function start(t, extra={}) {
  const dir=mkdtempSync(join(tmpdir(),'audio-http-'));
  const child=spawn(process.execPath,['src/server.js'],{env:{...process.env,NODE_ENV:'development',SESSION_SECRET:'integration-test-only-secret-with-32-characters',SEED_DEMO:'true',FICTIONAL_AUDIO_DEMO:'true',DATABASE_PATH:join(dir,'db.sqlite'),UPLOAD_DIR:join(dir,'uploads'),AUDIO_DIR:join(dir,'audio'),HOST:'127.0.0.1',PORT:'0',...extra},stdio:['ignore','pipe','pipe']});
  t.after(async()=>{if(child.exitCode===null){child.kill();await once(child,'exit')}rmSync(dir,{recursive:true,force:true})});
  let output='',err='';child.stderr.on('data',d=>{err+=d});
  const url=await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(new Error('server startup timed out: '+err)),10000);child.once('exit',()=>{clearTimeout(timer);reject(new Error(err))});child.stdout.on('data',d=>{output+=d;const m=/http:\/\/127\.0\.0\.1:\d+/.exec(output);if(m){clearTimeout(timer);resolve(m[0])}})});
  const request=async(path,{user,method='GET',body,csrf=true}={})=>{
    const headers={};if(user){headers.Cookie=user.cookie;if(csrf)headers['X-CSRF-Token']=user.csrf}if(body!==undefined)headers['Content-Type']='application/json';
    return fetch(url+path,{method,headers,body:body===undefined?undefined:JSON.stringify(body)});
  };
  async function login(email){const r=await request('/api/login',{method:'POST',body:{email,password:'DemoOnly!ChangeMe123'}});assert.equal(r.status,200);return {cookie:r.headers.get('set-cookie').split(';')[0],...(await r.json())}}
  return {request,login,url};
}
test('HTTP workflow enforces sessions, CSRF, private media and role/approval boundaries',async t=>{
  const {request,login}=await start(t),doctor=await login('doctor@example.test'),patient=await login('patient@example.test'),biller=await login('biller@example.test');
  assert.equal((await request('/api/encounters/enc-001/audio')).status,401);
  assert.equal((await request('/api/encounters/enc-001/audio',{method:'POST',user:doctor,csrf:false,body:{fictional:true}})).status,403);
  assert.equal((await request('/api/encounters/enc-001/audio',{user:biller})).status,403);
  const config=await (await request('/api/audio/config',{user:patient})).json();assert(config.enabled);
  const created=await request('/api/encounters/enc-001/audio',{user:doctor,method:'POST',body:{fictional:true}});assert.equal(created.status,201);const {id}=await created.json();
  for(const user of [patient,doctor])assert.equal((await request(`/api/audio/${id}/consent`,{user,method:'POST',body:{decision:'AGREED',statement_version:config.statement_version}})).status,200);
  for(const action of ['start','complete'])assert.equal((await request(`/api/audio/${id}/${action}`,{user:doctor,method:'POST',body:{}})).status,200);
  assert.equal((await request(`/api/audio/${id}/content`,{user:patient})).status,403);
  assert.equal((await request(`/api/audio/${id}/publish`,{user:doctor,method:'POST',body:{}})).status,409);
  assert.equal((await request(`/api/audio/${id}/approve`,{user:patient,method:'POST',body:{}})).status,403);
  for(const action of ['approve','publish'])assert.equal((await request(`/api/audio/${id}/${action}`,{user:doctor,method:'POST',body:{}})).status,200);
  const media=await request(`/api/audio/${id}/content`,{user:patient});assert.equal(media.status,200);assert.equal(media.headers.get('content-type'),'audio/wav');assert.equal(media.headers.get('cache-control'),'no-store');const bytes=Buffer.from(await media.arrayBuffer());assert.equal(bytes.subarray(0,4).toString(),'RIFF');
  const metadata=await (await request('/api/encounters/enc-001/audio',{user:patient})).json();assert.equal(metadata[0].storage_key,undefined);assert.equal(createHash('sha256').update(bytes).digest('hex'),metadata[0].sha256);
  const download=await request(`/api/audio/${id}/content?download=1`,{user:patient});assert.match(download.headers.get('content-disposition'),/^attachment/);await download.arrayBuffer();
  assert.equal((await request(`/api/audio/${id}/content`,{user:biller})).status,403);
  assert.equal((await request(`/api/audio/${id}/content`,{user:doctor,method:'POST',body:{}})).status,405);
  assert.equal((await request('/data/private-audio/'+id,{user:doctor})).status,404);
  assert.equal((await request('/audio.js')).status,200);
  const events=await (await request(`/api/audio/${id}/events`,{user:doctor})).json();assert(events.some(e=>e.action==='AUDIO_DOWNLOAD'));assert(events.some(e=>e.action==='AUDIO_PLAYBACK'));
  assert.equal((await request(`/api/audio/${id}/consent`,{user:patient,method:'POST',body:{decision:'WITHDRAWN',statement_version:config.statement_version}})).status,200);
  assert.equal((await request(`/api/audio/${id}/content`,{user:patient})).status,409);
});
test('HTTP feature is disabled unless explicitly enabled',async t=>{
  const {request,login}=await start(t,{FICTIONAL_AUDIO_DEMO:'false'}),doctor=await login('doctor@example.test');
  assert.equal((await (await request('/api/audio/config',{user:doctor})).json()).enabled,false);
  assert.equal((await request('/api/encounters/enc-001/audio',{user:doctor,method:'POST',body:{fictional:true}})).status,403);
});
test('neither UI invokes microphone or external speech recognition; deployment stays concept-only',()=>{
  for(const path of ['demo/app.js','public/audio.js','src/audio.js'])assert.doesNotMatch(readFileSync(path,'utf8'),/getUserMedia\s*\(|new\s+(?:MediaRecorder|SpeechRecognition)|new\s+Recognition\s*\(/);
  assert.match(readFileSync('railway.json','utf8'),/demo:host/);
  assert.match(readFileSync('public/app.js','utf8'),/mountAudio/);
});
