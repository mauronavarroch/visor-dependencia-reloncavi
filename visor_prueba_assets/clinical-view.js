/* Private-view presentation adapters. Data is supplied only after server authorization. */
(function(){
 'use strict';
 const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const dependency=p=>p.electro?'Electrodependientes':p.oxi?'Oxigenodependientes':'Sin clasificación';
 const modality=p=>p.subtipo==='oxigenoterapia'?'Con oxigenoterapia':p.subtipo==='ventilacion'?'Con ventilación mecánica':'Sin subtipo identificado';
 function statistics(rows){
   const dimensions={'Dependencia':dependency,'ADULTO/NIÑO':p=>p.ge,'Equipo':p=>p.equipo,'Comuna':p=>p.comuna,'ESTABLECIMIENTO APS':p=>p.centro,'Servicio de Salud':p=>p.servicio,'Modalidad':modality};
   const group=(pool,fn,age=false)=>{const buckets=new Map();for(const p of pool){const key=fn(p)||'Sin información';if(!buckets.has(key))buckets.set(key,[]);buckets.get(key).push(p);}return [...buckets].map(([label,list])=>({label,n:list.length,parts:(age?[['Adultos',p=>p.ge==='Adulto'],['Niños',p=>p.ge==='Niño']]:[['Oxigenodependientes',p=>p.oxi],['Electrodependientes',p=>p.electro]]).map(([label,test])=>({label,n:list.filter(test).length}))})).sort((a,b)=>b.n-a.n||a.label.localeCompare(b.label,'es'));};
   return {total:rows.length,groups:Object.fromEntries(Object.entries(dimensions).map(([key,fn])=>[key,group(rows,fn)])),charts:{territory:group(rows,p=>p.comuna),age:group(rows,p=>p.comuna,true),equipment:group(rows,p=>p.equipo),modality:group(rows.filter(p=>p.electro),modality)}};
 }
 const fieldMap={'Dependencia':'tipo','ADULTO/NIÑO':'etario','Equipo':'cred','Comuna':'comuna','ESTABLECIMIENTO APS':'centro','Servicio de Salud':'provincia','Modalidad':'subtipo'};
 function toState(field,value){if(field==='Dependencia')return value==='Electrodependientes'?'Solo electrodependiente':value==='Oxigenodependientes'?'Solo oxigenodependiente':'Sin clasificar';if(field==='Modalidad')return value==='Con oxigenoterapia'?'oxigenoterapia':value==='Con ventilación mecánica'?'ventilacion':'sin_especificar';return value;}
 function renderCharts(rows,state,apply){
   const filters={};for(const [key,field]of Object.entries(fieldMap)){if(state[field]&&state[field]!=='todas')filters[key]=field==='tipo'?state.tipo==='Solo electrodependiente'?'Electrodependientes':state.tipo==='Solo oxigenodependiente'?'Oxigenodependientes':state.tipo:field==='subtipo'?state.subtipo==='oxigenoterapia'?'Con oxigenoterapia':state.subtipo==='ventilacion'?'Con ventilación mecánica':'Sin subtipo identificado':state[field];}
   PublicDashboard.render(statistics(rows),filters,(key,value)=>apply(fieldMap[key],toState(key,value)));
 }
 const hasCoordinates=p=>Number.isFinite(p.lat)&&Number.isFinite(p.lon)&&Math.abs(p.lat)<=90&&Math.abs(p.lon)<=180;
 function createMap(element,onSelect){
   const map=L.map(element,{preferCanvas:true,maxZoom:18,minZoom:5,zoomControl:true}).setView([-41.5,-72.95],8),markers=L.layerGroup().addTo(map),centers=L.layerGroup().addTo(map),base=L.layerGroup().addTo(map),labels=L.layerGroup().addTo(map);
   map.createPane('localBasemap');map.getPane('localBasemap').style.zIndex=210;
   let rows=[],selected=null,health=[],showHealth=false,features=[],signature='',repaintTimer;
   L.control.scale({imperial:false,position:'bottomleft'}).addTo(map);
   map.attributionControl.addAttribution('© <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> · cartografía local');
   const fit=()=>{const pts=rows.filter(hasCoordinates);if(pts.length)map.fitBounds(pts.map(p=>[p.lat,p.lon]),{padding:[40,40],maxZoom:15,animate:!matchMedia('(prefers-reduced-motion: reduce)').matches});else map.setView([-41.5,-72.95],8);};
   function baseRender(){base.clearLayers();labels.clearLayers();if(!features.length)return;const bounds=map.getBounds().pad(.15),zoom=map.getZoom();
     for(const f of features){const box=f._bounds;if(box&&!bounds.intersects(box))continue;const p=f.properties;
       if(f.geometry.type==='Point'){if(zoom<10&&p.place==='village')continue;L.marker([f.geometry.coordinates[1],f.geometry.coordinates[0]],{pane:'localBasemap',interactive:false,icon:L.divIcon({className:'local-place',html:`<span>${esc(p.name||'')}</span>`,iconSize:[130,20]})}).addTo(labels);continue;}
       const road=p.highway,major=/^(motorway|trunk|primary)/.test(road||'');if(road&&!major&&zoom<11)continue;if(road&&/residential|living|unclassified/.test(road)&&zoom<13)continue;
       const layer=L.geoJSON(f,{pane:'localBasemap',interactive:!!road,style:{color:road?(major?'#bfab86':'#bcc5cd'):p.natural==='coastline'?'#80acba':'#b5d3df',weight:road?(major?Math.max(2,zoom/5):1.4):1,fillColor:'#d9eaf0',fillOpacity:.8}}).addTo(base);
       if(road&&(p.name||p.ref))layer.bindTooltip(esc(p.name||p.ref),{sticky:true,className:'road-tooltip'});
     }
   }
   function draw(){markers.clearLayers();centers.clearLayers();const groups=new Map(),zoom=map.getZoom();
     for(const p of rows.filter(hasCoordinates)){const xy=map.project([p.lat,p.lon],zoom),key=p.id===selected?'selected:'+p.id:zoom>=17?`${p.lat}|${p.lon}`:`${Math.floor(xy.x/48)}|${Math.floor(xy.y/48)}`;if(!groups.has(key))groups.set(key,[]);groups.get(key).push(p);}
     for(const list of groups.values()){const p=list[0],isGroup=list.length>1,color=p.electro?'#E0701E':'#0F69B4',isSelected=p.id===selected;
       const marker=L.marker([p.lat,p.lon],{keyboard:true,title:isGroup?`${list.length} pacientes agrupados`:p.nombre||'Registro',icon:L.divIcon({className:'patient-marker',html:isGroup?`<span class="cluster-dot" aria-label="${list.length} pacientes agrupados">${list.length}</span>`:`<span class="patient-dot ${isSelected?'is-selected':''}" style="--marker-color:${color}"><span>${isSelected?'✓':''}</span></span>`,iconSize:isGroup?[34,34]:[26,26],iconAnchor:isGroup?[17,17]:[13,13]})}).addTo(markers);
       marker.bindTooltip(isGroup?`${list.length} pacientes · ampliar o elegir registro`:esc(p.nombre||'Registro')+' · '+esc(p.comuna),{direction:'top'});
       marker.on('click',()=>{if(!isGroup){onSelect(p.id,true);return;}if(zoom<17)map.setView(marker.getLatLng(),Math.min(17,zoom+2));const content=document.createElement('div');content.className='cluster-list';content.innerHTML='<strong>Registros de esta agrupación</strong>';for(const item of list){const button=document.createElement('button');button.type='button';button.textContent=item.nombre||'Registro';button.onclick=()=>{map.closePopup();onSelect(item.id,true);};content.append(button);}L.popup({maxWidth:300}).setLatLng(marker.getLatLng()).setContent(content).openOn(map);});
     }
     if(showHealth)for(const c of health.filter(c=>rows.some(p=>p.comuna===c.comuna))){L.circleMarker([c.lat,c.lon],{radius:4,color:'#617c7c',weight:2,fillOpacity:.5}).bindTooltip(esc(c.nombre)).addTo(centers);}
   }
   map.on('zoomend',draw);map.on('moveend zoomend',()=>{clearTimeout(repaintTimer);repaintTimer=setTimeout(baseRender,80);});
   Promise.resolve(window.VISOR_CARTOGRAFIA).then(data=>{features=data.features;for(const f of features){const coords=f.geometry.type==='Point'?[f.geometry.coordinates]:f.geometry.type==='Polygon'?f.geometry.coordinates.flat():f.geometry.coordinates;f._bounds=L.latLngBounds(coords.map(c=>[c[1],c[0]]));}baseRender();document.getElementById('cartographyStatus').textContent='Cartografía local · caminos y localidades de OpenStreetMap · sin conexión externa durante el uso';}).catch(()=>{document.getElementById('cartographyStatus').textContent='No se pudo cargar la cartografía local. Los puntos conservan sus coordenadas informadas.';});
   return {map,fit,update(next,id,options={}){rows=next;selected=id;health=options.centers||[];showHealth=options.showCenters;const nextSignature=rows.map(p=>p.id+':'+p.lat+':'+p.lon).join('|');draw();if(options.fit&&signature!==nextSignature)fit();signature=nextSignature;requestAnimationFrame(()=>map.invalidateSize());},focus(id){const p=rows.find(p=>p.id===id);if(p&&hasCoordinates(p))map.setView([p.lat,p.lon],Math.max(map.getZoom(),15),{animate:!matchMedia('(prefers-reduced-motion: reduce)').matches});},clear(){rows=[];markers.clearLayers();centers.clearLayers();}};
 }
 window.ClinicalView={statistics,renderCharts,hasCoordinates,createMap};
})();
