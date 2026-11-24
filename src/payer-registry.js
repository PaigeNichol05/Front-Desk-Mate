import { uid, audit } from './db.js';
import { date } from './code-coverage.js';
import { PAYER_MONITORING_GROUPS, BILLING_SOURCES } from './billing-sources.js';

export const JURISDICTIONS = Object.freeze('AL AK AZ AR CA CO CT DE DC FL GA HI ID IL IN IA KS KY LA ME MD MA MI MN MS MO MT NE NV NH NJ NM NY NC ND OH OK OR PA RI SC SD TN TX UT VT VA WA WV WI WY AS GU MP PR VI'.split(' '));
export const POLICY_CHECKS = Object.freeze(['MEDICAL','REIMBURSEMENT','CODING','AUTHORIZATION','DOCUMENTATION','FILING','APPEALS']);
export const TRANSACTION_CHECKS = Object.freeze(['ELIGIBILITY','CLAIMS','ACKNOWLEDGMENTS','CLAIM_STATUS','REMITTANCE','AUTHORIZATION','ATTACHMENTS']);
const FIVE_DAYS = 5 * 86400000;
const fail = (s,m) => Object.assign(Error(m),{status:s});
const notice = 'Staff-recorded, exact-scope research only. No payer census is certified complete. No live insurer connection, enrollment validation or member benefits verification is provided. Do not enter patient information, passwords, tokens or licensed code descriptions.';

export function migratePayerRegistry(db) {
  db.exec(`CREATE TABLE IF NOT EXISTS payer_mappings (
    id TEXT PRIMARY KEY, org_id TEXT NOT NULL REFERENCES organizations(id), identity_json TEXT NOT NULL,
    created_by TEXT NOT NULL, created_at TEXT NOT NULL, UNIQUE(id,org_id), UNIQUE(org_id,identity_json),
    FOREIGN KEY(created_by,org_id) REFERENCES users(id,org_id)
  );
  CREATE TABLE IF NOT EXISTS payer_mapping_reviews (
    id TEXT PRIMARY KEY, org_id TEXT NOT NULL, mapping_id TEXT NOT NULL, request_key TEXT NOT NULL,
    payload_json TEXT NOT NULL, created_by TEXT NOT NULL, created_at TEXT NOT NULL,
    UNIQUE(org_id,request_key), FOREIGN KEY(mapping_id,org_id) REFERENCES payer_mappings(id,org_id),
    FOREIGN KEY(created_by,org_id) REFERENCES users(id,org_id)
  );
  CREATE INDEX IF NOT EXISTS payer_reviews_scope ON payer_mapping_reviews(org_id,mapping_id);
  CREATE TRIGGER IF NOT EXISTS payer_mappings_no_update BEFORE UPDATE ON payer_mappings BEGIN SELECT RAISE(ABORT,'Payer mappings are immutable'); END;
  CREATE TRIGGER IF NOT EXISTS payer_mappings_no_delete BEFORE DELETE ON payer_mappings BEGIN SELECT RAISE(ABORT,'Payer mappings are immutable'); END;
  CREATE TRIGGER IF NOT EXISTS payer_reviews_no_update BEFORE UPDATE ON payer_mapping_reviews BEGIN SELECT RAISE(ABORT,'Payer reviews are immutable'); END;
  CREATE TRIGGER IF NOT EXISTS payer_reviews_no_delete BEFORE DELETE ON payer_mapping_reviews BEGIN SELECT RAISE(ABORT,'Payer reviews are immutable'); END;`);
}
function staff(db,user) {
  const u=db.prepare('SELECT * FROM users WHERE id=? AND org_id=? AND active=1').get(user?.id,user?.org_id);
  if(!u||!['BILLER','ADMIN'].includes(u.role))throw fail(403,'Billing staff permission required');
  return u;
}
function tx(db,work) { db.exec('BEGIN IMMEDIATE');try{const r=work();db.exec('COMMIT');return r}catch(e){db.exec('ROLLBACK');throw e} }
function text(b,k,max=200) {if(typeof b?.[k]!=='string'||!b[k].trim()||b[k].length>max)throw fail(400,`Required text: ${k} (maximum ${max})`);return b[k].trim();}
function choice(b,k,values) {const v=text(b,k);if(!values.includes(v))throw fail(400,`Invalid ${k}`);return v;}
function keys(b,allowed) {if(!b||typeof b!=='object'||Array.isArray(b)||Object.keys(b).some(k=>!allowed.includes(k)))throw fail(400,'Unexpected fields');}
function reference(b) {
  const value=text(b,'source_url',1500);let u;try{u=new URL(value)}catch{throw fail(400,'Use an HTTPS source reference')}
  if(u.protocol!=='https:'||u.username||u.password||u.search||u.hash)throw fail(400,'Source references require HTTPS without credentials, query strings or fragments');
  return u.href; // Evidence reference only: this URL is NEVER fetched by this module.
}
export function createPayerRegistry(db,{clock=Date.now}={}) {
  const timestamp=()=>new Date(clock()).toISOString();
  function mapping(u,id) {const m=db.prepare('SELECT * FROM payer_mappings WHERE id=? AND org_id=?').get(id,u.org_id);if(!m)throw fail(404,'Payer mapping not found');return m;}
  function reviews(u,id) {return db.prepare('SELECT * FROM payer_mapping_reviews WHERE org_id=? AND mapping_id=? ORDER BY rowid DESC').all(u.org_id,id).map(r=>({id:r.id,created_by:r.created_by,created_at:r.created_at,...JSON.parse(r.payload_json)}));}
  function observation(u,url) {
    const source=BILLING_SOURCES.find(s=>s.url===url);
    if(!source)return null;
    for(const run of db.prepare('SELECT results_json FROM billing_audit_runs WHERE org_id=? ORDER BY rowid DESC').all(u.org_id)){
      const r=JSON.parse(run.results_json).find(r=>r.id===source.id);if(r)return r;
    }
    return {status:'NOT_CHECKED'};
  }
  function project(u,m,serviceDate) {
    const history=reviews(u,m.id), identity=JSON.parse(m.identity_json);
    const checks=(kind,categories)=>categories.map(category=>{
      // A later failure overrides older positive observations. Future policies do not replace today's applicable version.
      const r=history.find(r=>r.kind===kind&&r.category===category&&(!r.effective_from||r.effective_from<=serviceDate&&(!r.effective_until||r.effective_until>=serviceDate)));
      const fresh=r&&clock()-Date.parse(r.created_at)>=0&&clock()-Date.parse(r.created_at)<FIVE_DAYS;
      const observed=r&&observation(u,r.source_url);
      const monitor= !observed?'REFERENCE_ONLY':observed.status==='CHECK_FAILED'?'SOURCE_INACCESSIBLE'
        :!observed.sha256||!r.source_sha256?'MONITOR_NOT_CHECKED'
        :observed.sha256!==r.source_sha256?'SOURCE_CHANGED_REVIEW_REQUIRED'
        :!Number.isFinite(Date.parse(observed.checked_at))||clock()-Date.parse(observed.checked_at)<0||clock()-Date.parse(observed.checked_at)>=FIVE_DAYS?'SOURCE_STALE':'FINGERPRINT_MATCH';
      const status=!r?'NOT_CHECKED':!fresh?'STALE':r.status;
      const resolved=fresh&&['REFERENCE_ONLY','FINGERPRINT_MATCH'].includes(monitor)&&(kind==='POLICY'?r.status==='CHECKED':['SUPPORTED','NOT_SUPPORTED','ENROLLMENT_REQUIRED'].includes(r.status));
      return {category,status,monitor,resolved:!!resolved,review:r||null};
    });
    const policies=checks('POLICY',POLICY_CHECKS),transactions=checks('TRANSACTION',TRANSACTION_CHECKS);
    const outstanding=[...policies.filter(c=>!c.resolved).map(c=>`POLICY:${c.category}`),...transactions.filter(c=>!c.resolved).map(c=>`TRANSACTION:${c.category}`)];
    const enrollment=transactions.filter(c=>c.status!=='NOT_SUPPORTED'&&(!c.review||!['NOT_REQUIRED','STAFF_CONFIRMED'].includes(c.review.enrollment_status))).map(c=>c.category);
    return {id:m.id,...identity,service_date:serviceDate,policies,transactions,outstanding,enrollment_gaps:enrollment,
      status:outstanding.length?'REVIEW_HOLD':'SCOPED_REVIEWS_RECORDED',history,
      live_connection:'DISABLED',member_benefits:'NOT_VERIFIED',notice};
  }
  return {
    create(user,b) {
      const u=staff(db,user);keys(b,['payer_name','group_id','product','jurisdiction','vendor','payer_id','provider_context','service_scope','reviewed']);
      if(b.reviewed!==true)throw fail(400,'Confirm exact payer identity and scope');
      const identity={payer_name:text(b,'payer_name'),group_id:choice(b,'group_id',PAYER_MONITORING_GROUPS.map(g=>g.id)),product:text(b,'product'),jurisdiction:choice(b,'jurisdiction',[...JURISDICTIONS,'NATIONAL']),vendor:text(b,'vendor'),payer_id:text(b,'payer_id',100),provider_context:text(b,'provider_context'),service_scope:text(b,'service_scope',1000)};
      const encoded=JSON.stringify(identity);
      return tx(db,()=>{
        const existing=db.prepare('SELECT * FROM payer_mappings WHERE org_id=? AND identity_json=?').get(u.org_id,encoded);
        if(existing)return {duplicate:true,mapping:project(u,existing,timestamp().slice(0,10))};
        const id=uid();db.prepare('INSERT INTO payer_mappings(id,org_id,identity_json,created_by,created_at) VALUES (?,?,?,?,?)').run(id,u.org_id,encoded,u.id,timestamp());audit(db,u,'CREATE_PAYER_MAPPING','payer_mapping',id);
        return {duplicate:false,mapping:project(u,mapping(u,id),timestamp().slice(0,10))};
      });
    },
    record(user,id,b) {
      const u=staff(db,user);mapping(u,id);
      keys(b,['kind','category','status','source_url','source_reference','published_on','effective_from','effective_until','notes','enrollment_status','enrollment_reference','request_key','expected_latest_id','reviewed']);
      if(b.reviewed!==true)throw fail(400,'Staff review confirmation required');
      const kind=choice(b,'kind',['POLICY','TRANSACTION']),category=choice(b,'category',kind==='POLICY'?POLICY_CHECKS:TRANSACTION_CHECKS);
      const status=choice(b,'status',kind==='POLICY'?['CHECKED','CHANGED','INACCESSIBLE','UNMAPPED','NOT_CHECKED']:['SUPPORTED','NOT_SUPPORTED','ENROLLMENT_REQUIRED','UNKNOWN','INACCESSIBLE']);
      const payload={kind,category,status,source_url:reference(b),source_reference:text(b,'source_reference',500),notes:text(b,'notes',3000)};
      if(b.published_on)payload.published_on=date(b.published_on);
      if(payload.published_on>timestamp().slice(0,10))throw fail(400,'Publication date cannot be in the future');
      if(kind==='POLICY'&&['CHECKED','CHANGED'].includes(status)) {
        payload.effective_from=date(b.effective_from);
        payload.effective_until=b.effective_until?date(b.effective_until):null;
        if(payload.effective_until&&payload.effective_until<payload.effective_from)throw fail(400,'Invalid effective interval');
      }
      if(kind==='TRANSACTION'){
        payload.enrollment_status=choice(b,'enrollment_status',['UNKNOWN','REQUIRED_PENDING','NOT_REQUIRED','STAFF_CONFIRMED']);
        payload.enrollment_reference=payload.enrollment_status==='STAFF_CONFIRMED'?text(b,'enrollment_reference',500):'';
        if(status==='ENROLLMENT_REQUIRED'&&payload.enrollment_status==='NOT_REQUIRED')throw fail(400,'Enrollment requirement conflicts with enrollment status');
      }
      const requestKey=text(b,'request_key',100);
      return tx(db,()=>{
        const existing=db.prepare('SELECT * FROM payer_mapping_reviews WHERE org_id=? AND request_key=?').get(u.org_id,requestKey);
        if(existing){const old=JSON.parse(existing.payload_json);delete old.source_sha256;if(existing.mapping_id!==id||JSON.stringify(old)!==JSON.stringify(payload))throw fail(409,'Request key already used for different evidence');return {duplicate:true,id:existing.id};}
        const latest=reviews(u,id).find(r=>r.kind===kind&&r.category===category)?.id||null;
        if(b.expected_latest_id!==latest)throw fail(409,'Evidence changed; refresh and review the latest record');
        const observed=observation(u,payload.source_url);
        payload.source_sha256=observed?.status!=='CHECK_FAILED'?observed?.sha256||null:null;
        const reviewId=uid();db.prepare('INSERT INTO payer_mapping_reviews(id,org_id,mapping_id,request_key,payload_json,created_by,created_at) VALUES (?,?,?,?,?,?,?)').run(reviewId,u.org_id,id,requestKey,JSON.stringify(payload),u.id,timestamp());audit(db,u,'RECORD_PAYER_REVIEW','payer_mapping_review',reviewId);
        return {duplicate:false,id:reviewId};
      });
    },
    view(user,{service_date}={}) {
      const u=staff(db,user),day=service_date?date(service_date):timestamp().slice(0,10);
      return tx(db,()=>{
        const mappings=db.prepare('SELECT * FROM payer_mappings WHERE org_id=? ORDER BY rowid DESC').all(u.org_id).map(m=>project(u,m,day));
        audit(db,u,'VIEW_PAYER_REGISTRY','organization',u.org_id);
        return {notice,all_payers_complete:false,live_connection:'DISABLED',member_benefits:'NOT_VERIFIED',policy_categories:POLICY_CHECKS,transaction_categories:TRANSACTION_CHECKS,
          groups:PAYER_MONITORING_GROUPS.map(g=>({id:g.id,name:g.name,mapping_count:mappings.filter(m=>m.group_id===g.id).length,status:'CENSUS_NOT_VERIFIED'})),
          jurisdictions:JURISDICTIONS.map(j=>({jurisdiction:j,medicaid_chip_agency:'CENSUS_NOT_VERIFIED',mco_inventory:'CENSUS_NOT_VERIFIED',mapping_count:mappings.filter(m=>m.jurisdiction===j&&m.group_id==='MEDICAID').length})),mappings};
      });
    }
  };
}
