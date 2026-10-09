// Product/code identities are sourced from CMS A57185; billing denominators from the
// bundled CMS October 2026 HCPCS public-use release. No cross-product potency conversion.
export const TOXIN_PRODUCTS=Object.freeze({
 BOTOX:{brand:'BOTOX',ingredient:'onabotulinumtoxinA',toxin_type:'A',hcpcs_code:'J0585',dose_units_per_billing_unit:1},
 DYSPORT:{brand:'DYSPORT',ingredient:'abobotulinumtoxinA',toxin_type:'A',hcpcs_code:'J0586',dose_units_per_billing_unit:5},
 MYOBLOC:{brand:'MYOBLOC',ingredient:'rimabotulinumtoxinB',toxin_type:'B',hcpcs_code:'J0587',dose_units_per_billing_unit:100},
 XEOMIN:{brand:'XEOMIN',ingredient:'incobotulinumtoxinA',toxin_type:'A',hcpcs_code:'J0588',dose_units_per_billing_unit:1},
 DAXXIFY:{brand:'DAXXIFY',ingredient:'daxibotulinumtoxinA-lanm',toxin_type:'A',hcpcs_code:'J0589',dose_units_per_billing_unit:1}
});
export const TOXIN_SOURCES={identity:'https://www.cms.gov/medicare-coverage-database/view/article.aspx?articleId=57185',billing_units:'https://www.cms.gov/files/zip/october-2026-alpha-numeric-hcpcs-file.zip',waste:'https://www.cms.gov/medicare/payment/part-b-drugs/discarded-drugs',noninterchangeability:'https://dailymed.nlm.nih.gov/dailymed/drugInfo.cfm?setid=33d066a9-34ff-4a1a-b38b-d10983df3300'};
const fail=message=>Object.assign(Error(message),{status:400});
function text(v,name,max=1000){if(v==null||v==='')return '';if(typeof v!=='string'||v.length>max)throw fail(`Invalid toxin ${name}`);return v.trim()}
function amount(v,name){if(v==null||v==='')return null;if(typeof v!=='number'||!Number.isFinite(v)||v<0||v>10000000||Math.abs(v*1000-Math.round(v*1000))>0.000001)throw fail(`Invalid ${name}; use nonnegative units with at most three decimal places`);return v}
function choice(v,options,name){const s=v||'UNKNOWN';if(!options.includes(s))throw fail(`Invalid toxin ${name}`);return s}
function date(v,name){if(!v)return '';if(typeof v!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(v)||!Number.isFinite(Date.parse(v+'T00:00:00Z'))||new Date(v+'T00:00:00Z').toISOString().slice(0,10)!==v)throw fail(`Invalid ${name}`);return v}
export function normalizeToxin(b){
 if(!b||typeof b!=='object'||Array.isArray(b))throw fail('Botulinum-toxin record is required');
 const productKey=b.product_key||'UNKNOWN';if(typeof productKey!=='string'||productKey!=='UNKNOWN'&&!Object.hasOwn(TOXIN_PRODUCTS,productKey))throw fail('Unknown toxin product; use manual clarification');
 const product=TOXIN_PRODUCTS[productKey]||null;
 if(b.vials!=null&&(!Array.isArray(b.vials)||b.vials.length>50))throw fail('Record up to 50 individual vials');if(b.sites!=null&&(!Array.isArray(b.sites)||b.sites.length>200))throw fail('Record up to 200 individual sites');
 const vials=(b.vials||[]).map(v=>{if(!v||typeof v!=='object')throw fail('Invalid vial');return {label_units:amount(v.label_units,'vial strength'),ndc:text(v.ndc,'NDC',100),lot:text(v.lot,'lot',100),expires_on:date(v.expires_on,'vial expiry'),container_type:choice(v.container_type,['UNKNOWN','SINGLE_DOSE','MULTI_DOSE'],'container type'),preparation:choice(v.preparation,['UNKNOWN','RECONSTITUTED','READY_TO_USE'],'preparation'),solution_volume_ml:amount(v.solution_volume_ml,'solution volume'),diluent:text(v.diluent,'diluent',200),preparation_reference:text(v.preparation_reference,'preparation reference',500)}});
 const sites=(b.sites||[]).map(s=>{if(!s||typeof s!=='object')throw fail('Invalid site');const count=s.injection_count==null||s.injection_count===''?null:s.injection_count;if(count!==null&&(!Number.isSafeInteger(count)||count<1||count>1000))throw fail('Invalid injection count');return {site:text(s.site,'muscle/site',200),laterality:text(s.laterality,'site laterality',100),units:amount(s.units,'site dose'),injection_count:count}});
 return {product_key:productKey,product,other_product:text(b.other_product,'other product',200),purpose:choice(b.purpose,['UNKNOWN','MEDICAL','COSMETIC','MIXED'],'purpose'),supply_source:choice(b.supply_source,['UNKNOWN','CLINIC_PURCHASED','PATIENT_SUPPLIED','SAMPLE','OTHER'],'supply source'),vials,sites,discarded_units:amount(b.discarded_units,'discarded units'),remaining_units:amount(b.remaining_units,'remaining units'),other_use_units:amount(b.other_use_units,'other-use units'),discard_reason:text(b.discard_reason,'discard reason',1000),discard_reference:text(b.discard_reference,'discard documentation reference',500),other_use_reference:text(b.other_use_reference,'other-use documentation',1000),necessity:text(b.necessity,'medical necessity',3000),treatment_history:choice(b.treatment_history,['UNKNOWN','INITIAL','REPEAT'],'treatment history'),previous_treatment_on:date(b.previous_treatment_on,'previous treatment date'),previous_response:text(b.previous_response,'previous response / treatment failures',2000),frequency_plan:text(b.frequency_plan,'treatment frequency plan',1000),consent_reference:text(b.consent_reference,'consent reference',500),guidance:choice(b.guidance,['UNKNOWN','NONE','EMG','ULTRASOUND','OTHER'],'guidance'),guidance_reason:text(b.guidance_reason,'guidance reason',1000),adverse_events:text(b.adverse_events,'tolerance / adverse events',1000),waste_policy:choice(b.waste_policy,['UNKNOWN','MEDICARE_SINGLE_DOSE_REVIEWED','OTHER_PAYER_REVIEWED'],'waste-policy review'),waste_policy_reference:text(b.waste_policy_reference,'payer waste-policy reference',1000),sources:TOXIN_SOURCES};
}
const micro=v=>Math.round((v||0)*1000);
export function toxinAssessment(t,serviceDate){
 const gaps=[],policyGaps=[],vialUnits=t.vials.reduce((a,v)=>a+micro(v.label_units),0)/1000,admin=t.sites.reduce((a,s)=>a+micro(s.units),0)/1000;
 if(!t.product)gaps.push('Confirm actual brand, toxin ingredient and billing identity; no default Botox substitution');
 if(t.purpose!=='MEDICAL')gaps.push('Medical/cosmetic use and billing allocation need review; no insured benefit inferred');
 if(t.supply_source!=='CLINIC_PURCHASED')gaps.push('Drug acquisition/supply source needs payer billing review');
 if(!t.vials.length)gaps.push('Individual vial strength, NDC, lot, expiry and preparation');
 for(const [i,v] of t.vials.entries()){if(!v.label_units||!v.ndc||!v.lot||!v.expires_on||!v.preparation_reference||!v.solution_volume_ml||v.preparation==='UNKNOWN'||v.container_type==='UNKNOWN'||v.preparation==='RECONSTITUTED'&&!v.diluent)gaps.push(`Complete product/preparation trace for vial ${i+1}`);if(v.expires_on&&v.expires_on<serviceDate)gaps.push(`Vial ${i+1} expiry precedes the service date; clinician review required`)}
 if(!t.sites.length)gaps.push('Injection site/muscle, laterality, units and injection count');
 for(const [i,s] of t.sites.entries())if(!s.site||!s.laterality||!s.units||!s.injection_count)gaps.push(`Complete injection site ${i+1}`);
 if([t.discarded_units,t.remaining_units,t.other_use_units].some(v=>v===null))gaps.push('Explicit discarded, remaining and other-use unit totals, including zero');
 const balanced= [t.discarded_units,t.remaining_units,t.other_use_units].every(v=>v!==null)&&micro(vialUnits)===micro(admin)+micro(t.discarded_units)+micro(t.remaining_units)+micro(t.other_use_units);
 if(!balanced)gaps.push('Reconcile opened-vial units with administered, discarded, remaining and other-use units');
 if(t.discarded_units>0&&(!t.discard_reason||!t.discard_reference))gaps.push('Reason for unavoidable discard and wastage documentation reference');
 if(t.remaining_units>0||t.other_use_units>0)gaps.push('Remaining/other-use drug needs allocation review; it cannot be called discarded waste');
 if(t.other_use_units>0&&!t.other_use_reference)gaps.push('Explain the actual use of units allocated outside this treatment');
 if(!t.necessity||t.treatment_history==='UNKNOWN'||!t.previous_response||!t.frequency_plan)gaps.push('Medical necessity, prior/initial treatment evidence, response and frequency plan');
 if(t.treatment_history==='REPEAT'&&!t.previous_treatment_on)gaps.push('Previous treatment date');
 if(t.previous_treatment_on&&t.previous_treatment_on>=serviceDate)gaps.push('Previous treatment date must precede this service');
 if(!t.consent_reference||t.guidance==='UNKNOWN'||!t.adverse_events)gaps.push('Consent, guidance technique or explicitly none, and tolerance/adverse events');
 if(['EMG','ULTRASOUND','OTHER'].includes(t.guidance)&&!t.guidance_reason)gaps.push('Clinical reason and source evidence for guidance; no extra procedure auto-billed');
 if(t.waste_policy==='UNKNOWN'||!t.waste_policy_reference)policyGaps.push('Staff review of this payer’s wastage policy and applicability');
 if(t.waste_policy==='MEDICARE_SINGLE_DOSE_REVIEWED'&&t.vials.some(v=>v.container_type!=='SINGLE_DOSE'))policyGaps.push('Medicare single-dose wastage review does not match all vial types');
 const factor=t.product?.dose_units_per_billing_unit||null,adminBilling=factor?admin/factor:null,wasteBilling=factor&&t.discarded_units!==null?t.discarded_units/factor:null;
 if(factor&&(!Number.isSafeInteger(adminBilling)||!Number.isSafeInteger(wasteBilling)))gaps.push('Fractional HCPCS billing units need payer-specific rounding review; no automatic rounding');
 return {gaps:[...new Set(gaps)],policy_gaps:policyGaps,opened_vial_units:vialUnits,administered_units:admin,discarded_units:t.discarded_units,remaining_units:t.remaining_units,other_use_units:t.other_use_units,balanced,administered_billing_units:adminBilling,discarded_billing_units:wasteBilling,hcpcs_code:t.product?.hcpcs_code||null,dose_units_per_billing_unit:factor,notice:'Product-specific potency units are not interchangeable. Billing denominator arithmetic is not dose conversion or a treatment recommendation. JW/JZ applicability is payer- and setting-specific; no insurer acceptance is guaranteed.'};
}
export function toxinLineError(t,assessment,b){
 if(!t?.product||(assessment.gaps.length||assessment.policy_gaps.length))return 'Complete the reconciled administration record and payer-specific wastage review before drug coding.';
 if(b.procedure_code!==t.product.hcpcs_code)return 'HCPCS toxin code does not match the recorded product; potency units cannot be converted between brands.';
 const component=b.drug_component;if(!['ADMINISTERED','DISCARDED'].includes(component))return 'Choose administered drug or documented discarded drug as separate billing components.';
 const expected=component==='ADMINISTERED'?assessment.administered_billing_units:assessment.discarded_billing_units;if(!Number.isSafeInteger(expected)||expected<1||b.units!==expected)return 'Billing units must match the selected component and product descriptor. Fractional/rounded units require a separate payer rule implementation.';
 const modifiers=(b.modifier||'').split(',');
 if(component==='ADMINISTERED'&&modifiers.includes('JW')||component==='DISCARDED'&&modifiers.includes('JZ'))return 'Discarded and administered drug modifiers cannot be interchanged.';
 if(component==='ADMINISTERED'&&t.discarded_units>0&&modifiers.includes('JZ'))return 'JZ cannot attest zero discard when discard is documented.';
 if(t.waste_policy==='MEDICARE_SINGLE_DOSE_REVIEWED'){
  if(component==='DISCARDED'&&!modifiers.includes('JW'))return 'Reviewed Medicare single-dose discard component needs JW.';
  if(component==='ADMINISTERED'&&t.discarded_units===0&&!modifiers.includes('JZ'))return 'Reviewed Medicare single-dose zero-discard component needs JZ.';
  if(component==='ADMINISTERED'&&t.discarded_units>0&&modifiers.includes('JZ'))return 'JZ cannot attest zero discard when discard is documented.';
 }
 return null;
}
