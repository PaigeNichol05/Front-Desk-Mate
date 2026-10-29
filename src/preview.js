// Evaluation fixtures and access gate. This module never contacts a payer or device.
import { createHash, timingSafeEqual } from 'node:crypto';
import { existsSync, lstatSync, mkdirSync, readdirSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
import { isAbsolute, join, resolve, sep } from 'node:path';
import { now, seed } from './db.js';
import { recordService } from './appointment-coding.js';

export const PREVIEW_BASE='09b4dba858c01c56a6abc1a5b901b03cbd6a3ff0';
export const PREVIEW_DATE='2026-10-09'; // Fixed within the bundled catalog releases.
export const scenarios=[
  {id:'enc-001',title:'Medication → reviewed code → claim',code:'J3301',diagnosis:'M54.50',units:4,steps:'Review the fictional note and performed-service record. Sign as physician. Review J3301 with M54.50, four billing units, and a specimen rationale. Select that reviewed line and enter a fictional charge per unit to check out.'},
  {id:'enc-preview-toxin',title:'Detailed Botox administration',code:'J0585',diagnosis:'M54.50',units:150,steps:'Inspect brand, ingredient, vial NDC/lot/expiry, preparation, sites, 150 administered units and 50 discarded units. Sign, then review separate ADMINISTERED (150) and DISCARDED (50) components. Use OTHER_PAYER_REVIEWED with a clearly fictional policy reference. No modifier is prescribed by this specimen.'},
  {id:'enc-preview-order',title:'CT order stays out of this clinic’s claim',steps:'Inspect the CT order and its source note. It was not performed here, so it cannot receive a performed-service billing review. CPT lookup remains unavailable without an authorized licensed catalog.'}
];
export const toxinFixture={product_key:'BOTOX',purpose:'MEDICAL',supply_source:'CLINIC_PURCHASED',vials:[{label_units:200,ndc:'FICTIONAL-NDC-NOT-A-PRODUCT',lot:'DEMO-LOT-001',expires_on:'2027-01-01',container_type:'SINGLE_DOSE',preparation:'RECONSTITUTED',solution_volume_ml:2,diluent:'Fictional preparation arithmetic only',preparation_reference:'FICTIONAL-PREP-001'}],sites:[{site:'Fictional site A',laterality:'left',units:100,injection_count:10},{site:'Fictional site B',laterality:'right',units:50,injection_count:5}],discarded_units:50,remaining_units:0,other_use_units:0,discard_reason:'Fictional remainder for arithmetic demonstration',discard_reference:'FICTIONAL-DISCARD-001',necessity:'Fictional chart fixture only; the paired diagnosis demonstrates software matching, not a supported indication or medical necessity.',treatment_history:'INITIAL',previous_response:'Fictional initial treatment history',frequency_plan:'Fictional follow-up only; no treatment interval recommendation',consent_reference:'FICTIONAL-CONSENT-001',guidance:'NONE',adverse_events:'Fictional tolerance entry only',waste_policy:'UNKNOWN'};

export function configurePreview(env=process.env,root=resolve(import.meta.dirname,'..')){
  if(env.FICTIONAL_PREVIEW!=='true')return {enabled:false};
  const hosted=env.PREVIEW_HOSTED==='true';
  if(env.NODE_ENV!=='development'||env.SEED_DEMO!=='true'||env.FICTIONAL_CLEARINGHOUSE_DEMO!=='true'||env.LIVE_CLEARINGHOUSE_ENABLED!=='false'||env.PAYER_ADAPTER!=='none'||env.FICTIONAL_AUDIO_DEMO!=='false')throw Error('Preview requires isolated fictional-only runtime flags');
  if(!env.SESSION_SECRET||env.SESSION_SECRET.length<48)throw Error('Preview needs a generated SESSION_SECRET of at least 48 characters');
  if(hosted&&(!/^[a-zA-Z0-9_-]{3,64}$/.test(env.PREVIEW_ACCESS_USER||'')||(env.PREVIEW_ACCESS_PASSWORD||'').length<24||env.PREVIEW_ACCESS_PASSWORD.includes(':')||env.COOKIE_SECURE!=='true'))throw Error('Hosted preview needs a private access username, random password of at least 24 characters, and secure cookies');
  if(!hosted&&(!['127.0.0.1','localhost','::1'].includes(env.HOST)||env.COOKIE_SECURE==='true'))throw Error('Local preview must use loopback and local cookies');
  if(!env.PREVIEW_DATA_DIR||!isAbsolute(env.PREVIEW_DATA_DIR))throw Error('Set an absolute dedicated PREVIEW_DATA_DIR');
  const dir=resolve(env.PREVIEW_DATA_DIR);
  for(const unsafe of [root,join(root,'public'),join(root,'demo'),join(root,'data'),join(root,'uploads')])if(dir===unsafe||dir.startsWith(unsafe+sep)&&unsafe!==root)throw Error('Preview storage must be separate from existing application data and public assets');
  mkdirSync(dir,{recursive:true,mode:0o700});
  if(lstatSync(dir).isSymbolicLink()||realpathSync(dir)!==dir)throw Error('Preview storage must use a real dedicated directory, without symlinks');
  const marker=join(dir,'.fictional-preview.json');
  if(!existsSync(marker)){
    if(readdirSync(dir).length)throw Error('Refusing to adopt a nonempty directory as fictional preview storage');
    writeFileSync(marker,JSON.stringify({kind:'FRONT_DESK_MATE_FICTIONAL_PREVIEW_V1',base:PREVIEW_BASE}),{flag:'wx',mode:0o600});
  }
  if(lstatSync(marker).isSymbolicLink()||JSON.parse(readFileSync(marker)).kind!=='FRONT_DESK_MATE_FICTIONAL_PREVIEW_V1')throw Error('Invalid fictional-preview storage marker');
  for(const [key,name] of [['DATABASE_PATH','clinic.db'],['UPLOAD_DIR','uploads'],['AUDIO_DIR','private-audio']]){
    if(resolve(env[key]||'')!==join(dir,name))throw Error('Preview paths must stay inside dedicated preview storage');
    if(existsSync(env[key])&&lstatSync(env[key]).isSymbolicLink())throw Error('Preview paths cannot be symlinks');
  }
  return {enabled:true,hosted,dataDir:dir,user:env.PREVIEW_ACCESS_USER,password:env.PREVIEW_ACCESS_PASSWORD};
}

export function previewGate(config,req,res){
  if(!config.enabled||!config.hosted||req.url==='/health'&&req.method==='GET')return true;
  let credentials='';
  if(/^Basic [A-Za-z0-9+/=]+$/.test(req.headers.authorization||''))credentials=Buffer.from(req.headers.authorization.slice(6),'base64').toString('utf8');
  const digest=s=>createHash('sha256').update(s).digest();
  if(timingSafeEqual(digest(credentials),digest(config.user+':'+config.password)))return true;
  res.writeHead(401,{'WWW-Authenticate':'Basic realm="Front Desk Mate private fictional preview", charset="UTF-8"','Cache-Control':'no-store','Content-Type':'text/plain','X-Content-Type-Options':'nosniff'});
  res.end('Private fictional preview. Reviewer access is required.');return false;
}

export function seedPreview(db){
  // Never augment an arbitrary existing database. Only this dedicated fixture set is accepted.
  const unexpected=db.prepare("SELECT 1 FROM organizations WHERE id!='demo-clinic'").get();
  if(unexpected)throw Error('Preview database contains an unexpected organization');
  const existing=db.prepare("SELECT name FROM patients WHERE id='patient-001'").get();
  if(existing&&existing.name!=='Jordan Sample')throw Error('Preview database is not the expected fictional dataset');
  if(db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='preview_fixture_version'").get())return;
  if(db.prepare('SELECT count(*) n FROM organizations').get().n)throw Error('Preview requires a fresh dedicated database');
  db.exec('BEGIN IMMEDIATE');
  try{
    seed(db);
    db.prepare("UPDATE organizations SET name='Front Desk Mate Fictional Preview' WHERE id='demo-clinic'").run();
    db.prepare("UPDATE encounters SET date_of_service=?,appointment_id='appt-001' WHERE id='enc-001'").run(PREVIEW_DATE);
    db.prepare("UPDATE appointments SET starts_at=?,status='CHECKED_IN' WHERE id='appt-001'").run(PREVIEW_DATE+'T15:00:00Z');
    for(const id of ['enc-preview-toxin','enc-preview-order'])db.prepare('INSERT INTO encounters (id,org_id,patient_id,clinician_id,date_of_service) VALUES (?,?,?,?,?)').run(id,'demo-clinic','patient-001','doctor-001',PREVIEW_DATE);
    db.prepare('INSERT INTO patients VALUES (?,?,?,?,?,?,?)').run('patient-preview-other','demo-clinic','Alex Example','1990-02-01','DEMO-002','Example Health Plan','DEMO-MEMBER-002');
    const docs={
      'enc-001':['Fictional software fixture: low back pain, M54.50. Diagnosis is a test input, not a coding recommendation.','Fictional administration: triamcinolone acetonide, 40 mg, sample intramuscular route; recorded as performed in this clinic. No therapeutic dose or indication is recommended.'],
      'enc-preview-toxin':['Fictional software fixture only. M54.50 is a catalog-matching test value, not a representation that this diagnosis supports Botox coverage.','Fictional Botox administration: a 200-unit single-dose vial; 150 units across fictional sites A and B, 50 units discarded, zero remaining and zero other use. See FICTIONAL-PREP-001 and FICTIONAL-DISCARD-001. This is not treatment guidance.'],
      'enc-preview-order':['Fictional software fixture: imaging discussion only.','CT of lumbar spine without contrast ordered to an outside imaging center. Not performed here. Do not bill the CT as this clinic’s performed service.']
    };
    for(const [id,notes] of Object.entries(docs))for(const [i,kind] of ['ASSESSMENT','PLAN'].entries())db.prepare('INSERT INTO clinical_sections VALUES (?,?,?,?,?,?)').run('preview-'+id+'-'+kind,id,kind,notes[i],'doctor-001',now());
    // recordService owns its own transaction; finish the scaffold first.
    db.exec('COMMIT');
    const doctor=db.prepare("SELECT * FROM users WHERE id='doctor-001'").get();
    const common=id=>({source_section_id:'preview-'+id+'-PLAN',reviewed:true,indication:'Fictional software fixture only; no clinical or coverage recommendation'});
    recordService(db,doctor,'enc-001',{...common('enc-001'),category:'MEDICATION',state:'PERFORMED_IN_HOUSE',description:'Fictional triamcinolone administration',drug:'Triamcinolone acetonide',dose:'40 mg (fictional)',route:'Intramuscular (fictional)',search_terms:'J3301',performance_reference:'FICTIONAL-ADMIN-001'});
    recordService(db,doctor,'enc-preview-toxin',{...common('enc-preview-toxin'),category:'BOTULINUM_TOXIN',state:'PERFORMED_IN_HOUSE',description:'Fictional Botox administration arithmetic',route:'Fictional administration route',method:'Fictional site-by-site procedure record',performance_reference:'FICTIONAL-TOXIN-001',toxin:toxinFixture});
    recordService(db,doctor,'enc-preview-order',{...common('enc-preview-order'),category:'CT',state:'ORDERED',description:'Outside lumbar CT without contrast',body_part:'Lumbar spine',laterality:'Not applicable',contrast:'NONE',search_terms:'computed tomography'});
    db.exec('CREATE TABLE preview_fixture_version (version INTEGER PRIMARY KEY); INSERT INTO preview_fixture_version VALUES (1)');
  }catch(e){if(db.isTransaction)db.exec('ROLLBACK');throw e}
}

export function previewInfo(db,user,config){
  if(!config.enabled)return {enabled:false};
  return {enabled:true,base_commit:PREVIEW_BASE,service_date:PREVIEW_DATE,shared_fixture:true,uploads_enabled:false,pr3_included:false,live_transmission_enabled:false,device_ingestion_enabled:false,scenarios:scenarios.map(s=>({...s,status:db.prepare('SELECT status FROM encounters WHERE id=? AND org_id=? AND patient_id=?').get(s.id,user.org_id,user.role==='PATIENT'?user.patient_id:'patient-001')?.status||'UNAVAILABLE'})),notice:'Shared fictional evaluation records only. Coverage is unverified unless fictional staff evidence is explicitly recorded. No real insurer, device, AI, or clinical-compliance connection.'};
}
