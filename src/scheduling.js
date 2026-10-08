import { uid, now, audit } from './db.js';
const fail=(status,message)=>Object.assign(new Error(message),{status});
export function createScheduling(db) {
  db.exec(`CREATE TABLE IF NOT EXISTS appointment_details (
    appointment_id TEXT PRIMARY KEY REFERENCES appointments(id),
    duration_minutes INTEGER NOT NULL DEFAULT 30,
    visit_type TEXT NOT NULL DEFAULT 'Follow-up',
    updated_at TEXT NOT NULL);
    CREATE INDEX IF NOT EXISTS appointment_org_time ON appointments(org_id, starts_at);`);
  const staff=u=>{if(!['PHYSICIAN','ADMIN','BILLER'].includes(u.role))throw fail(403,'Staff access required');};
  const types=['New visit','Follow-up','Office injection','Office procedure','Surgery center','Telehealth'];
  function list(u) {staff(u);return db.prepare(`SELECT a.*, p.name patient_name, p.mrn,
    c.name clinician_name, COALESCE(d.duration_minutes,30) duration_minutes,
    COALESCE(d.visit_type,'Follow-up') visit_type FROM appointments a
    JOIN patients p ON p.id=a.patient_id AND p.org_id=a.org_id
    LEFT JOIN users c ON c.id=a.clinician_id AND c.org_id=a.org_id
    LEFT JOIN appointment_details d ON d.appointment_id=a.id
    WHERE a.org_id=? ORDER BY a.starts_at`).all(u.org_id);}
  function save(u,b,id=null) {
    staff(u);
    const old=id?db.prepare('SELECT * FROM appointments WHERE id=? AND org_id=?').get(id,u.org_id):null;
    if(id&&!old)throw fail(404,'Appointment not found');
    if(old&&old.status!=='SCHEDULED')throw fail(409,'Only scheduled appointments can be rescheduled');
    const patientId=old?.patient_id||b.patient_id;
    if(!db.prepare('SELECT id FROM patients WHERE id=? AND org_id=?').get(patientId||'',u.org_id))throw fail(400,'Select a patient in this practice');
    if(!db.prepare("SELECT id FROM users WHERE id=? AND org_id=? AND role='PHYSICIAN' AND active=1").get(b.clinician_id||'',u.org_id))throw fail(400,'Select an active clinician in this practice');
    if(typeof b.starts_at!=='string'||!/(Z|[+-]\d{2}:\d{2})$/.test(b.starts_at)||!Number.isFinite(Date.parse(b.starts_at)))throw fail(400,'Appointment time must include a time zone');
    const start=Date.parse(b.starts_at), duration=b.duration_minutes;
    if(start<Date.now())throw fail(400,'Select a future appointment time');
    if(!Number.isInteger(duration)||duration<5||duration>480)throw fail(400,'Duration must be 5–480 minutes');
    if(!types.includes(b.visit_type))throw fail(400,'Select a supported visit type');
    db.exec('BEGIN IMMEDIATE');
    try {
      const conflict=list(u).some(a=>a.id!==id&&!['CANCELLED','COMPLETED'].includes(a.status)&&(a.clinician_id===b.clinician_id||a.patient_id===patientId)&&Date.parse(a.starts_at)<start+duration*60000&&Date.parse(a.starts_at)+a.duration_minutes*60000>start);
      if(conflict)throw fail(409,'This patient or clinician already has an overlapping appointment. Choose another time.');
      const key=id||uid();
      if(id)db.prepare('UPDATE appointments SET clinician_id=?,starts_at=? WHERE id=? AND org_id=?').run(b.clinician_id,new Date(start).toISOString(),id,u.org_id);
      else db.prepare('INSERT INTO appointments VALUES (?,?,?,?,?,?)').run(key,u.org_id,patientId,b.clinician_id,new Date(start).toISOString(),'SCHEDULED');
      db.prepare(`INSERT INTO appointment_details VALUES (?,?,?,?) ON CONFLICT(appointment_id) DO UPDATE SET duration_minutes=excluded.duration_minutes,visit_type=excluded.visit_type,updated_at=excluded.updated_at`).run(key,duration,b.visit_type,now());
      audit(db,u,id?'RESCHEDULE_APPOINTMENT':'BOOK_APPOINTMENT','appointment',key);
      db.exec('COMMIT');return {id:key,status:'SCHEDULED'};
    } catch(e){db.exec('ROLLBACK');throw e;}
  }
  function transition(u,id,action) {
    staff(u);db.exec('BEGIN IMMEDIATE');
    try {
      const a=db.prepare('SELECT * FROM appointments WHERE id=? AND org_id=?').get(id,u.org_id);
      if(!a)throw fail(404,'Appointment not found');
      const rule={cancel:['SCHEDULED','CANCELLED'],'check-in':['SCHEDULED','CHECKED_IN'],room:['CHECKED_IN','ROOMED'] }[action];
      if(!rule||a.status!==rule[0])throw fail(409,'This action is not available for the current appointment status');
      db.prepare('UPDATE appointments SET status=? WHERE id=? AND org_id=?').run(rule[1],id,u.org_id);
      let encounterId=null;
      if(action==='check-in') {
        const existing=db.prepare('SELECT id FROM encounters WHERE appointment_id=? AND org_id=?').get(id,u.org_id);
        encounterId=existing?.id||uid();
        if(!existing)db.prepare('INSERT INTO encounters (id,org_id,patient_id,clinician_id,appointment_id,date_of_service) VALUES (?,?,?,?,?,?)').run(encounterId,u.org_id,a.patient_id,a.clinician_id,id,new Intl.DateTimeFormat('en-CA',{timeZone:process.env.PRACTICE_TIMEZONE||'America/Denver',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(a.starts_at)));
      }
      audit(db,u,rule[1],'appointment',id);db.exec('COMMIT');return {id,status:rule[1],encounter_id:encounterId};
    }catch(e){db.exec('ROLLBACK');throw e;}
  }
  return {list,save,transition,types};
}
