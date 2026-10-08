import { uid, now, audit } from './db.js';
import { queueClaim } from './clearinghouse.js';

export function documentationChecks(db, encounter, lines) {
  if(!Array.isArray(lines))return ['Claim lines must be an array.'];
  const sections=db.prepare('SELECT kind FROM clinical_sections WHERE encounter_id=?').all(encounter.id).map(x=>x.kind);
  const issues=[];
  if(!encounter.signed_at) issues.push('Encounter must be signed by the clinician.');
  for(const kind of ['ASSESSMENT','PLAN']) if(!sections.includes(kind)) issues.push(`${kind} documentation is missing.`);
  if(!lines.length) issues.push('At least one reviewed procedure and diagnosis line is required.');
  const patient=db.prepare('SELECT * FROM patients WHERE id=?').get(encounter.patient_id);
  if(!patient?.payer_name || !patient?.member_id) issues.push('Payer and member ID are required.');
  if(!Number.isSafeInteger(lines.reduce((sum,l)=>sum+(l?.units*l?.charge_cents),0))) issues.push('Total charge is invalid.');
  for (const line of lines) {
    if(!line||typeof line!=='object'){issues.push('Invalid claim line.');continue;}
    if(!['CPT','HCPCS'].includes(line.procedure_system||'CPT')) issues.push('Unsupported procedure system.');
    if(typeof line.diagnosis_code!=='string'||!/^[A-Z0-9.]{3,8}$/.test(line.diagnosis_code||'')) issues.push('Diagnosis code format needs review.');
    if(typeof line.procedure_code!=='string'||!/^[A-Z0-9]{4,7}$/.test(line.procedure_code||'')) issues.push('Procedure code format needs review.');
    if(!Number.isSafeInteger(line.units)||line.units<1||!Number.isSafeInteger(line.charge_cents)||line.charge_cents<0||!Number.isSafeInteger(line.units*line.charge_cents)) issues.push('Units or charge is invalid.');
    if(line.modifier!=null&&(typeof line.modifier!=='string'||line.modifier.length>20||(line.modifier&&!/^[A-Z0-9]{2}(,[A-Z0-9]{2})*$/.test(line.modifier)))) issues.push('Modifier format needs review.');
    if(line.authorization_id!=null&&(typeof line.authorization_id!=='string'||line.authorization_id.length>100)){issues.push('Invalid authorization ID.');continue;}
    if(line.authorization_id) {
      const a=db.prepare('SELECT * FROM authorizations WHERE id=? AND org_id=? AND patient_id=?').get(line.authorization_id,encounter.org_id,encounter.patient_id);
      if(!a || a.status!=='APPROVED' || a.procedure_code!==line.procedure_code || (a.starts_on && a.starts_on>encounter.date_of_service) || (a.ends_on && a.ends_on<encounter.date_of_service)) issues.push('Authorization does not match the patient, procedure, date, and approved status.');
    }
  }
  return [...new Set(issues)];
}
export function checkout(db, user, encounterId, lines) {
  const encounter=db.prepare('SELECT * FROM encounters WHERE id=? AND org_id=?').get(encounterId,user.org_id);
  if(!encounter) throw Object.assign(new Error('Encounter not found'),{status:404});
  if(encounter.status==='CHECKED_OUT') throw Object.assign(new Error('Encounter already checked out'),{status:409});
  const issues=documentationChecks(db,encounter,lines);
  if(issues.length) throw Object.assign(new Error('Validation failed'),{status:422,issues});
  const patient=db.prepare('SELECT * FROM patients WHERE id=?').get(encounter.patient_id);
  const claimId=uid(), timestamp=now();
  db.exec('BEGIN IMMEDIATE');
  try {
    db.prepare('INSERT INTO claims VALUES (?,?,?,?,?,?,?,?,?,?,?)').run(claimId,user.org_id,encounterId,patient.id,patient.payer_name,patient.member_id,'AWAITING_CONNECTOR',lines.reduce((a,x)=>a+x.units*x.charge_cents,0),null,timestamp,timestamp);
    for(const l of lines) db.prepare('INSERT INTO claim_lines VALUES (?,?,?,?,?,?,?,?,?)').run(uid(),claimId,l.procedure_system||'CPT',l.procedure_code,l.modifier||null,l.diagnosis_code,l.units,l.charge_cents,l.authorization_id||null);
    db.prepare("UPDATE encounters SET status='CHECKED_OUT',checked_out_at=? WHERE id=?").run(timestamp,encounterId);
    db.prepare('INSERT INTO claim_events VALUES (?,?,?,?,?)').run(uid(),claimId,'QUEUED','Validated at checkout; awaiting configured clearinghouse connector. No payer transmission has occurred.',timestamp);
    queueClaim(db,db.prepare('SELECT * FROM claims WHERE id=?').get(claimId),lines);
    audit(db,user,'CHECKOUT','claim',claimId);
    db.exec('COMMIT');
  } catch(e){db.exec('ROLLBACK');throw e;}
  return db.prepare('SELECT * FROM claims WHERE id=?').get(claimId);
}
