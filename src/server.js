import { searchCodes, importLicensedCodes, recordCoverage, coverageView } from './code-coverage.js';
import http from 'node:http';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve, join, basename } from 'node:path';
import { randomBytes, timingSafeEqual, scryptSync, createHmac } from 'node:crypto';
import { openDb, seed, uid, now, audit } from './db.js';
import { checkout, documentationChecks } from './billing.js';
import { createClearinghouseService, backfillQueuedClaims } from './clearinghouse.js';
import { createAudioService } from './audio.js';

const root=resolve(import.meta.dirname,'..');
const db=openDb(resolve(root,process.env.DATABASE_PATH||'data/clinic.db'));
const dev=process.env.NODE_ENV!=='production';
const secureCookies=!dev||process.env.COOKIE_SECURE==='true';
if(process.env.SEED_DEMO==='true') {
  if(!dev) throw new Error('Demo seeding is forbidden in production');
  seed(db);
}
const secret=process.env.SESSION_SECRET;
if(!secret || secret.length<32) throw new Error('Set SESSION_SECRET to at least 32 characters');
const uploadDir=resolve(root,process.env.UPLOAD_DIR||'uploads');
mkdirSync(uploadDir,{recursive:true});
const port=Number(process.env.PORT||3000), host=process.env.HOST||(dev?'127.0.0.1':'0.0.0.0');
if(process.env.FICTIONAL_AUDIO_DEMO==='true' && (!dev || process.env.SEED_DEMO!=='true')) throw new Error('Synthetic audio requires nonproduction and SEED_DEMO=true');
const audioDir=resolve(root,process.env.AUDIO_DIR||'data/private-audio');
for(const publicDir of [join(root,'public'),join(root,'demo')]) if(audioDir===publicDir || audioDir.startsWith(publicDir+'/')) throw new Error('Audio storage must be outside served assets');
const audio=createAudioService(db,audioDir,{enabled:dev && process.env.SEED_DEMO==='true' && process.env.FICTIONAL_AUDIO_DEMO==='true'});
if(process.env.FICTIONAL_AUDIO_DEMO==='true') { audio.sweep(); setInterval(()=>{try{audio.sweep()}catch(e){console.error('Synthetic audio maintenance failed',e.message)}},30000).unref(); }
if(process.env.FICTIONAL_CLEARINGHOUSE_DEMO==='true' && (!dev || process.env.SEED_DEMO!=='true')) throw new Error('Fictional clearinghouse requires nonproduction and SEED_DEMO=true');
if(process.env.LIVE_CLEARINGHOUSE_ENABLED==='true') throw new Error('Real clearinghouse transmission is disabled');
backfillQueuedClaims(db);
const clearinghouse=createClearinghouseService(db,{enabled:dev && process.env.SEED_DEMO==='true' && process.env.FICTIONAL_CLEARINGHOUSE_DEMO==='true'});
// Explicit demo configuration is durable; recover expired leases after process restarts.
if(process.env.FICTIONAL_CLEARINGHOUSE_DEMO==='true') {
  let workerRunning=false;
  setInterval(async()=>{if(workerRunning)return;workerRunning=true;try{await clearinghouse.processOne('demo-clinic')}catch{console.error('Fictional clearinghouse maintenance failed')}finally{workerRunning=false}},1000).unref();
}
const sessions=new Map(); // Local demo only; production requires shared durable session storage.
const json=(res,status,data)=>{res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer','Content-Security-Policy':"default-src 'self'; img-src 'self' blob:; media-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'"});res.end(JSON.stringify(data));};
const fail=(status,message,details)=>Object.assign(new Error(message),{status,details});
function body(req,max=1000000){return new Promise((resolveBody,reject)=>{let parts=[],size=0;req.on('data',c=>{size+=c.length;if(size>max){reject(fail(413,'Request too large'));req.destroy();}else parts.push(c)});req.on('end',()=>{try{resolveBody(JSON.parse(Buffer.concat(parts).toString()||'{}'))}catch{reject(fail(400,'Invalid JSON'))}});req.on('error',reject)});}
function session(req){const token=/\bclinic_session=([^;]+)/.exec(req.headers.cookie||'')?.[1];if(!token)return null;const key=createHmac('sha256',secret).update(token).digest('hex');const s=sessions.get(key);if(!s||s.expires<Date.now()){sessions.delete(key);return null}return s;}
function requireUser(req,roles){const s=session(req);if(!s)throw fail(401,'Sign in required');const user=db.prepare('SELECT id,org_id,patient_id,email,name,role FROM users WHERE id=? AND active=1').get(s.userId);if(!user||roles&&!roles.includes(user.role))throw fail(403,'Access denied');if(req.method!=='GET'&&req.headers['x-csrf-token']!==s.csrf)throw fail(403,'Invalid request token');return user;}
function patientAccess(user,id){if(user.role==='PATIENT'&&user.patient_id!==id)throw fail(403,'Access denied');const p=db.prepare('SELECT * FROM patients WHERE id=? AND org_id=?').get(id,user.org_id);if(!p)throw fail(404,'Patient not found');return p;}
const pick=(obj,keys)=>Object.fromEntries(keys.map(k=>[k,obj[k]]));
function requireFields(obj,keys){if(keys.some(k=>typeof obj[k]!=='string'||!obj[k].trim()))throw fail(400,`Required: ${keys.join(', ')}`);}
async function api(req,res,url){
  const path=url.pathname;
  if(path==='/api/login'&&req.method==='POST'){
    const b=await body(req);const u=db.prepare('SELECT * FROM users WHERE email=? AND active=1').get(String(b.email||'').toLowerCase());
    const [salt,hash]=(u?.password_hash||'').split(':');let match=false;
    if(salt&&hash){const a=Buffer.from(hash,'hex'),c=scryptSync(String(b.password||''),salt,64);match=a.length===c.length&&timingSafeEqual(a,c)}
    if(!match)throw fail(401,'Invalid credentials');
    const token=randomBytes(32).toString('hex'),key=createHmac('sha256',secret).update(token).digest('hex');
    const csrf=randomBytes(24).toString('hex');sessions.set(key,{userId:u.id,csrf,expires:Date.now()+8*3600000});
    res.setHeader('Set-Cookie',`clinic_session=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=28800${secureCookies?'; Secure':''}`);
    return json(res,200,{user:pick(u,['id','name','role']),csrf});
  }
  if(path==='/api/session'&&req.method==='GET') {const u=requireUser(req);return json(res,200,{user:pick(u,['id','name','role']),csrf:session(req).csrf});}
  const u=requireUser(req);
  if(path==='/api/audio/config' && req.method==='GET') return json(res,200,{enabled:dev && process.env.SEED_DEMO==='true' && process.env.FICTIONAL_AUDIO_DEMO==='true',source:'SYNTHETIC_TONE_V1',statement_version:'FICTIONAL_AUDIO_V1',statement:'I agree to a fictional generated-tone demonstration, with no microphone capture. Both sample participants must agree. The assigned physician reviews and releases the tone to the sample patient portal. Either participant can refuse or withdraw; this removes access and requests deletion. Audio expires after seven days. This is simulated consent, not consent for a real visit.'});
  const ae=/^\/api\/encounters\/([^/]+)\/audio$/.exec(path);
  if(ae){if(req.method==='GET')return json(res,200,audio.list(u,ae[1]));if(req.method==='POST')return json(res,201,audio.create(u,ae[1],await body(req,4096)));throw fail(405,'Method not allowed');}
  const ar=/^\/api\/audio\/([^/]+)\/(consent|start|complete|stop|approve|publish|content|events)$/.exec(path);
  if(ar){
    const [,id,action]=ar;
    if(action==='content' && req.method==='GET') {const download=url.searchParams.get('download')==='1';const f=audio.read(u,id,download);res.writeHead(200,{'Content-Type':f.mime,'Content-Length':f.data.length,'Content-Disposition':`${download?'attachment':'inline'}; filename="fictional-tone.wav"`,'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Content-Security-Policy':"default-src 'none'; sandbox"});return res.end(f.data);}
    if(action==='events' && req.method==='GET')return json(res,200,audio.events(u,id));
    if(['consent','start','complete','stop','approve','publish'].includes(action) && req.method==='POST'){const b=await body(req,4096);return json(res,200,action==='consent'?audio.consent(u,id,b):audio.action(u,id,action,b));}
    throw fail(405,'Method not allowed');
  }
  const ad=/^\/api\/audio\/([^/]+)$/.exec(path);if(ad){if(req.method==='DELETE')return json(res,200,audio.action(u,ad[1],'delete'));throw fail(405,'Method not allowed');}
  if(path==='/api/logout'&&req.method==='POST'){const token=/\bclinic_session=([^;]+)/.exec(req.headers.cookie||'')?.[1];sessions.delete(createHmac('sha256',secret).update(token).digest('hex'));res.setHeader('Set-Cookie','clinic_session=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0');return json(res,200,{ok:true});}
  if(path==='/api/dashboard'&&req.method==='GET'){
    const own=u.role==='PATIENT';const pid=own?u.patient_id:null;
    const appointments=own?db.prepare('SELECT a.*,p.name AS patient_name FROM appointments a JOIN patients p ON p.id=a.patient_id WHERE a.org_id=? AND a.patient_id=? ORDER BY starts_at LIMIT 20').all(u.org_id,pid):db.prepare('SELECT a.*,p.name AS patient_name FROM appointments a JOIN patients p ON p.id=a.patient_id WHERE a.org_id=? ORDER BY starts_at LIMIT 20').all(u.org_id);
    const tasks=own?[]:db.prepare("SELECT * FROM tasks WHERE org_id=? AND status='OPEN' LIMIT 30").all(u.org_id);
    return json(res,200,{appointments,tasks,counts:own?{}:{patients:db.prepare('SELECT count(*) n FROM patients WHERE org_id=?').get(u.org_id).n,claims:db.prepare('SELECT count(*) n FROM claims WHERE org_id=?').get(u.org_id).n}});
  }
  if(path==='/api/patients'&&req.method==='GET'){
    const rows=u.role==='PATIENT'?[patientAccess(u,u.patient_id)]:db.prepare('SELECT * FROM patients WHERE org_id=? ORDER BY name').all(u.org_id);
    return json(res,200,rows.map(x=>pick(x,['id','name','dob','mrn','payer_name'])));
  }
  if(path==='/api/encounters'&&req.method==='GET'){
    const patientId=url.searchParams.get('patientId');if(patientId)patientAccess(u,patientId);
    const rows=patientId?db.prepare('SELECT * FROM encounters WHERE org_id=? AND patient_id=? ORDER BY date_of_service DESC').all(u.org_id,patientId):u.role==='PATIENT'?db.prepare('SELECT * FROM encounters WHERE org_id=? AND patient_id=? ORDER BY date_of_service DESC').all(u.org_id,u.patient_id):db.prepare('SELECT * FROM encounters WHERE org_id=? ORDER BY date_of_service DESC').all(u.org_id);
    return json(res,200,rows);
  }
  const em=/^\/api\/encounters\/([^/]+)\/(sections|sign|checks|checkout)$/.exec(path);
  if(em){const e=db.prepare('SELECT * FROM encounters WHERE id=? AND org_id=?').get(em[1],u.org_id);if(!e)throw fail(404,'Encounter not found');patientAccess(u,e.patient_id);
    if(em[2]==='sections'&&req.method==='GET')return json(res,200,db.prepare('SELECT id,kind,content,created_at FROM clinical_sections WHERE encounter_id=? ORDER BY created_at').all(e.id));
    if(em[2]==='checks'&&req.method==='POST'){requireUser(req,['PHYSICIAN','BILLER','ADMIN']);const b=await body(req);return json(res,200,{issues:documentationChecks(db,e,b.lines||[])});}
    requireUser(req,['PHYSICIAN','ADMIN']);
    if(em[2]==='sections'&&req.method==='POST'){if(e.status!=='OPEN')throw fail(409,'Signed encounter is locked');const b=await body(req);requireFields(b,['kind','content']);if(!['SYMPTOM','HISTORY','MEDICATION','ALLERGY','EXAM','ASSESSMENT','PLAN','LAB','CONSENT','MESSAGE','CALL','DICTATION'].includes(b.kind)||b.content.length>10000)throw fail(400,'Invalid section');const id=uid();db.prepare('INSERT INTO clinical_sections VALUES (?,?,?,?,?,?)').run(id,e.id,b.kind,b.content,u.id,now());audit(db,u,'ADD_SECTION','encounter',e.id);return json(res,201,{id});}
    if(em[2]==='sign'&&req.method==='POST'){if(e.status!=='OPEN'||e.clinician_id!==u.id)throw fail(403,'Assigned clinician must sign open encounter');db.prepare("UPDATE encounters SET status='SIGNED',signed_at=? WHERE id=?").run(now(),e.id);audit(db,u,'SIGN','encounter',e.id);return json(res,200,{ok:true});}
    if(em[2]==='checkout'&&req.method==='POST'){if(e.clinician_id!==u.id)throw fail(403,'Assigned clinician must check out');const b=await body(req);if(!Array.isArray(b.lines)||b.lines.length>20)throw fail(400,'Invalid claim lines');return json(res,201,checkout(db,u,e.id,b.lines));}
  }
  if(path==='/api/suggestions'&&req.method==='POST'){requireUser(req,['PHYSICIAN','BILLER','ADMIN']);const b=await body(req);requireFields(b,['encounter_id','system','code','rationale']);const e=db.prepare('SELECT * FROM encounters WHERE id=? AND org_id=?').get(b.encounter_id,u.org_id);if(!e||!['ICD10CM','CPT','HCPCS','MODIFIER'].includes(b.system))throw fail(400,'Invalid suggestion');const id=uid();db.prepare('INSERT INTO code_suggestions (id,encounter_id,system,code,rationale,source) VALUES (?,?,?,?,?,?)').run(id,e.id,b.system,b.code,b.rationale,'MANUAL');audit(db,u,'SUGGEST_CODE','encounter',e.id);return json(res,201,{id,status:'SUGGESTED'});}
  if(path==='/api/suggestions'&&req.method==='GET'){const e=db.prepare('SELECT * FROM encounters WHERE id=? AND org_id=?').get(url.searchParams.get('encounterId'),u.org_id);if(!e)throw fail(404,'Encounter not found');patientAccess(u,e.patient_id);return json(res,200,db.prepare('SELECT * FROM code_suggestions WHERE encounter_id=?').all(e.id));}
  if(path==='/api/authorizations'&&req.method==='GET'){const rows=u.role==='PATIENT'?db.prepare('SELECT * FROM authorizations WHERE org_id=? AND patient_id=?').all(u.org_id,u.patient_id):db.prepare('SELECT * FROM authorizations WHERE org_id=?').all(u.org_id);return json(res,200,rows);}
  if(path==='/api/authorizations'&&req.method==='POST'){requireUser(req,['BILLER','ADMIN']);const b=await body(req);requireFields(b,['patient_id','payer_name','procedure_code']);patientAccess(u,b.patient_id);const id=uid();db.prepare('INSERT INTO authorizations (id,org_id,patient_id,payer_name,procedure_code,starts_on,ends_on,notes) VALUES (?,?,?,?,?,?,?,?)').run(id,u.org_id,b.patient_id,b.payer_name,b.procedure_code,b.starts_on||null,b.ends_on||null,b.notes||'');audit(db,u,'REQUEST_AUTH','authorization',id);return json(res,201,{id,status:'REQUESTED'});}
  if(path==='/api/billing/codes'&&req.method==='GET')return json(res,200,searchCodes(db,u,Object.fromEntries(url.searchParams)));
  if(path==='/api/billing/codes/import'&&req.method==='POST')return json(res,201,importLicensedCodes(db,u,await body(req,4000000)));
  if(path==='/api/billing/coverage'&&req.method==='GET')return json(res,200,coverageView(db,u,{...Object.fromEntries(url.searchParams),units:Number(url.searchParams.get('units'))}));
  if(path==='/api/billing/coverage'&&req.method==='POST')return json(res,201,recordCoverage(db,u,await body(req,10000)));
  if(path==='/api/billing/connector'&&req.method==='GET') {requireUser(req,['BILLER','ADMIN']);return json(res,200,{live_transmission_enabled:false,simulation_enabled:dev && process.env.SEED_DEMO==='true' && process.env.FICTIONAL_CLEARINGHOUSE_DEMO==='true',notice:'Simulation only. No insurer communication or real payments.'});}
  const transmissionMatch=/^\/api\/claims\/([^/]+)\/(transmissions|simulate|process-simulation|correct-simulation)$/.exec(path);
  if(transmissionMatch){requireUser(req,['BILLER','ADMIN']);const [,id,action]=transmissionMatch;
    if(action==='transmissions'&&req.method==='GET')return json(res,200,clearinghouse.status(u,id));
    if(action==='simulate'&&req.method==='POST'){const b=await body(req,4096);if(!b||typeof b!=='object'||Array.isArray(b))throw fail(400,'Expected a JSON object');return json(res,200,clearinghouse.configure(u,id,b));}
    if(action==='process-simulation'&&req.method==='POST')return json(res,200,await clearinghouse.process(u,id));
    if(action==='correct-simulation'&&req.method==='POST'){const b=await body(req,20000);if(!b||typeof b!=='object'||Array.isArray(b))throw fail(400,'Expected a JSON object');return json(res,201,clearinghouse.correct(u,id,b));}
    throw fail(405,'Method not allowed');
  }
  if(path==='/api/claims'&&req.method==='GET'){
    if(u.role!=='PATIENT'){requireUser(req,['BILLER','ADMIN']);return json(res,200,clearinghouse.list(u));}
    const rows=db.prepare('SELECT id,patient_id,payer_name,total_cents,created_at FROM claims WHERE org_id=? AND patient_id=? ORDER BY created_at DESC').all(u.org_id,u.patient_id);
    return json(res,200,rows.map(c=>({...c,status:'PRACTICE_PROCESSING'})));
  }
  const claimMatch=/^\/api\/claims\/([^/]+)\/(events|denials|payments)$/.exec(path);
  if(claimMatch){const claim=db.prepare('SELECT * FROM claims WHERE id=? AND org_id=?').get(claimMatch[1],u.org_id);if(!claim)throw fail(404,'Claim not found');patientAccess(u,claim.patient_id);
    if(claimMatch[2]!=='payments')requireUser(req,['BILLER','ADMIN']);
    if(req.method==='GET'){if(claimMatch[2]==='payments')return json(res,200,db.prepare('SELECT amount_cents,adjustment_cents,posted_at FROM payments WHERE claim_id=?').all(claim.id));if(claimMatch[2]==='denials')return json(res,200,db.prepare('SELECT id,reason,status,received_at FROM denials WHERE claim_id=?').all(claim.id));return json(res,200,db.prepare('SELECT event_type,detail,occurred_at FROM claim_events WHERE claim_id=? ORDER BY occurred_at').all(claim.id));}
    requireUser(req,['BILLER','ADMIN']);const b=await body(req);
    if(claimMatch[2]==='denials'&&req.method==='POST'){requireFields(b,['reason']);const id=uid();db.prepare('INSERT INTO denials VALUES (?,?,?,?,?,?)').run(id,claim.id,b.reason_code||null,b.reason,'OPEN',now());db.prepare("UPDATE claims SET status='DENIED',updated_at=? WHERE id=?").run(now(),claim.id);audit(db,u,'RECORD_DENIAL','claim',claim.id);return json(res,201,{id});}
    if(claimMatch[2]==='payments'&&req.method==='POST'){requireFields(b,['reference']);if(!Number.isInteger(b.amount_cents)||b.amount_cents<0)throw fail(400,'Invalid payment');const id=uid();db.prepare('INSERT INTO payments VALUES (?,?,?,?,?,?)').run(id,claim.id,b.amount_cents,Number(b.adjustment_cents)||0,b.reference,now());audit(db,u,'POST_PAYMENT','claim',claim.id);return json(res,201,{id});}
  }
  if(path==='/api/appeals'&&req.method==='POST'){requireUser(req,['BILLER','ADMIN']);const b=await body(req);requireFields(b,['denial_id','narrative']);const denial=db.prepare('SELECT d.* FROM denials d JOIN claims c ON c.id=d.claim_id WHERE d.id=? AND c.org_id=?').get(b.denial_id,u.org_id);if(!denial)throw fail(404,'Denial not found');const id=uid();db.prepare('INSERT INTO appeals (id,denial_id,narrative,created_by) VALUES (?,?,?,?)').run(id,denial.id,b.narrative,u.id);audit(db,u,'DRAFT_APPEAL','appeal',id);return json(res,201,{id,status:'DRAFT'});}
  if(path==='/api/files'&&req.method==='GET'){const pid=url.searchParams.get('patientId');patientAccess(u,pid);return json(res,200,db.prepare('SELECT id,patient_id,encounter_id,kind,filename,mime,bytes,created_at FROM files WHERE org_id=? AND patient_id=?').all(u.org_id,pid));}
  if(path==='/api/files'&&req.method==='POST'){const b=await body(req,6_000_000);requireFields(b,['patient_id','filename','mime','data']);patientAccess(u,b.patient_id);if(b.encounter_id&&!db.prepare('SELECT id FROM encounters WHERE id=? AND org_id=? AND patient_id=?').get(b.encounter_id,u.org_id,b.patient_id))throw fail(400,'Invalid encounter');const allowed={'image/jpeg':'IMAGE','image/png':'IMAGE','application/pdf':'DOCUMENT'};if(!allowed[b.mime])throw fail(400,'Unsupported file type');const data=Buffer.from(b.data,'base64');if(!data.length||data.length>4_000_000||data.toString('base64')!==b.data)throw fail(400,'Invalid file');if(b.mime==='application/pdf'&&!data.subarray(0,5).equals(Buffer.from('%PDF-')))throw fail(400,'Invalid PDF');if(b.mime==='image/png'&&!data.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])))throw fail(400,'Invalid PNG');if(b.mime==='image/jpeg'&&!(data[0]===255&&data[1]===216))throw fail(400,'Invalid JPEG');const id=uid(),key=uid();writeFileSync(join(uploadDir,key),data,{flag:'wx',mode:0o600});db.prepare('INSERT INTO files VALUES (?,?,?,?,?,?,?,?,?,?,?)').run(id,u.org_id,b.patient_id,b.encounter_id||null,allowed[b.mime],basename(b.filename).slice(0,120),b.mime,key,data.length,u.id,now());audit(db,u,'UPLOAD_FILE','file',id);return json(res,201,{id});}
  const fm=/^\/api\/files\/([^/]+)$/.exec(path);if(fm&&req.method==='GET'){const f=db.prepare('SELECT * FROM files WHERE id=? AND org_id=?').get(fm[1],u.org_id);if(!f)throw fail(404,'File not found');patientAccess(u,f.patient_id);audit(db,u,'VIEW_FILE','file',f.id);res.writeHead(200,{'Content-Type':f.mime,'Content-Disposition':`attachment; filename="${f.filename.replace(/["\\\r\n]/g,'_')}"`,'X-Content-Type-Options':'nosniff','Cache-Control':'no-store'});return res.end(readFileSync(join(uploadDir,f.storage_key)));}
  throw fail(404,'Route not found');
}
const server=http.createServer(async(req,res)=>{try{const url=new URL(req.url,`http://${req.headers.host||'localhost'}`);if(url.pathname==='/health'&&req.method==='GET'){db.prepare('SELECT 1').get();return json(res,200,{ok:true,fictional_demo:true});}if(url.pathname.startsWith('/api/'))return await api(req,res,url);if(req.method!=='GET')throw fail(405,'Method not allowed');const assets={'/':'index.html','/app.js':'app.js','/audio.js':'audio.js','/clearinghouse.js':'clearinghouse.js','/code-coverage.js':'code-coverage.js','/style.css':'style.css'};const file=assets[url.pathname];if(!file)throw fail(404,'Not found');const mime=file.endsWith('.js')?'text/javascript':file.endsWith('.css')?'text/css':'text/html';res.writeHead(200,{'Content-Type':mime,'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Content-Security-Policy':"default-src 'self'; img-src 'self' blob:; media-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'"});res.end(readFileSync(join(root,'public',file)));}catch(e){if(!res.headersSent)json(res,e.status||500,{error:e.status?e.message:'Internal server error',issues:e.issues||e.details});else res.end();if(!e.status)console.error(e);}});
server.listen(port,host,()=>console.log(`ClinicCommand demo listening on http://${host}:${server.address().port}`));
