/* Demonstration only. All records and activity live in memory, not a server. */
(()=>{
const $=id=>document.getElementById(id),el=(tag,text)=>{const e=document.createElement(tag);if(text!==undefined)e.textContent=text;return e;};
let role='public',actor='',current=null,activity=[];
const fields=['Dependencia','Servicio de Salud','RUT','Digito Verificador','Nombre/Apellido','ADULTO/NIÑO','Equipo','Flujo (L/m)','Horas','DIRECCION','Observación','Latitud','Longitud','Comuna','ESTABLECIMIENTO APS','NÚMERO TELEFONO'];
const normalize=s=>s.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]/g,'');
const value=(r,k)=>r[Object.keys(r).find(x=>normalize(x)===normalize(k))]??'';
const dashboard=document.querySelector('.public-main');
const controls=el('div');controls.className='session-controls';
controls.innerHTML='<button id="demoLogin">Ingresar</button><button id="demoAdmin" hidden>Administrar registro</button><button id="demoBack" hidden>Volver al visor</button><button id="demoLogout" hidden>Cerrar sesión</button>';
document.querySelector('.header-actions').append(controls);
const note=el('p','Acceso simulado de demostración: no protege datos ni conecta al visor oficial. Todo se descarta al recargar.');note.className='prototype-note';dashboard.prepend(note);
const login=el('dialog');login.id='demoDialog';login.innerHTML='<h2>Ingreso de demostración</h2><p>Acceso simulado, sin seguridad de producción.</p><p>Usuarios: <b>administrador</b> o <b>consulta</b>. Clave de prueba: <b>demo</b>.</p><form id="demoLoginForm"><label>Usuario<input name="user" required autocomplete="off"></label><label>Clave de prueba<input name="pass" type="password" required autocomplete="off"></label><p id="demoLoginError" role="alert"></p><button>Ingresar</button><button type="button" id="demoCancel">Cancelar</button></form>';document.body.append(login);
const admin=el('main');admin.className='wrap visor-admin';admin.hidden=true;
admin.innerHTML='<div class="panel-blue-head"><h2>Administración del registro · Prueba</h2><p>Altas, ediciones, retiros e historial temporal</p></div><p class="prototype-note">Cambios solo en esta carga. El Excel original y el visor oficial no se modifican.</p><div class="map-tools"><button id="demoNew">Nuevo registro</button><label>Buscar registro<input id="demoSearch" type="search"></label><span id="demoCount"></span></div><p id="demoStatus" role="status"></p><form id="demoEdit" hidden></form><div id="demoList"></div><h2>Historial de esta prueba</h2><p>No constituye auditoría institucional; se pierde al vaciar o recargar.</p><div id="demoHistory"></div>';document.body.append(admin);
function sync(){
 $('demoLogin').hidden=role!=='public';$('demoLogout').hidden=role==='public';$('demoAdmin').hidden=role!=='admin'||!admin.hidden;$('demoBack').hidden=admin.hidden;
 document.querySelectorAll('[data-demo-private]').forEach(e=>e.hidden=role==='public');
 const search=$('searchInput');if(search){search.closest('.filter-group').hidden=role==='public';if(role==='public'){search.value='';search.dispatchEvent(new Event('input'));}}
 if(role!=='public')window.dispatchEvent(new Event('resize'));
}
function log(action,row,changes){activity.unshift({at:new Date().toLocaleString('es-CL'),actor,action,name:value(row,'Nombre/Apellido')||row.id,changes});}
function showList(){
 const rows=window.DemoRecords.get(),query=$('demoSearch').value.toLowerCase();$('demoCount').textContent=rows.length+' registros en memoria';$('demoList').replaceChildren();
 for(const r of rows.filter(r=>[value(r,'Nombre/Apellido'),value(r,'RUT'),value(r,'Comuna')].join(' ').toLowerCase().includes(query))){
  const entry=el('div');entry.className='entry';entry.append(el('span',value(r,'Nombre/Apellido')+' · '+value(r,'Comuna')));
  const edit=el('button','Editar'),remove=el('button','Dar de baja');edit.type=remove.type='button';edit.onclick=()=>editRecord(r);remove.onclick=()=>{if(role!=='admin'||!confirm('¿Retirar este registro de la prueba? El Excel original no cambia.'))return;log('Retiro',r,[]);window.DemoRecords.set(rows.filter(x=>x.id!==r.id));showList();$('demoStatus').textContent='Registro retirado de esta prueba.';};entry.append(edit,remove);$('demoList').append(entry);
 }
 $('demoHistory').replaceChildren();for(const a of activity){const item=el('details'),summary=el('summary',a.at+' · '+a.actor+' · '+a.action+' · '+a.name);item.append(summary);for(const c of a.changes)item.append(el('p',c.field+': '+(c.before||'(vacío)')+' → '+(c.after||'(vacío)')));$('demoHistory').append(item);}
 if(!activity.length)$('demoHistory').textContent='Sin cambios en esta sesión.';
}
function editRecord(row){current=row||null;const form=$('demoEdit');form.hidden=false;form.replaceChildren();form.append(el('h3',row?'Editar registro de prueba':'Nuevo registro de prueba'));
 for(const name of fields){const label=el('label',name),input=el('input');input.name=name;input.value=row?value(row,name):'';if(name==='Nombre/Apellido')input.required=true;label.append(input);form.append(label);}
 const save=el('button','Guardar en la prueba'),cancel=el('button','Cancelar');cancel.type='button';cancel.onclick=()=>form.hidden=true;form.append(save,cancel);form.scrollIntoView({block:'nearest'});
}
$('demoEdit').onsubmit=e=>{e.preventDefault();if(role!=='admin')return;const rows=window.DemoRecords.get(),changes=[],next={...(current||{}),id:current?.id||'NUEVO_'+Date.now()+'_'+Math.random().toString(36).slice(2)};
 for(const [name,v]of new FormData(e.target)){const key=Object.keys(next).find(k=>normalize(k)===normalize(name))||name;const before=String(next[key]??'');next[key]=v;if(before!==v)changes.push({field:name,before,after:v});}
 log(current?'Edición':'Creación',next,changes);window.DemoRecords.set(current?rows.map(r=>r.id===current.id?next:r):[...rows,next]);e.target.hidden=true;current=null;showList();$('demoStatus').textContent='Cambio aplicado únicamente a esta prueba.';
};
$('demoLogin').onclick=()=>login.showModal();$('demoCancel').onclick=()=>login.close();$('demoLoginForm').onsubmit=e=>{e.preventDefault();const d=new FormData(e.target),user=String(d.get('user')).trim().toLowerCase();if(!['administrador','consulta'].includes(user)||d.get('pass')!=='demo'){$('demoLoginError').textContent='Use administrador o consulta y la clave demo.';return;}role=user==='administrador'?'admin':'consulta';actor=user;login.close();e.target.reset();$('demoLoginError').textContent='';sync();};
$('demoAdmin').onclick=()=>{if(role!=='admin')return;admin.hidden=false;dashboard.hidden=true;showList();sync();};$('demoBack').onclick=()=>{admin.hidden=true;dashboard.hidden=false;sync();};$('demoLogout').onclick=()=>{role='public';actor='';admin.hidden=true;dashboard.hidden=false;$('demoEdit').replaceChildren();$('demoList').replaceChildren();$('demoHistory').replaceChildren();sync();};$('demoNew').onclick=()=>editRecord();$('demoSearch').oninput=showList;
window.addEventListener('demo-loaded',()=>{activity=[];current=null;$('demoEdit').replaceChildren();$('demoEdit').hidden=true;$('demoStatus').textContent='';$('demoSearch').value='';showList();sync();});
sync();
})();
