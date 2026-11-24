import test from 'node:test';
import assert from 'node:assert/strict';
import {mountPayerRegistry} from '../public/payer-registry.js';
test('payer worklist escapes evidence, leaves unknown benefits visible and never fetches a saved source URL',async()=>{
  const calls=[],nodes=new Map(),target={isConnected:true,innerHTML:'',querySelector(k){if(!nodes.has(k))nodes.set(k,{});return nodes.get(k)},querySelectorAll(){return []}};
  const malicious='<img src=x onerror=alert(1)>',r={id:'review',created_at:'2026-11-24',created_by:'Staff',kind:'POLICY',category:'MEDICAL',status:'CHECKED',source_url:'https://example.test/policy',source_reference:malicious,notes:malicious};
  const data={notice:'Staff research only',jurisdictions:[{jurisdiction:'CO',mapping_count:1}],groups:[{id:'MEDICAID',name:'Medicaid',mapping_count:1}],policy_categories:['MEDICAL'],transaction_categories:['CLAIMS'],mappings:[{id:'one',payer_name:malicious,product:'Fictional plan',jurisdiction:'CO',status:'REVIEW_HOLD',vendor:'Vendor',payer_id:'00540',provider_context:'Practice',service_scope:malicious,service_date:'2026-11-24',outstanding:['CLAIMS'],enrollment_gaps:['CLAIMS'],policies:[{category:'MEDICAL',status:'CHECKED',monitor:'REFERENCE_ONLY',review:r}],transactions:[{category:'CLAIMS',status:'NOT_CHECKED',monitor:'REFERENCE_ONLY'}],history:[r]}]};
  await mountPayerRegistry(target,async url=>{calls.push(url);return data},()=>{});
  assert.deepEqual(calls,['/billing/payer-registry']);
  assert(!target.innerHTML.includes(malicious));assert(target.innerHTML.includes('&lt;img'));
  assert(target.innerHTML.includes('Member benefits: not verified'));assert(target.innerHTML.includes('Live connection: disabled'));
  assert(target.innerHTML.includes('00540'));assert(target.innerHTML.includes('Immutable evidence history (1)'));
  assert.equal(typeof nodes.get('[data-create]').onsubmit,'function');
});
test('a disconnected worklist does not write HTML after a request resolves',async()=>{
  const target={isConnected:false,innerHTML:'unchanged'};
  await mountPayerRegistry(target,async()=>({}),()=>{});assert.equal(target.innerHTML,'unchanged');
});
