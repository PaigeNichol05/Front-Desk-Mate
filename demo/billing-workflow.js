// Fixed fictional fixtures. No payer policy, coding advice, or clinical inference.
export const documents = [
  {id:'note-01',patient:'sample-01',title:'Signed visit note',date:'2026-09-18',author:'Dr. Avery Demo',text:'Fictional pain-management follow-up. Assessment and plan recorded.',kind:'note'},
  {id:'report-01',patient:'sample-01',title:'Spine imaging report',date:'2026-09-10',author:'Sample Imaging',text:'Fictional report attached for this sample visit.',kind:'imaging'},
  {id:'auth-01',patient:'sample-01',title:'Authorization reference',date:'2026-09-12',author:'Sample billing team',text:'DEMO-AUTH-101. Simulated only; not insurer approval.',kind:'authorization'},
  {id:'other-01',patient:'sample-02',title:'Other patient treatment history',date:'2026-09-15',author:'Sample care team',text:'Must never appear in Jordan’s packet.',kind:'history'}
];
export function initialWorkflow(){return {role:'BILLER',provider:'Physician',searched:false,task:false,addendum:false,selected:['note-01','report-01','auth-01'],prepared:false,reviewed:false};}
export function chartSearch(state){if(!['BILLER','PHYSICIAN'].includes(state.role))throw new Error('Staff chart access required');return documents.filter(d=>d.patient==='sample-01').concat(state.addendum?[{id:'addendum-01',patient:'sample-01',title:'Dated clinician addendum',date:'2026-10-04',author:'Dr. Avery Demo',text:'FICTIONAL FIXTURE: previously documented treatment history verified in this sample. Original signed note unchanged.',kind:'history'}]:[]);}
export function packet(state){if(state.role!=='BILLER'||!state.searched||!state.addendum)throw new Error('Billing review and supporting evidence required');const records=chartSearch(state).filter(d=>state.selected.includes(d.id));if(!records.some(d=>d.kind==='history'))throw new Error('Treatment-history evidence not selected');return {type:'FICTIONAL_RECONSIDERATION_PREVIEW',patient:'Jordan Sample',claim:'DEMO-0001',payer:'Example Health Plan · demonstration only',plan:'Sample PPO · fictional',serviceDate:'2026-09-18',provider:state.provider,reason:'Sample denial: supporting treatment-history documentation requested.',request:'Please review the sample claim with the attached fictional supporting records.',attachments:records.map(({id,title,date,author})=>({id,title,date,author})),status:'DRAFT — NOT SUBMITTED',notice:'App-generated demo preview. Not an official insurer form; no live policy or coverage verification.'};}
export function transition(state,action){const s=structuredClone(state);s.prepared=false;s.reviewed=false;
  if(action==='search'){chartSearch(s);s.searched=true;}
  else if(action==='task'){if(s.role!=='BILLER'||!s.searched)throw new Error('Search the chart first');s.task=true;}
  else if(action==='addendum'){if(s.role!=='PHYSICIAN'||!s.task)throw new Error('Assigned clinician task required');s.addendum=true;if(!s.selected.includes('addendum-01'))s.selected.push('addendum-01');}
  else if(action==='prepare'){packet(s);s.prepared=true;}
  else if(action==='review'){if(!state.prepared||s.role!=='BILLER')throw new Error('Prepare packet first');packet(s);s.prepared=true;s.reviewed=true;}
  else throw new Error('Unknown action');
  return s;
}
