// A short, optional task using the same assembly and selection controls.
export function mountGuidedTask({experience,config,parts,selectedPartId}) {
  if(!config || !experience?.session)return;
  const part=parts.find(p=>p.id===config.partId);
  const scopes=[...experience.session.nodes.values()].filter(n=>!n.leaf&&n.label===config.assemblyLabel);
  if(!part||scopes.length!==1)return;
  const host=document.querySelector('.exploration-shell');
  const panel=document.createElement('section');panel.className='guided-task';panel.setAttribute('aria-label','Guided identification task');
  const text=document.createElement('p');text.setAttribute('role','status');
  const action=document.createElement('button');action.type='button';action.id='guided-next';
  const dismiss=document.createElement('button');dismiss.type='button';dismiss.textContent='Explore freely';dismiss.className='guided-dismiss';
  const toggle=document.createElement('button');toggle.type='button';toggle.className='guided-toggle';toggle.textContent='Try a guided task';
  let step=0;
  const render=()=>{
    panel.dataset.step=String(step);dismiss.hidden=step===2;
    text.textContent=[config.introduction,config.assemblyInstruction,config.partInstruction][step];
    action.textContent=[config.openAssemblyLabel,config.inspectPartLabel,'Finish guide'][step];
  };
  const close=()=>{panel.hidden=true;toggle.hidden=false;};
  action.addEventListener('click',()=>{
    if(step===0){experience.setMode('cad');experience.session.enter(scopes[0].id);step=1;}
    else if(step===1){experience.openPart(part);if(selectedPartId()!==part.id){text.textContent='This reference is unavailable. Use Find a part to continue.';return;}step=2;}
    else {close();return;}
    render();
  });
  dismiss.addEventListener('click',close);
  toggle.addEventListener('click',()=>{step=0;render();panel.hidden=false;toggle.hidden=true;});
  panel.append(text,action,dismiss);host.append(panel,toggle);render();
  if(new URLSearchParams(location.search).get('tour')==='1')toggle.hidden=true;else panel.hidden=true;
}
