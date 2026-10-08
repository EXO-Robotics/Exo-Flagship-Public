import {sourceIdentifier} from '../part-identity.js?v=purchase-1';
const storageNamespace=globalThis.document?.documentElement?.dataset.storageNamespace??'equipment-explorer';
const storeKey=`${storageNamespace}:saved-parts:v1`;
const machineNotesKey=`${storageNamespace}:machine-notes:v1`;
const cache=new Map();
let supportPromise;
export const labels={'verified-product':'Retailer sales page verified','source-linked-unverified':'Supplier link needs verification','no-sales-page':'No verified sales page','fabrication-required':'Custom fabrication · quote required','identity-unresolved':'Part identity unresolved'};
export const el=(tag,text,className)=>{const n=document.createElement(tag);if(text!=null)n.textContent=text;if(className)n.className=className;return n};
export function safeUrl(url){try{const u=new URL(url);return ['https:','http:'].includes(u.protocol)?u.href:null}catch{return null}}
export function safeInspectionUrl(url){
 if(typeof url!=='string'||!url.startsWith('/')||url.startsWith('//'))return null;
 try{const u=new URL(url,'https://equipment.local');return u.origin==='https://equipment.local'&&(u.pathname.startsWith('/equipment/')||u.pathname==='/farmbot.html')?u.pathname+u.search+u.hash:null}catch{return null}
}
export function external(text,url,className){const a=el('a',text,className),href=safeUrl(url);if(href){a.href=href;a.target='_blank';a.rel='noopener noreferrer'}return a}
export function money(value){if(value?.amount==null)return value?.status==='quote-required'?'Quote required':'Price unavailable';try{return new Intl.NumberFormat('en-US',{style:'currency',currency:value.currency,minimumFractionDigits:2,maximumFractionDigits:4}).format(value.amount)}catch{return `${value.amount} ${value.currency??''}`}}
export function isModelUnit(item){return item?.catalogKind==='reconstructed-model-unit'||item?.status==='visual-unit-unidentified'}
export function modelShapeCount(item){return Array.isArray(item?.sourceMembers)?item.sourceMembers.length:Array.isArray(item?.memberSourceIds)?item.memberSourceIds.length:null}
export function isVerifiedOffer(commerce,offer){return commerce?.salesStatus==='verified-product'&&offer?.verified!==false&&!offer?.alternative}
export function isIdentificationRequest(item){return isModelUnit(item)||/visual.*unidentified|unmatched-cad-body|^unresolved$/.test(item?.status??'')||/schematic|semantic-assembly/.test(item?.catalogKind??'')||item?.commerce?.salesStatus==='identity-unresolved'}
export function qualifiedOffers(item){return isIdentificationRequest(item)?[]:(item?.commerce?.offers??[]).filter(offer=>safeUrl(offer?.url)&&isVerifiedOffer(item.commerce,offer))}
// A checked product page is a reference, not approval for the selected machine.
export function replacementAction(item,{now=Date.now()}={}){
 const references=qualifiedOffers(item),c=item?.commerce??{},approval=c.replacementApproval??{},reasons=[];
 const unidentified=isIdentificationRequest(item)||sourceIdentifier(item,references[0]).value==='Not verified'||approval.identity!=='verified';
 if(unidentified)reasons.push('Replacement identity needs confirmation.');
 if(approval.mapping!=='customer-approved'||!['exact','approved-kit','approved-assembly'].includes(approval.relationship))reasons.push('The selection-to-replacement mapping needs approval.');
 if(c.fitNeedsReview||item?.fitNeedsReview||approval.applicability!=='confirmed'||['incompatible','unknown','confirmation-required'].includes(item?.applicability?.status??item?.applicabilityStatus))reasons.push('Fit for the installed machine is not confirmed.');
 if((item?.serialScope||item?.serialRequired||c.serialRequired||approval.serialRequired)&&approval.serialApplicability!=='confirmed')reasons.push('Required serial applicability needs confirmation.');
 if((item?.pvc||item?.PVC||item?.configurationRequired||c.configurationRequired||approval.configurationRequired)&&approval.configurationApplicability!=='confirmed')reasons.push('Required configuration applicability needs confirmation.');
 if(approval.sellableUnit!=='resolved')reasons.push('The replacement unit or pack needs confirmation.');
 if(approval.release!=='approved')reasons.push('Customer release approval is pending.');
 const offers=references.filter(offer=>{
  const pack=offer.unitsPerOffer??offer.packageQuantity,stock=offer.availabilityStatus??offer.availability?.status??offer.stockStatus??offer.availability;
  return !offer.fitNeedsReview&&!['incompatible','unknown','confirmation-required'].includes(offer.applicability?.status??offer.applicabilityStatus)&&offer.verified===true&&Number.isInteger(pack)&&pack>0&&offer.replacementApproved===true&&Number.isFinite(Date.parse(offer.recheckBy))&&Date.parse(offer.recheckBy)>now&&!/out.of.stock|sold.out|unavailable|back.?order|discontinued|no longer/i.test(typeof stock==='string'?stock:'');
 });
 if(!offers.length)reasons.push('A current destination for the approved replacement unit needs confirmation.');
 const ready=reasons.length===0,identify=isIdentificationRequest(item);
 return {ready,offers:ready?offers:[],references,reasons,kind:ready?'replacement-reference':identify?'identification-request':'fit-confirmation',label:identify?'Prepare identification request':'Confirm fit · prepare request',notice:ready?'Approved replacement reference. Confirm current price and stock with the supplier.':identify?'Part identity and fit are unverified. Prepare a request with the machine details.':'Fit is not confirmed for your machine. Prepare a request before choosing a replacement.'};
}
export function requestKind(item){return qualifiedOffers(item).length?'retailer-linked':isIdentificationRequest(item)?'identification-request':'quote-request'}
export function offerTitle(offer){const href=safeUrl(offer?.url);return offer?.retailer??(href?new URL(href).hostname:'Supplier reference')}
export function retailerLabel(offer){const units=offer?.unitsPerOffer??offer?.packageQuantity;return `View at ${offer?.supplierType==='manufacturer'?'manufacturer':'retailer'} · ${offerTitle(offer)}${Number.isInteger(units)&&units>1?` · pack of ${units}`:''}`}
export function fitRequestButton(machine,part,className='retailer-button'){
 const action=replacementAction(part),button=el('button',action.label,className);button.type='button';
 button.onclick=()=>{if(savePart(machine,part))location.assign('/shop/saved/#machine-context');else button.textContent='Storage unavailable · try again'};
 return button;
}
export function referenceCost(item){const c=item.commerce,v=c?.value,qualified=qualifiedOffers(item);if(!qualified.length||v?.amount==null||!v.currency)return null;if(v.unitEquivalent){const offers=qualified.filter(o=>o.price?.amount!=null&&o.price.currency===v.currency&&Number.isInteger(o.unitsPerOffer)&&o.unitsPerOffer>0);if(!offers.length)return null;const options=offers.map(o=>({amount:Math.ceil(item.quantity/o.unitsPerOffer)*o.price.amount,currency:v.currency,note:`${Math.ceil(item.quantity/o.unitsPerOffer)} pack(s) of ${o.unitsPerOffer} · ${o.price.basis??''}`}));return options.sort((a,b)=>a.amount-b.amount)[0]}return {amount:v.amount*item.quantity,currency:v.currency,note:v.basis}}
export async function machineData(id){if(!cache.has(id))cache.set(id,fetch(`/shop/data/${encodeURIComponent(id)}.json`).then(r=>{if(!r.ok)throw Error('Part sales record unavailable');return r.json()}));return cache.get(id)}
export async function machineSupport(id){if(!supportPromise){const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),4000);supportPromise=fetch('/shop/support.json',{signal:controller.signal}).then(r=>r.ok?r.json():{}).catch(()=>({})).finally(()=>clearTimeout(timeout))}const value=(await supportPromise)?.machines?.[id];return value&&safeUrl(value.url)&&typeof value.label==='string'?value:null}
export function supportNavigation(machineId){const box=el('div',null,'parts-help');machineSupport(machineId).then(support=>{if(!support){box.append(el('p','Parts contact pending · share your request with your existing supplier or parts department.','commerce-note'));return}box.append(external(`Get parts help · ${support.label}`,support.url,'reference-link'));if(support.qualification)box.append(el('p',support.qualification,'commerce-note'))});return box}
export function readSaved(){try{const v=JSON.parse(localStorage.getItem(storeKey)??'[]');return Array.isArray(v)?v.filter(x=>typeof x.machineId==='string'&&typeof x.id==='string'&&Number.isInteger(x.quantity)&&x.quantity>0&&x.quantity<=9999):[]}catch{return []}}
export function writeSaved(items){try{localStorage.setItem(storeKey,JSON.stringify(items));dispatchEvent(new CustomEvent('saved-parts-change'));return true}catch{dispatchEvent(new CustomEvent('saved-parts-error'));return false}}
export function readMachineNotes(){try{const value=JSON.parse(localStorage.getItem(machineNotesKey)??'{}');return value&&typeof value==='object'&&!Array.isArray(value)?value:{}}catch{return {}}}
export function writeMachineNotes(machineId,notes){try{const all=readMachineNotes();Object.defineProperty(all,machineId,{value:{serialNumber:String(notes.serialNumber??'').slice(0,200),configurationNotes:String(notes.configurationNotes??'').slice(0,4000),updatedAt:new Date().toISOString()},enumerable:true,configurable:true,writable:true});localStorage.setItem(machineNotesKey,JSON.stringify(all));return true}catch{return false}}
function inspectionFor(machine,p){const direct=safeInspectionUrl(p.inspectionUrl);if(direct)return direct;const route=safeInspectionUrl(machine.route)??safeInspectionUrl(globalThis.location?.pathname);if(!route)return null;const url=new URL(route,'https://equipment.local');url.searchParams.set('part',p.id);return url.pathname+url.search+url.hash}
export function savePart(machine,p){
 const saved=readSaved(),item=saved.find(x=>x.id===p.id&&x.machineId===machine.id);
 // Repeated saves increase the requested count; the original evidence snapshot stays intact.
 if(item)item.quantity=Math.min(9999,item.quantity+1);
 else{
  const snapshot={...p,machineId:machine.id,machineTitle:machine.title,quantity:1,sourceQuantity:p.quantity??null,revision:machine.revision??null,machineRevision:machine.revision??null,partRevision:p.revision??null,inspectionUrl:inspectionFor(machine,p)};
  if(machine.configuration!==undefined)snapshot.machineConfiguration=machine.configuration;
  saved.push(snapshot);
 }
 return writeSaved(saved);
}
export function updateSaved(machineId,id,quantity){const saved=readSaved();writeSaved(quantity===0?saved.filter(x=>x.id!==id||x.machineId!==machineId):saved.map(x=>x.id===id&&x.machineId===machineId?{...x,quantity:Math.max(1,Math.min(9999,Math.floor(Number(quantity)||1)))}:x))}
export function download(name,value){const url=URL.createObjectURL(new Blob([JSON.stringify(value,null,2)+'\n'],{type:'application/json'})),a=el('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1500)}
export function downloadText(name,value){const url=URL.createObjectURL(new Blob([value],{type:'text/plain;charset=utf-8'})),a=el('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1500)}
function offerRow(offer,c,{candidate=false,modelUnit=false,allowRetailer=false,reference=false}={}){
 const href=safeUrl(offer?.url);if(!href)return null;
 const row=el('div',null,'retailer-offer'),verified=allowRetailer&&!candidate&&isVerifiedOffer(c,offer),title=offerTitle(offer);
 row.append(external(verified?retailerLabel(offer):reference?`${retailerLabel(offer)} · reference only`:`${candidate?'Unverified candidate retailer reference':offer.alternative?'Alternative product reference':'Unverified supplier reference'} · ${title}`,href,verified?'retailer-button':'reference-link'));
 const stock=offer.availability??offer.availabilityStatus??offer.stockStatus??offer.stock;
 if(typeof stock==='string'&&/out.of.stock|sold.out|discontinued|no longer/i.test(stock))row.append(el('p','Unavailable at last check','compatibility-note'));
 const details=el('details',null,'offer-details');details.append(el('summary',verified?'Product details & compatibility':'Reference details · exact replacement unverified'));
 details.append(el('p',[offer.productName,offer.sku?`SKU ${offer.sku}`:null].filter(Boolean).join(' · '),'commerce-note'));
 if(!modelUnit&&offer.price?.amount!=null)details.append(el('p',`${!verified?'Unverified advertised reference: ':offer.priceType==='starting-price'?'From ':offer.priceType==='advertised-reference'?'Advertised reference: ':''}${money(offer.price)}${offer.price.basis?' · '+offer.price.basis:''}`,'offer-price'));
 if(offer.compatibility)details.append(el('p',typeof offer.compatibility==='string'?offer.compatibility:offer.compatibility.detail??offer.compatibility.note??JSON.stringify(offer.compatibility),'compatibility-note'));
 if(stock)details.append(el('p',typeof stock==='string'?stock:JSON.stringify(stock),'commerce-note'));
 if(offer.checkedAt)details.append(el('p',`Checked ${new Date(offer.checkedAt).toLocaleDateString()}. Confirm price, stock and fit with the retailer.`,'commerce-note'));
 row.append(details);return {row,verified};
}
export function renderCommerce(machine,p){
 const box=el('section',null,'part-commerce');box.setAttribute('aria-label','Retailer and price');const c=p.commerce??{salesStatus:'identity-unresolved',offers:[],value:{amount:null,status:'price-unavailable'}},modelUnit=isModelUnit(p);
 if(modelUnit){const count=modelShapeCount(p);box.append(el('p','Reconstructed visual unit · OEM part identity unverified','compatibility-note'));if(count!==null)box.append(el('p',`${count} model shape${count===1?'':'s'} · documented part quantity unknown`,'commerce-note'))}
 box.append(el('p',labels[c.salesStatus]??'Sales page needs verification','sale-status '+c.salesStatus),el('p',modelUnit?'Price unavailable':money(c.value),'part-value'));
 if(c.fitNeedsReview)box.append(el('p','Variant or compatibility needs review','compatibility-note'));
 if(c.alternative)box.append(el('p','Source example / alternative','compatibility-note'));
 if(!modelUnit&&c.value?.unitEquivalent)box.append(el('p','Recorded unit-equivalent value · listing sold by pack','commerce-note'));
 const action=replacementAction(p);
 box.append(el('p',action.notice,'compatibility-note'));
 if(!action.ready)box.append(fitRequestButton(machine,p),el('p','Prepare locally, then share with your parts contact. No request is sent.','commerce-note'));
 for(const offer of c.offers??[]){const result=offerRow(offer,c,{modelUnit,allowRetailer:action.offers.includes(offer),reference:action.references.includes(offer)});if(result)box.append(result.row)}
 if((c.candidateOffers??[]).some(o=>safeUrl(o?.url))){box.append(el('p','Unverified retailer references','commerce-note'));for(const offer of c.candidateOffers){const result=offerRow(offer,c,{candidate:true,modelUnit});if(result)box.append(result.row)}}
 if((c.supportLinks??[]).some(link=>safeUrl(link?.url))){box.append(el('p','Dealer & source navigation','commerce-note'));for(const link of c.supportLinks){if(safeUrl(link?.url))box.append(external(`${link.label??'Dealer or source reference'} · reference navigation`,link.url,'reference-link'))}}
 box.append(supportNavigation(machine.id));
 const save=el('button',modelUnit?'Save visual sourcing request':'Save part','save-part');save.onclick=()=>{save.textContent=savePart(machine,p)?'Saved to your parts list':'Storage unavailable';};box.append(save,el('a','Review saved parts','review-saved'));box.lastChild.href='/shop/saved/';
 const basis=el('details',null,'offer-details');basis.append(el('summary','Value basis & source notes'));if(c.value?.basis)basis.append(el('p',c.value.basis,'commerce-note'));if(c.notes)basis.append(el('p',Array.isArray(c.notes)?c.notes.join(' '):c.notes,'commerce-note'));if(p.geometryAssociation)basis.append(el('p',typeof p.geometryAssociation==='string'?p.geometryAssociation:JSON.stringify(p.geometryAssociation),'commerce-note'));box.append(basis);
 return box;
}

export function selectionSummary(items){return {retailerLinked:items.filter(item=>requestKind(item)==='retailer-linked'),requests:items.filter(item=>requestKind(item)!=='retailer-linked')}}
export function buildPartsRequest(items,machineContext={},support={},options={}){
 const value=x=>x==null||x===''?'unknown':typeof x==='string'?x:JSON.stringify(x),groups=selectionSummary(items),lines=['EQUIPMENT PARTS REQUEST',`Prepared: ${options.exportedAt??new Date().toISOString()}`,'Prepared locally. No request or order has been sent.','Retailer links are dated product references. Confirm machine fit, current price and stock with the supplier.',''];
 for(const [heading,list] of [['SELECTIONS WITH PRODUCT REFERENCES',groups.retailerLinked],['IDENTIFICATION / QUOTE REQUESTS',groups.requests]]){
  lines.push(`${heading} (${list.length})`);
  if(!list.length)lines.push('None.');
  for(const item of list){const c=item.commerce??{},context=Object.hasOwn(machineContext,item.machineId)?machineContext[item.machineId]:{},help=support[item.machineId],inspection=safeInspectionUrl(item.inspectionUrl);
   const identifier=sourceIdentifier(item,qualifiedOffers(item)[0]);
   lines.push('',`${item.name} — ${item.machineTitle??item.machineId}`,`Request type: ${requestKind(item)}`,`Selection ID: ${item.id}`,`${identifier.label}: ${identifier.value}`,`Requested quantity: ${item.quantity}${isIdentificationRequest(item)?' visual selection(s); physical part identity / quantity need confirmation':''}`,`Documented source quantity: ${value(item.sourceQuantity)}`,`Machine revision: ${value(item.machineRevision??item.revision)}`,`Part revision: ${value(item.partRevision)}`,`Assembly: ${value(item.assembly)}`,`Machine serial (user supplied, unverified): ${value(context?.serialNumber)}`,`Configuration / request notes (user supplied, unverified): ${value(context?.configurationNotes)}`);
   if(item.machineConfiguration){const config=item.machineConfiguration;lines.push(`Documented machine configuration: ${typeof config==='object'?value({configuration_id:config.configuration_id??null,model:config.model??null,pvc:config.pvc??null,market:config.market??null,serial_family:config.serial_family??null,choices:config.choices??null}):value(config)}`)}
   for(const [label,data] of [['Quantity basis',item.quantityBasis],['Publication',item.publication],['PVC',item.pvc??item.PVC],['Source pages',item.sourcePages],['Geometry association',item.geometryAssociation],['Model source SHA-256',item.modelSourceSha256],['Source members',item.sourceMembers??item.memberSourceIds]])if(data!=null)lines.push(`${label}: ${value(data)}`);
   if(safeUrl(item.sourceUrl))lines.push(`Source documentation: ${safeUrl(item.sourceUrl)}`);
   if(inspection)lines.push(`Inspect selection: ${options.origin?new URL(inspection,options.origin).href:inspection}`);
   lines.push(`Sales status: ${labels[c.salesStatus]??'Needs verification'}`,`Recorded value: ${isIdentificationRequest(item)?'Price unavailable':money(c.value)}`);
   if(c.value?.basis)lines.push(`Value basis: ${c.value.basis}`);
   const cost=referenceCost(item);if(cost)lines.push(`Reference cost: ${money(cost)}; ${cost.note??''}`);
   lines.push(`Replacement action: ${replacementAction(item).notice}`);
   if(c.alternative)lines.push('Source example / alternative; not a required additional part.');
   for(const [candidate,offers] of [[false,c.offers??[]],[true,c.candidateOffers??[]]])for(const offer of offers){if(!safeUrl(offer?.url))continue;const qualified=!candidate&&qualifiedOffers(item).includes(offer);lines.push(`${qualified?'Retailer product reference; fit requires confirmation':'Unverified / alternative reference'}: ${offerTitle(offer)} — ${safeUrl(offer.url)}`);for(const [label,data] of [['Product',offer.productName],['SKU',offer.sku],['Fit / compatibility',offer.compatibility],['Availability at check',offer.availability??offer.availabilityStatus??offer.stockStatus??offer.stock],['Stock qualification',offer.stockNote??offer.availabilityBasis],['Checked at',offer.checkedAt],['Units per offer',offer.unitsPerOffer??offer.packageQuantity]])if(data!=null)lines.push(`  ${label}: ${value(data)}`);if(offer.price?.amount!=null)lines.push(`  ${qualified?'Recorded offer price':'Unverified advertised price'}: ${money(offer.price)}; ${offer.price.basis??''}`)}
   for(const link of c.supportLinks??[])if(safeUrl(link?.url))lines.push(`Dealer / source navigation: ${link.label??'Reference'} — ${safeUrl(link.url)}`);
   if(help&&safeUrl(help.url))lines.push(`Get parts help: ${help.label} — ${safeUrl(help.url)}`,`Help qualification: ${value(help.qualification)}`);
   if(c.notes)lines.push(`Source notes: ${Array.isArray(c.notes)?c.notes.join(' '):value(c.notes)}`);
  }
  lines.push('');
 }
 lines.push('Unknown fields remain unresolved. Reconstructed or schematic selections are identification aids, not verified OEM part identities.','Known pack quantities are rounded up to whole packs. This request is not a complete machine quote and does not include tax or shipping.','The companion JSON export retains selected part records, public source references and unresolved fields.');return lines.join('\n')+'\n';
}
