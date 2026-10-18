import { uid, now, audit } from './db.js';
import { coverageContext, searchCodes, date } from './code-coverage.js';
import { serviceGaps } from './appointment-coding.js';
const fail = (status, message) => Object.assign(Error(message), { status });
const notice = 'Internal authorization worksheet, not an official payer form or submitted request. No AI model, authenticated requirement check, authorization decision or live transmission is connected. Billing readiness is not clinical clearance or an instruction to delay emergency care.';
export function migrateAuthorizationPlanning(db) {
  db.exec(`CREATE UNIQUE INDEX IF NOT EXISTS service_tenant_encounter ON encounter_services(id,org_id,encounter_id);
  CREATE TABLE IF NOT EXISTS authorization_drafts (
    id TEXT PRIMARY KEY, org_id TEXT NOT NULL REFERENCES organizations(id), patient_id TEXT NOT NULL,
    encounter_id TEXT NOT NULL, service_id TEXT NOT NULL REFERENCES encounter_services(id),
    snapshot_json TEXT NOT NULL, created_by TEXT NOT NULL, created_at TEXT NOT NULL,
    FOREIGN KEY(encounter_id,org_id,patient_id) REFERENCES encounters(id,org_id,patient_id),
    FOREIGN KEY(created_by,org_id) REFERENCES users(id,org_id),
    FOREIGN KEY(service_id,org_id,encounter_id) REFERENCES encounter_services(id,org_id,encounter_id)
  );
  CREATE TRIGGER IF NOT EXISTS auth_drafts_no_update BEFORE UPDATE ON authorization_drafts BEGIN SELECT RAISE(ABORT,'Authorization drafts are immutable'); END;
  CREATE TRIGGER IF NOT EXISTS auth_drafts_no_delete BEFORE DELETE ON authorization_drafts BEGIN SELECT RAISE(ABORT,'Authorization drafts are immutable'); END;`);
}
function staff(db, user, encounterId) {
  const u = db.prepare('SELECT * FROM users WHERE id=? AND org_id=? AND active=1').get(user.id,user.org_id);
  if (!u || !['ADMIN','BILLER','PHYSICIAN'].includes(u.role)) throw fail(403,'Authorization planning staff permission required');
  const e = db.prepare('SELECT * FROM encounters WHERE id=? AND org_id=?').get(encounterId,u.org_id);
  if (!e) throw fail(404,'Encounter not found');
  if (u.role==='PHYSICIAN' && u.id!==e.clinician_id) throw fail(403,'Assigned clinician required');
  return { u,e };
}
function transaction(db, work) { db.exec('BEGIN IMMEDIATE');try{const r=work();db.exec('COMMIT');return r}catch(e){db.exec('ROLLBACK');throw e} }
export function draftAuthorization(db,user,b) {
  const {u}=staff(db,user,b?.encounter_id);
  if (b?.reviewed!==true) throw fail(400,'Review the planned service and selected codes first');
  const {e,p,key:original}=coverageContext(db,u,b);
  const proposed=date(b.proposed_service_date);
  if(proposed<now().slice(0,10))throw fail(422,'Proposed service date is past; this worksheet is for pre-service review, not retrospective authorization');
  const key={...original,source_encounter_date:e.date_of_service,service_date:proposed};
  const s=db.prepare('SELECT s.*,n.content AS source_text,n.kind AS source_kind FROM encounter_services s JOIN clinical_sections n ON n.id=s.source_section_id AND n.encounter_id=s.encounter_id WHERE s.id=? AND s.org_id=? AND s.encounter_id=? AND NOT EXISTS(SELECT 1 FROM encounter_services r WHERE r.supersedes_id=s.id)').get(b.service_id,u.org_id,e.id);
  if (!s || s.state!=='ORDERED') throw fail(422,'Select a current clinician-documented order; canceled, discussed or performed services cannot become this pre-service draft');
  const procedure=searchCodes(db,u,{system:key.procedure_system,q:key.procedure_code,service_date:key.service_date});
  const proc=procedure.results.find(c=>c.code===key.procedure_code);
  const dx=searchCodes(db,u,{system:'ICD10CM',q:key.diagnosis_code,service_date:key.service_date}).results.find(c=>c.code===key.diagnosis_code);
  if(!proc||!dx)throw fail(422,'Procedure and diagnosis need an installed date-valid catalog. A licensed CPT import may be needed.');
  const details=JSON.parse(s.details_json);
  const snapshot={context:key,patient:{id:p.id,name:p.name,payer_name:p.payer_name,member_id:p.member_id},
    service:{id:s.id,category:s.category,state:s.state,details,source_section_id:s.source_section_id,source_kind:s.source_kind,source_text:s.source_text},
    selected_codes:{procedure:proc,diagnosis:dx,procedure_release:procedure.source},
    requirement:'UNKNOWN_PAYER_CHECK_REQUIRED',decision:'NOT_REQUESTED',transmitted:false,official_payer_form:false,
    missing_information:[...serviceGaps(s),'Member-specific prior-authorization/referral requirement and dated source','Applicable payer form or authorized electronic submission channel','Payer-required clinical evidence and provider/facility enrollment','Service-specific authorization decision, approved dates, units and reference if required'],
    workflow:'DRAFT_NEEDS_PAYER_REVIEW',ai_model_connected:false,professional_review_required:true,notice};
  return transaction(db,()=>{const id=uid();db.prepare('INSERT INTO authorization_drafts VALUES (?,?,?,?,?,?,?,?)').run(id,u.org_id,p.id,e.id,s.id,JSON.stringify(snapshot),u.id,now());audit(db,u,'DRAFT_PRESERVICE_AUTHORIZATION','authorization_draft',id);return {id,...snapshot}});
}
export function authorizationDrafts(db,user,encounterId) {
  const {u,e}=staff(db,user,encounterId),p=db.prepare('SELECT * FROM patients WHERE id=? AND org_id=?').get(e.patient_id,u.org_id);
  return transaction(db,()=>{
    const rows=db.prepare('SELECT * FROM authorization_drafts WHERE org_id=? AND encounter_id=? ORDER BY rowid DESC').all(u.org_id,e.id);
    const drafts=rows.map(r=>{const snapshot=JSON.parse(r.snapshot_json),c=snapshot.context;
      const current=db.prepare('SELECT 1 FROM encounter_services s WHERE s.id=? AND s.org_id=? AND s.encounter_id=? AND s.state=\'ORDERED\' AND NOT EXISTS(SELECT 1 FROM encounter_services n WHERE n.supersedes_id=s.id)').get(r.service_id,u.org_id,e.id);
      const code=searchCodes(db,u,{system:c.procedure_system,q:c.procedure_code,service_date:c.service_date}).results.find(v=>v.code===c.procedure_code);
      const dx=searchCodes(db,u,{system:'ICD10CM',q:c.diagnosis_code,service_date:c.service_date}).results.find(v=>v.code===c.diagnosis_code);
      return {id:r.id,created_by:r.created_by,created_at:r.created_at,...snapshot,stale:!current||p.member_id!==snapshot.patient.member_id||p.payer_name!==snapshot.patient.payer_name||e.clinician_id!==c.provider_id||e.date_of_service!==c.source_encounter_date||c.service_date<now().slice(0,10)||JSON.stringify(code)!==JSON.stringify(snapshot.selected_codes.procedure)||JSON.stringify(dx)!==JSON.stringify(snapshot.selected_codes.diagnosis)};
    });audit(db,u,'VIEW_AUTHORIZATION_DRAFTS','encounter',e.id);return {drafts,notice};
  });
}
