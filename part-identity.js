// Documentary identity and retailer qualification are separate evidence.
export function sourceIdentifier(part,offer){
 const visual=/visual.*unidentified|unmatched-cad-body/.test(part?.status??'')||['reconstructed-model-unit','semantic-assembly','schematic'].includes(part?.catalogKind);
 if(visual)return {label:'Part number',value:'Not verified'};
 const supplierNumber=part?.partNumberType==='supplier-catalog';
 const number=(!supplierNumber?part?.partNumber:null)??part?.manufacturerPartNumber??offer?.manufacturerPartNumber;
 if(number)return {label:part?.partNumberType==='manufacturer-model'?'Manufacturer model':'Part number',value:String(number)};
 const sku=offer?.sku??part?.sku??(supplierNumber?part.partNumber:null);
 if(sku)return {label:offer?'Retailer SKU':'Source supplier code',value:String(sku)};
 if(part?.sourceSpecification)return {label:'Source specification',value:String(part.sourceSpecification)};
 return {label:'Part number',value:'Not verified'};
}

export function directBodyBinding(body,metadata,partsById,exactNames,aliases=new Map()){
 if(metadata?.partId&&partsById.has(metadata.partId))return metadata.partId;
 const alias=aliases.get(body?.name);if(alias&&partsById.has(alias))return alias;
 // An ancestor's product identity belongs to that assembly, never this body.
 const candidates=new Set();
 for(const name of [metadata?.cadName,body?.userData?.cadName,body?.userData?.name,body?.name]){
  if(!name)continue;const normalized=String(name).replace(/<\d+>/g,'').replace(/\s+/g,' ').trim().toLowerCase();
  for(const id of exactNames.get(normalized)??[])candidates.add(id);
 }
 return candidates.size===1?[...candidates][0]:null;
}
