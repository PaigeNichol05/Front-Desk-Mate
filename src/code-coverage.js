import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { createHash } from 'node:crypto';
import { uid, now, audit } from './db.js';
const directory=new URL('../resources/codes/',import.meta.url);
export const catalogManifest=JSON.parse(readFileSync(new URL('manifest.json',directory)));
const catalogs=new Map(catalogManifest.map(m=>{
  const compressed=readFileSync(new URL(m.file,directory));
  if(createHash('sha256').update(compressed).digest('hex')!==m.sha256)throw Error('Code catalog integrity failure');
  return [m.system,JSON.parse(gunzipSync(compressed))];
}));
const fail=(status,message)=>Object.assign(Error(message),{status});
export function migrateCodeCoverage(db){db.exec(`
 CREATE TABLE IF NOT EXISTS licensed_codes (org_id TEXT NOT NULL REFERENCES organizations(id),system TEXT NOT NULL CHECK(system='CPT'),code TEXT NOT NULL,description TEXT NOT NULL,starts_on TEXT NOT NULL,ends_on TEXT NOT NULL,license_reference TEXT NOT NULL,source_reference TEXT NOT NULL,imported_by TEXT NOT NULL REFERENCES users(id),imported_at TEXT NOT NULL,PRIMARY KEY(org_id,system,code,starts_on));
 CREATE TABLE IF NOT EXISTS coverage_reviews (id TEXT PRIMARY KEY,org_id TEXT NOT NULL REFERENCES organizations(id),patient_id TEXT NOT NULL REFERENCES patients(id),encounter_id TEXT NOT NULL REFERENCES encounters(id),payer_name TEXT NOT NULL,member_id TEXT NOT NULL,context_json TEXT NOT NULL,evidence_json TEXT NOT NULL,created_by TEXT NOT NULL REFERENCES users(id),created_at TEXT NOT NULL);
 CREATE INDEX IF NOT EXISTS coverage_review_patient ON coverage_reviews(org_id,patient_id,created_at);
 CREATE TRIGGER IF NOT EXISTS coverage_review_no_update BEFORE UPDATE ON coverage_reviews BEGIN SELECT RAISE(ABORT,'Coverage reviews are immutable'); END;
 CREATE TRIGGER IF NOT EXISTS coverage_review_no_delete BEFORE DELETE ON coverage_reviews BEGIN SELECT RAISE(ABORT,'Coverage reviews are immutable'); END;
 `)}
function staff(db,user,roles=['BILLER','ADMIN','PHYSICIAN']){const u=db.prepare('SELECT * FROM users WHERE id=? AND org_id=? AND active=1').get(user.id,user.org_id);if(!u||!roles.includes(u.role))throw fail(403,'Access denied');return u}
export function date(value){if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(value)||!Number.isFinite(Date.parse(value+'T00:00:00Z'))||new Date(value+'T00:00:00Z').toISOString().slice(0,10)!==value)throw fail(400,'A valid date is required');return value}
function text(value,name,max=500){if(typeof value!=='string'||!value.trim()||value.length>max)throw fail(400,`Invalid ${name}`);return value.trim()}
export function searchCodes(db,user,{system='HCPCS',q='',service_date}={}){
 staff(db,user);date(service_date);if(!['HCPCS','ICD10CM','CPT'].includes(system))throw fail(400,'Unsupported code system');
 if(typeof q!=='string'||q.length>120)throw fail(400,'Invalid code search');
 const term=q.trim().toLowerCase(),manifest=catalogManifest.find(m=>m.system===system);
 const rows=system==='CPT'?db.prepare('SELECT code,description,starts_on,ends_on,source_reference,license_reference FROM licensed_codes WHERE org_id=? AND starts_on<=? AND ends_on>=? ORDER BY code').all(user.org_id,service_date,service_date):(catalogs.get(system)||[]).filter(r=>r.starts_on<=service_date&&r.ends_on>=service_date);
 const matches=rows.filter(r=>r.code.toLowerCase().includes(term)||r.code.replaceAll('.','').toLowerCase().includes(term.replaceAll('.',''))||r.description.toLowerCase().includes(term));
 matches.sort((a,b)=>Number(b.code.toLowerCase()===term)-Number(a.code.toLowerCase()===term)||a.code.localeCompare(b.code));
 return {system,service_date,source:manifest||null,available:rows.length>0,total:matches.length,results:matches.slice(0,30),notice:system==='CPT'?'CPT content requires a private licensed import by an administrator.':'Catalog validity does not establish medical necessity, eligibility, coverage or payment. Dates outside installed releases require an updated catalog.'};
}
export function importLicensedCodes(db,user,b){
 staff(db,user,['ADMIN']);if(!b||b.license_attested!==true)throw fail(400,'Confirm authorization to use and display this CPT data');
 const license=text(b.license_reference,'license reference'),source=text(b.source_reference,'source reference');
 if(!Array.isArray(b.codes)||!b.codes.length||b.codes.length>10000)throw fail(400,'Supply 1–10000 licensed codes');
 const codes=b.codes.map(c=>{if(!c||typeof c!=='object'||!/^([0-9]{5}|[0-9]{4}[FTU])$/.test(c.code))throw fail(400,'Invalid CPT code');const starts=date(c.starts_on),ends=date(c.ends_on);if(starts>ends)throw fail(400,'Invalid code date range');return {...c,description:text(c.description,'description',2000),starts_on:starts,ends_on:ends}});
 db.exec('BEGIN IMMEDIATE');try{for(const c of codes){if(db.prepare('SELECT 1 FROM licensed_codes WHERE org_id=? AND code=? AND starts_on<=? AND ends_on>=?').get(user.org_id,c.code,c.ends_on,c.starts_on))throw fail(409,'Overlapping licensed code versions');db.prepare('INSERT INTO licensed_codes VALUES (?,?,?,?,?,?,?,?,?,?)').run(user.org_id,'CPT',c.code,c.description,c.starts_on,c.ends_on,license,source,user.id,now())}audit(db,user,'IMPORT_LICENSED_CODES','code_catalog',source);db.exec('COMMIT')}catch(e){db.exec('ROLLBACK');throw e}return {imported:codes.length};
}
function context(db,user,b){
 staff(db,user);if(!b||typeof b!=='object')throw fail(400,'Coverage context is required');
 const e=db.prepare('SELECT * FROM encounters WHERE id=? AND org_id=?').get(b.encounter_id,user.org_id);if(!e)throw fail(404,'Encounter not found');
 const p=db.prepare('SELECT * FROM patients WHERE id=? AND org_id=?').get(e.patient_id,user.org_id);if(!p?.payer_name||!p.member_id)throw fail(422,'Patient payer and member ID are required');
 const plan=text(b.plan_reference,'exact plan/product reference',200),system=b.procedure_system;
 if(!['CPT','HCPCS'].includes(system))throw fail(400,'Unsupported procedure system');
 const procedure=text(b.procedure_code,'procedure code',7).toUpperCase(),diagnosis=text(b.diagnosis_code,'diagnosis code',8).toUpperCase(),modifier=String(b.modifier||'').toUpperCase();
 if(!/^[A-Z0-9]{4,7}$/.test(procedure)||! /^[A-Z][0-9][A-Z0-9](\.[A-Z0-9]{1,4})?$/.test(diagnosis)||! /^([A-Z0-9]{2}(,[A-Z0-9]{2})*)?$/.test(modifier)||modifier.length>20||!Number.isSafeInteger(b.units)||b.units<1||b.units>100000||!/^\d{2}$/.test(b.place_of_service||''))throw fail(400,'Invalid procedure, diagnosis, modifier, units or place of service');
 date(e.date_of_service);
 return {e,p,key:{encounter_id:e.id,plan_reference:plan,provider_id:e.clinician_id,service_date:e.date_of_service,procedure_system:system,procedure_code:procedure,diagnosis_code:diagnosis,modifier,units:b.units,place_of_service:b.place_of_service}};
}
export function recordCoverage(db,user,b){
 staff(db,user,['BILLER','ADMIN']);const {e,p,key}=context(db,user,b),evidence=b.evidence;
 if(!evidence||evidence.reviewed!==true)throw fail(400,'Staff review confirmation is required');
 if(!['PLAN_DOCUMENT','INSURER_PORTAL','INSURER_CALL'].includes(evidence.source_kind)||!['COVERED_SUBJECT_TO_TERMS','NOT_COVERED','CONDITIONAL','UNKNOWN'].includes(evidence.status))throw fail(400,'Invalid coverage source or status');
 if(evidence.source_kind==='PLAN_DOCUMENT'&&evidence.status==='COVERED_SUBJECT_TO_TERMS')throw fail(400,'A general plan document cannot confirm member-specific coverage');
 const checked=date(evidence.checked_on),expires=date(evidence.expires_on),today=now().slice(0,10);if(checked>today||expires<checked)throw fail(400,'Invalid evidence review dates');
 if(!['ACTIVE','INACTIVE','UNKNOWN'].includes(evidence.eligibility)||!['IN_NETWORK','OUT_OF_NETWORK','UNKNOWN'].includes(evidence.network)||!['STAFF_REVIEWED','UNKNOWN'].includes(evidence.provider_enrollment))throw fail(400,'Invalid eligibility, network or enrollment review');
 const clean={source_kind:evidence.source_kind,source_reference:text(evidence.source_reference,'source/reference',1000),status:evidence.status,checked_on:checked,expires_on:expires,eligibility:evidence.eligibility,network:evidence.network,provider_enrollment:evidence.provider_enrollment,requirements:text(evidence.requirements,'requirements, limits and exclusions',3000),cost_sharing:text(evidence.cost_sharing,'cost sharing or unknown',1000),authenticated_insurer_response:false};
 const id=uid();db.exec('BEGIN IMMEDIATE');try{db.prepare('INSERT INTO coverage_reviews VALUES (?,?,?,?,?,?,?,?,?,?)').run(id,user.org_id,p.id,e.id,p.payer_name,p.member_id,JSON.stringify(key),JSON.stringify(clean),user.id,now());audit(db,user,'RECORD_COVERAGE_REVIEW','coverage_review',id);db.exec('COMMIT')}catch(err){db.exec('ROLLBACK');throw err}return {id,notice:'Staff-reviewed evidence. No authenticated insurer communication occurred.'};
}
export function coverageView(db,user,b){
 const {e,p,key}=context(db,user,b),today=now().slice(0,10);
 const rows=db.prepare('SELECT * FROM coverage_reviews WHERE org_id=? AND encounter_id=? AND patient_id=? ORDER BY rowid DESC').all(user.org_id,e.id,p.id);
 const match=rows.find(r=>r.payer_name===p.payer_name&&r.member_id===p.member_id&&JSON.stringify(key)===r.context_json);
 const evidence=match?JSON.parse(match.evidence_json):null,stale=!!evidence&&evidence.expires_on<today;
 const result={context:key,patient:{id:p.id,name:p.name,payer_name:p.payer_name},procedure:searchCodes(db,user,{system:key.procedure_system,q:key.procedure_code,service_date:key.service_date}).results.find(r=>r.code===key.procedure_code)||null,diagnosis:searchCodes(db,user,{system:'ICD10CM',q:key.diagnosis_code,service_date:key.service_date}).results.find(r=>r.code===key.diagnosis_code)||null,status:!evidence||stale?'NOT_VERIFIED':evidence.source_kind==='PLAN_DOCUMENT'?'POLICY_ONLY':evidence.status,stale,evidence,review_id:match?.id||null,authenticated_insurer_response:false,live_transmission_enabled:false,notice:'Staff-reviewed evidence only. Benefits and authorization do not guarantee payment. No automatic diagnosis substitution; codes must match the documented care.'};
 audit(db,user,'VIEW_COVERAGE','encounter',e.id);return result;
}
