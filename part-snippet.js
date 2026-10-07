import {qualifiedOffers,isIdentificationRequest,safeUrl,machineSupport} from '/shop/commerce.js?v=purchase-1';
import {sourceIdentifier} from '/part-identity.js?v=purchase-1';

const element=(tag,text,className)=>{const node=document.createElement(tag);if(text!=null)node.textContent=String(text);if(className)node.className=className;return node};
const noteText=value=>value==null?'':typeof value==='string'?value:value.detail??value.note??value.description??JSON.stringify(value);

// A source/model identifier is never presented as a replacement part number.
export function renderPartSnippet(machine,part,{onFindParts}={}){
 const card=element('div',null,'part-snippet'),offers=qualifiedOffers(part),offer=offers[0];
 const unidentified=isIdentificationRequest(part);
 const identifier=sourceIdentifier(part,offer);
 const facts=element('dl',null,'snippet-number'),row=element('div');
 row.append(element('dt',identifier.label),element('dd',identifier.value));facts.append(row);card.append(facts);
 if(machine.id==='farmbot'&&part.id==='camera')card.append(element('p','Camera includes its attached 1 m cable and connector. Extension cable is separate; internal subpart CAD is not supplied.','snippet-unavailable'));
 if(offer){
  const pack=Number(offer.unitsPerOffer??offer.packageQuantity);
  const compatible=offer.identityBasis==='manufacturer-declared-compatible-replacement';
  const order=element('a',compatible?'Order compatible replacement':pack>1?`Order part · pack of ${pack}`:'Order part','snippet-order');order.href=offer.url;order.target='_blank';order.rel='noopener noreferrer';card.append(order);
  const stock=offer.availabilityStatus??offer.availability?.status??offer.availability;
  if(typeof stock==='string'&&/out.of.stock|sold.out|unavailable|back.?order|discontinued/i.test(stock))card.append(element('p','Unavailable or backordered at last check · confirm with retailer','snippet-unavailable'));
  const packaged=pack>1||/\b(pack|package|kit|set of|sachet|pair)\b/i.test([offer.productName,offer.price?.basis,offer.offerType].filter(Boolean).join(' '));
  if(packaged||offers.length>1){const purchase=element('details',null,'snippet-fit snippet-purchase');purchase.append(element('summary','Pack & purchase details'));purchase.append(element('p',[offer.productName,offer.price?.basis,pack>1?`This listing supplies ${pack} items.`:null,'Packaging applies to this listing; separate availability is not established.'].filter(Boolean).join(' ')));for(const other of offers.slice(1)){const link=element('a',other.productName??other.retailer??'Other qualified listing');link.href=other.url;link.target='_blank';link.rel='noopener noreferrer';purchase.append(link);}card.append(purchase);}
  if(offer.compatibility||part.commerce?.fitNeedsReview||part.catalogKind==='source-identified-service-part'||part.serialScope||part.pvc){const details=element('details',null,'snippet-fit');details.append(element('summary','Confirm fit before ordering'));const notes=[part.serialScope?`Serial scope: ${part.serialScope}`:null,part.pvc?`PVC ${part.pvc}`:null,offer.compatibility,...(Array.isArray(part.commerce.notes)?part.commerce.notes:[part.commerce.notes])].map(noteText).filter(Boolean);details.append(element('p',[...new Set(notes)].join(' ')));card.append(details)}
 }else{
  card.append(element('p',part.purchasingGap??'Order link unavailable','snippet-unavailable'));
  const source=safeUrl(part.documentUrl??part.sourceUrl);
  if(identifier.value!=='Not verified'&&source){const link=element('a','Part documentation','snippet-reference');link.href=source;link.target='_blank';link.rel='noopener noreferrer';card.append(link)}
  const evidence=part.identityEvidence,reference=safeUrl(evidence?.supplierUrl);
  if(identifier.value!=='Not verified'&&evidence?.kind==='source-retailer-catalog-number'&&reference){const link=element('a','Source supplier listing · verify current fit and availability','snippet-reference');link.href=reference;link.target='_blank';link.rel='noopener noreferrer';card.append(link)}
  if(onFindParts){const find=element('button','Find documented parts','snippet-find-parts');find.type='button';find.onclick=()=>onFindParts(part);card.append(find)}
  machineSupport(machine.id).then(s=>{if(!s)return;const link=element('a','Get parts identification help','snippet-reference');link.href=s.url;link.target='_blank';link.rel='noopener noreferrer';link.title=s.qualification??s.label;card.append(link)});
 }
 return card;
}

export function mountMinimalViewer(machineId){
 const header=document.querySelector('.topbar');
 const select=element('select',null,'machine-select');select.setAttribute('aria-label','Equipment');
 const initial=element('option',machineId==='farmbot'?'FarmBot Genesis v1.8':document.title.split(' · ')[0]);initial.value=location.pathname;select.append(initial);header.append(select);
 fetch('/shop/catalog.json').then(r=>{if(!r.ok)throw Error('Directory unavailable');return r.json()}).then(data=>{
  select.replaceChildren();for(const machine of data.machines){const reference=['agricruiser','acorn','romi'].includes(machine.id);const option=element('option',machine.title+(reference?' · reference':''));option.value=machine.route;option.selected=machine.id===machineId;select.append(option)}
 }).catch(()=>{});
 select.onchange=()=>{if(select.value)location.assign(select.value)};
 const inspector=document.querySelector('.part-inspector,.inspector'),surface=document.querySelector('.stage,.workspace');
 const sync=()=>{const active=inspector.classList.contains('part-inspector')?!inspector.hidden:surface.classList.contains('has-selection');surface.classList.toggle('has-selection',active);surface.style.setProperty('--snippet-height',Math.ceil(inspector.getBoundingClientRect().height)+'px')};
 new ResizeObserver(sync).observe(inspector);new MutationObserver(sync).observe(inspector,{attributes:true,attributeFilter:['hidden']});sync();
}
