/* PublicCharts: dependency-free aggregate visualizations. Never fetches patient data. */
(function(global){
  'use strict';
  const NS='http://www.w3.org/2000/svg';
  const PALETTE=['#0f69b4','#d56821','#56836d','#9373ad','#467f91','#ad7940'];
  const TYPES=new Set(['vertical','horizontal','grouped','stacked','stacked100','diverging','target','progress','temporal','ranking','pareto','range','pie','donut','semi']);
  const finite=v=>typeof v!=='boolean'&&v!==null&&v!==undefined&&String(v).trim()!==''&&Number.isFinite(Number(v));
  const numeric=v=>finite(v)?Number(v):null;
  const sum=rows=>rows.reduce((s,r)=>s+(finite(r.value)?Number(r.value):0),0);
  const percent=(v,t)=>t>0&&finite(v)&&Number(v)>=0?100*Number(v)/t:null;
  function normalize(rows){return (Array.isArray(rows)?rows:[]).map((r,i)=>({ ...r,label:String(r.label??'Sin categoría'),value:numeric(r.value),low:numeric(r.low),high:numeric(r.high),target:numeric(r.target),_index:i,parts:Array.isArray(r.parts)?r.parts.map(p=>({...p,label:String(p.label??'Serie'),value:numeric(p.value)})):[]}));}
  function order(rows,type,sort){const out=rows.slice();if(type==='temporal')return out.sort((a,b)=>(Number.isFinite(Date.parse(a.date||a.label))?Date.parse(a.date||a.label):Infinity)-(Number.isFinite(Date.parse(b.date||b.label))?Date.parse(b.date||b.label):Infinity));if(type==='pareto')return out.sort((a,b)=>(b.value??-Infinity)-(a.value??-Infinity));if(sort==='asc')out.sort((a,b)=>(a.value??Infinity)-(b.value??Infinity));else if(sort==='desc'||type==='ranking')out.sort((a,b)=>(b.value??-Infinity)-(a.value??-Infinity));return out;}
  function resolveType(type,rows,width){type=TYPES.has(type)?type:'horizontal';if(['pie','donut','semi'].includes(type)&&(rows.length>6||rows.some(r=>r.value<0)))return 'horizontal';if(type==='vertical'&&width<620)return 'horizontal';return type;}
  function hash(s){let n=0;for(const c of s)n=(n*31+c.charCodeAt(0))>>>0;return n;}
  function node(tag,attrs={},text){const e=document.createElementNS(NS,tag);for(const [k,v]of Object.entries(attrs))if(v!==undefined)e.setAttribute(k,String(v));if(text!==undefined)e.textContent=text;return e;}
  function html(tag,cls,text){const e=document.createElement(tag);if(cls)e.className=cls;if(text!==undefined)e.textContent=text;return e;}
  function download(blob,name){const a=document.createElement('a'),u=URL.createObjectURL(blob);a.href=u;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(u),1000);}
  const csvValue=v=>'"'+(typeof v==='string'&&/^[\s]*[=+@-]/.test(v)?"'":'')+String(v??'').replace(/"/g,'""')+'"';
  function ticks(min,max){const raw=(max-min||1)/4,power=10**Math.floor(Math.log10(raw)),step=([1,2,5,10].find(x=>x*power>=raw)||10)*power,lo=Math.floor(min/step)*step,hi=Math.ceil(max/step)*step||step;return {min:lo,max:hi,values:Array.from({length:Math.round((hi-lo)/step)+1},(_,i)=>lo+i*step)};}
  function mount(container,initial){
    if(!container)throw new Error('Falta contenedor del gráfico');
    let config={},rows=[],svg=null,disposed=false,raf=0,lastWidth=0,userSort=null,currentType='',percentageTotal=null;
    const hidden=new Set();
    const root=html('section','viz-component'),heading=html('div','viz-header'),headingText=html('div'),title=html('h3','viz-title'),subtitle=html('p','viz-subtitle'),plot=html('div','viz-canvas'),legend=html('div','viz-legend'),notes=html('p','viz-note'),summary=html('p','viz-summary'),controls=html('div','viz-tools'),details=html('details','viz-data'),tableWrap=html('div','viz-table-wrap'),visual=html('div','viz-visual'),tooltip=html('div','viz-tooltip');
    tooltip.hidden=true;tooltip.setAttribute('role','tooltip');document.body.append(tooltip);
    headingText.append(title,subtitle);heading.append(headingText);visual.append(plot,legend);details.append(html('summary','', 'Ver datos del gráfico'),tableWrap);root.append(heading,controls,visual,notes,summary,details);container.replaceChildren(root);
    function number(v,d=0){return v===null?'Sin dato':new Intl.NumberFormat(config.locale||'es-CL',{maximumFractionDigits:d}).format(v);}
    function pct(v,t){const p=percent(v,t);return p===null?'no aplica':p>0&&p<.1?'< '+number(.1,1)+' %':p>99.9&&p<100?'> '+number(99.9,1)+' %':number(p,1)+' %';}
    function color(label,index){return config.colors?.[label]||PALETTE[hash(label)%PALETTE.length];}
    function fullValue(v,total){return number(v,config.decimals??0)+' '+(config.unit||'registros')+(percent(v,total)!==null?' · '+pct(v,total):'');}
    function select(row){if(typeof config.onSelect==='function')config.onSelect(row.label,row);}
    function interactive(el,row,value,total,series){const desc=[row.label,series,fullValue(value,total),currentType==='stacked100'?'Porcentaje dentro de esta categoría':'',row.target!==null&&row.target!==undefined?'Meta: '+number(row.target):'',currentType==='range'?`Rango: ${number(row.low)} a ${number(row.high)}`:''].filter(Boolean).join(' · ');el.append(node('title',{},desc));el.setAttribute('aria-label',desc);el.setAttribute('tabindex','0');el.setAttribute('role',config.onSelect?'button':'graphics-symbol');if(config.onSelect){el.style.cursor='pointer';el.setAttribute('aria-pressed',String(config.selected===row.label));el.addEventListener('click',()=>select(row));el.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();select(row);}});}const show=e=>{tooltip.textContent=desc;tooltip.hidden=false;const b=el.getBoundingClientRect(),x=e.clientX??b.x+b.width/2,y=e.clientY??b.y;tooltip.style.left=Math.max(8,Math.min(x+12,innerWidth-tooltip.offsetWidth-12))+'px';tooltip.style.top=Math.max(8,Math.min(y+14,innerHeight-tooltip.offsetHeight-12))+'px';};el.addEventListener('pointermove',show);el.addEventListener('focus',show);el.addEventListener('pointerleave',()=>tooltip.hidden=true);el.addEventListener('blur',()=>tooltip.hidden=true);el.addEventListener('keydown',e=>{if(e.key==='Escape')tooltip.hidden=true;});el.classList.add('viz-mark');}
    function text(x,y,value,attrs={}){const t=node('text',{x,y,...attrs},value);svg.append(t);return t;}
    function line(x1,y1,x2,y2,attrs={}){svg.append(node('line',{x1,y1,x2,y2,stroke:'var(--viz-grid)',...attrs}));}
    function rect(x,y,w,h,fill,row,v,total,series){const r=node('rect',{x,y,width:Math.max(0,w),height:Math.max(0,h),rx:3,fill});interactive(r,row,v,total,series);svg.append(r);return r;}
    function render(){
      if(disposed)return;
      const width=Math.max(230,Math.round(plot.getBoundingClientRect().width||container.clientWidth||700));lastWidth=width;tooltip.hidden=true;
      rows=order(normalize(config.data),config.type,userSort||config.sort);
      let total=finite(config.total)?Number(config.total):sum(rows);const originalType=config.type||'horizontal';let type=resolveType(originalType,rows,width);const problems=[];
      if(type==='stacked100'&&rows.some(r=>r.parts.some(p=>p.value<0))){type='grouped';problems.push('Se muestran series agrupadas: una composición porcentual no admite valores negativos.');}
      if(type==='stacked100'&&rows.some(r=>r.parts.length&&(r.value===null||Math.abs(sum(r.parts)-r.value)>1e-8))){type='grouped';problems.push('No se normaliza al 100% porque las series y sus totales no coinciden.');}
      if(type==='pareto'&&rows.some(r=>r.value<0)){type='diverging';problems.push('El acumulado de Pareto no se calcula con valores negativos.');}
      if(rows.some(r=>r.value<0||r.parts.some(p=>p.value<0))){total=null;problems.push('Valores negativos: se muestran cantidades; no se interpretan como proporciones.');}
      if(config.proportions===false&&!['pie','donut','semi','stacked100'].includes(type))total=null;
      if(['pie','donut','semi'].includes(type)&&total!==sum(rows)){problems.push('La distribución circular usa la suma de las categorías; difiere del denominador informado.');total=sum(rows);}
      if(type==='temporal'&&rows.some(r=>!Number.isFinite(Date.parse(r.date||r.label))))problems.push('Hay fechas inválidas: se conservan al final y deben revisarse en la fuente.');
      percentageTotal=total;currentType=type;
      if(type!==originalType&&['pie','donut','semi'].includes(originalType))problems.push('Se utilizan barras para representar todas las categorías o valores negativos sin distorsión.');
      if(rows.some(r=>r.value===null))problems.push('Los valores faltantes se muestran como “Sin dato”; no se convierten en cero.');
      if(rows.some(r=>r.parts.length&&Math.abs(sum(r.parts)-(r.value??0))>1e-8))problems.push('Hay diferencias entre el total de una categoría y sus series. Revise la fuente.');
      if(config.total!==undefined&&total<sum(rows)&&rows.every(r=>r.value===null||r.value>=0))problems.push('La suma supera el denominador informado; revise si las categorías se superponen.');
      title.textContent=config.title||'';title.hidden=!config.title;subtitle.textContent=config.subtitle||'';subtitle.hidden=!config.subtitle;
      plot.replaceChildren();legend.replaceChildren();visual.classList.toggle('viz-circular',['pie','donut','semi'].includes(type));
      const style=getComputedStyle(container),dark=(style.getPropertyValue('--text')||'').trim();
      const ink=style.getPropertyValue('--text').trim()||'#24394f',muted=style.getPropertyValue('--text-dim').trim()||'#60758b',grid=style.getPropertyValue('--border').trim()||'#dfe7ee';
      svg=node('svg',{xmlns:NS,width:'100%',role:'group','aria-label':config.title||'Visualización de datos',style:`--viz-text:${ink};--viz-muted:${muted};--viz-grid:${grid};color:${ink};font-family:Arial,Helvetica,sans-serif;font-size:12px;overflow:visible`});
      svg.append(node('style',{},'text{fill:var(--viz-text)}.viz-muted{fill:var(--viz-muted)}.viz-mark{transition:opacity .15s}.viz-mark:hover{opacity:.78}.viz-mark:focus{outline:2px solid currentColor;outline-offset:3px}@media(prefers-reduced-motion:reduce){.viz-mark{transition:none}}'));
      plot.append(svg);
      if(!rows.length){svg.setAttribute('viewBox',`0 0 ${width} 100`);text(width/2,50,'No hay datos para los filtros seleccionados.',{'text-anchor':'middle'});}
      else if(['pie','donut','semi'].includes(type))renderCircle(width,type,total);
      else if(type==='stacked100')renderComposition(width,total);
      else if(['horizontal','ranking','progress','diverging','target','range'].includes(type))renderHorizontal(width,type,total);
      else renderColumns(width,type,total);
      notes.textContent=[...problems,type==='stacked100'?'Cada categoría conserva su denominador original.':total!==null?`Porcentajes sobre ${number(total)} ${config.unit||'registros'} del conjunto informado.`:'',hidden.size?'Hay series ocultas; los totales originales se conservan en la tabla.':''].filter(Boolean).join(' ');
      const valid=rows.filter(r=>r.value!==null),top=valid.slice().sort((a,b)=>b.value-a.value)[0],ties=top?valid.filter(r=>r.value===top.value):[];
      summary.textContent=config.summary===false?'':top&&top.value>0?(ties.length>1?`${ties.length} categorías comparten el mayor valor: ${fullValue(top.value,total)} cada una.`:`${top.label} concentra ${fullValue(top.value,total)}.`):'';
      if(hidden.size&&summary.textContent)summary.textContent+=' Resumen del conjunto completo, incluidas las series ocultas.';
      summary.hidden=!summary.textContent;
      renderTable();
    }
    function renderHorizontal(width,type,total){
      const compact=width<530,left=compact?8:Math.min(210,Math.max(110,width*.28)),right=compact?112:145,rowHeight=compact?72:49,h=rows.length*rowHeight+40,chartW=Math.max(60,width-left-right);
      const values=rows.flatMap(r=>type==='range'?[r.low,r.high]:[r.value,...(['target','progress'].includes(type)?[r.target]:[])]).filter(v=>v!==null),domain=ticks(Math.min(0,...values),Math.max(0,...values)),{min,max}=domain,span=max-min||1,x=v=>left+(v-min)/span*chartW;
      svg.setAttribute('viewBox',`0 0 ${width} ${h}`);
      for(const v of domain.values){line(x(v),12,x(v),h-27);text(x(v),h-7,number(v,2),{'text-anchor':'middle',class:'viz-muted','font-size':10});}
      line(x(0),12,x(0),h-27,{stroke:'var(--viz-muted)','stroke-width':1.2});
      rows.forEach((r,i)=>{const y=(compact?38:22)+i*rowHeight;const maxChars=Math.max(10,Math.floor((compact?width-12:left)/7)-2),label=r.label.length>maxChars?r.label.slice(0,maxChars-1)+'…':r.label;const lab=text(compact?left:left-12,compact?y-9:y+16,label,{'text-anchor':compact?'start':'end','font-size':12});lab.append(node('title',{},r.label));
        if(type==='range'){if(r.low===null||r.high===null||r.high<r.low){text(left+4,y+16,'Rango incompleto o inválido');return;}rect(x(r.low),y,x(r.high)-x(r.low),23,color(r.label,i),r,r.value,total);text(left+chartW+10,y+16,number(r.low,1)+' – '+number(r.high,1));return;}
        if(r.value===null){text(left+4,y+16,'Sin dato', {class:'viz-muted'});return;}
        if(type==='progress')svg.append(node('rect',{x:left,y,width:r.target>0?Math.max(0,x(r.target)-left):chartW,height:23,rx:3,fill:'var(--viz-grid)'}));
        const fill=r.value<0?'#a95163':color(r.label,i);rect(Math.min(x(0),x(r.value)),y,Math.abs(x(r.value)-x(0)),23,fill,r,r.value,total);
        if(['target','progress'].includes(type)&&r.target!==null){line(x(r.target),y-4,x(r.target),y+29,{stroke:'var(--viz-text)','stroke-width':2,'stroke-dasharray':'3 2'});const marker=node('circle',{cx:x(r.target),cy:y-4,r:2,fill:'var(--viz-text)'});marker.append(node('title',{},'Meta: '+number(r.target)));svg.append(marker);}
        text(left+chartW+10,y+16,number(r.value,config.decimals??0)+(total!==null?' · '+pct(r.value,total):''),{'font-size':11,'font-weight':600});
        if(type==='progress')text(left+chartW+10,y+31,r.target>0?'Avance: '+pct(r.value,r.target):'Sin meta positiva',{'font-size':10,class:'viz-muted'});
      });
      if(['target','progress'].includes(type))legend.append(html('span','', '┆ Referencia: meta informada por categoría (detalle en tabla).'));
    }
    function renderComposition(width,total){
      const height=rows.length*90+30,left=8,cw=width-16;
      svg.setAttribute('viewBox',`0 0 ${width} ${height}`);
      rows.forEach((r,i)=>{const y=26+i*90;const label=text(left,y,r.label.length>Math.floor((width-130)/7)?r.label.slice(0,Math.max(8,Math.floor((width-130)/7)-1))+'…':r.label,{'font-weight':600});label.append(node('title',{},r.label));text(width-8,y,number(r.value)+' '+(config.unit||'registros'),{'text-anchor':'end','font-size':11,class:'viz-muted'});let offset=0;
        if(r.value===null||r.value<=0){text(left,y+25,r.value===null?'Sin dato':'0 registros · sin proporción');return;}
        const active=r.parts.filter(p=>!hidden.has(p.label)&&p.value!==null);active.forEach(p=>{const w=Math.max(0,cw*p.value/r.value);rect(left+offset,y+12,w,25,p.color||color(p.label),r,p.value,r.value,p.label);if(w>80)text(left+offset+w/2,y+29,number(p.value)+' · '+pct(p.value,r.value),{'text-anchor':'middle','font-size':11,fill:'#fff',style:'fill:#fff;font-weight:700;paint-order:stroke;stroke:#0005;stroke-width:2px'});offset+=w;});
        const detail=active.map(p=>p.label+': '+number(p.value)+' ('+pct(p.value,r.value)+')').join(' · ');const lab=text(left,y+56,detail.length>width/6?detail.slice(0,Math.floor(width/6)-1)+'…':detail,{'font-size':10,class:'viz-muted'});lab.append(node('title',{},detail));
      });
      renderSeriesLegend();
    }
    function renderSeriesLegend(){
      const series=[...new Set(rows.flatMap(r=>r.parts.map(p=>p.label)))];
      for(const s of series){
        const b=html('button','viz-legend-item',s);b.type='button';
        b.style.borderLeft=`5px solid ${rows.flatMap(r=>r.parts).find(p=>p.label===s)?.color||color(s)}`;
        b.setAttribute('aria-pressed',String(config.onSeriesSelect?config.selectedSeries===s:hidden.size>0&&!hidden.has(s)));
        b.title='Ver '+s;
        b.addEventListener('click',()=>{
          if(config.onSeriesSelect){config.onSeriesSelect(s);return;}
          hidden.clear();series.filter(x=>x!==s).forEach(x=>hidden.add(x));render();
          [...legend.querySelectorAll('button')].find(x=>x.textContent===s)?.focus({preventScroll:true});
        });legend.append(b);
      }
      if(!config.onSeriesSelect&&hidden.size){const reset=html('button','viz-legend-item','Ver todas las series');reset.type='button';reset.addEventListener('click',()=>{hidden.clear();render();});legend.append(reset);}
    }
    function renderColumns(width,type,total){
      const series=[...new Set(rows.flatMap(r=>r.parts.map(p=>p.label)))],isStack=['stacked','stacked100'].includes(type),grouped=type==='grouped',slot=Math.max(110,...rows.map(r=>(number(r.value).length+10)*6)),minWidth=Math.max(width,rows.length*(grouped?Math.max(slot,series.length*26):slot)+82),height=340,left=50,right=type==='pareto'?54:20,top=34,bottom=74,cw=minWidth-left-right,ch=height-top-bottom,step=cw/rows.length;
      svg.setAttribute('viewBox',`0 0 ${minWidth} ${height}`);svg.style.minWidth=minWidth+'px';plot.style.overflowX='auto';
      const active=r=>r.parts.filter(p=>!hidden.has(p.label)&&p.value!==null),extent=rows.flatMap(r=>isStack?[active(r).filter(p=>p.value>=0).reduce((a,p)=>a+p.value,0),active(r).filter(p=>p.value<0).reduce((a,p)=>a+p.value,0)]:grouped?active(r).map(p=>p.value):[r.value]);
      const domain=ticks(Math.min(0,...extent.filter(finite)),Math.max(0,...extent.filter(finite))),{min,max}=domain,span=max-min||1,y=v=>top+ch-(v-min)/span*ch;
      for(const v of domain.values){line(left,y(v),minWidth-right,y(v));text(left-8,y(v)+4,number(v,2),{'text-anchor':'end',class:'viz-muted','font-size':10});}
      let accum=0;const points=[];
      rows.forEach((r,i)=>{const center=left+step*(i+.5),bw=Math.min(80,step*.62);if((isStack||grouped)&&r.parts.length){let pos=0,neg=0;const ap=active(r);ap.forEach((p,j)=>{if(type==='stacked100'&&p.value<0)return;const v=type==='stacked100'?(r.value>0?100*p.value/r.value:0):p.value;const base=v>=0?pos:neg,end=base+v;const xx=grouped?center-bw/2+j*bw/Math.max(1,ap.length):center-bw/2,ww=grouped?bw/Math.max(1,ap.length)-2:bw;rect(xx,Math.min(y(grouped?0:base),y(grouped?v:end)),ww,Math.abs(y(grouped?0:base)-y(grouped?v:end)),p.color||color(p.label,j),r,p.value,total,p.label);if(v>=0)pos=end;else neg=end;});}else if(r.value!==null)rect(center-bw/2,Math.min(y(0),y(r.value)),bw,Math.abs(y(r.value)-y(0)),color(r.label,i),r,r.value,total);
        const visible=(isStack||grouped)&&r.parts.length?sum(active(r)):r.value,topValue=grouped?Math.max(0,...active(r).map(p=>p.value)):isStack?active(r).filter(p=>p.value>0).reduce((s,p)=>s+p.value,0):r.value;
        const labelY=Math.max(15,y(Math.max(0,topValue||0))-10);text(center,labelY,visible===null?'Sin dato':number(visible,config.decimals??0)+(total!==null?' · '+pct(visible,total):''),{'text-anchor':'middle','font-size':10,'font-weight':600});
        const words=r.label.split(' ');let lines=[''];for(const word of words){if((lines[lines.length-1]+' '+word).trim().length>14&&lines.length<3)lines.push(word);else lines[lines.length-1]+=(lines[lines.length-1]?' ':'')+word;}const label=text(center,height-bottom+22,'',{'text-anchor':'middle','font-size':11});lines.slice(0,3).forEach((l,k)=>label.append(node('tspan',{x:center,dy:k?14:0},l.length>Math.max(10,Math.floor(step/7)-2)?l.slice(0,Math.max(9,Math.floor(step/7)-3))+'…':l)));label.append(node('title',{},r.label));
        if(type==='pareto'){accum+=r.value||0;points.push([center,top+ch*(1-(sum(rows)>0?accum/sum(rows):0))]);}
      });
      if(type==='pareto'&&rows.every(r=>r.value===null||r.value>=0)){svg.append(node('polyline',{points:points.map(p=>p.join(',')).join(' '),fill:'none',stroke:'#9373ad','stroke-width':2.5}));points.forEach(([x,y])=>svg.append(node('circle',{cx:x,cy:y,r:3,fill:'#9373ad'})));for(let i=0;i<=4;i++)text(minWidth-right+8,top+ch*(1-i/4)+4,i*25+'%',{class:'viz-muted','font-size':10});}
      if(type==='pareto')legend.append(html('span','','Línea: porcentaje acumulado de las categorías ordenadas (eje derecho).'));
      if(series.length&&(isStack||grouped))renderSeriesLegend();
    }
    function renderCircle(width,type,total){
      width=360;
      const actual=sum(rows),semi=type==='semi',height=semi?215:285,cx=width/2,cy=semi?175:132,outer=Math.min(108,width*.31),inner=type==='pie'?0:outer*.72;
      svg.setAttribute('viewBox',`0 0 ${width} ${height}`);
      if(actual<=0){text(cx,cy,'No hay valores positivos',{'text-anchor':'middle'});return;}
      let angle=semi?Math.PI:-Math.PI/2;const sweep=semi?Math.PI:Math.PI*2;
      rows.forEach((r,i)=>{const item=html(config.onSelect?'button':'div','viz-legend-item');if(config.onSelect){item.type='button';item.setAttribute('aria-pressed',String(config.selected===r.label));item.addEventListener('click',()=>select(r));}item.style.borderLeft=`5px solid ${color(r.label,i)}`;item.textContent=`${r.label} — ${fullValue(r.value,total)}`;legend.append(item);
        if(r.value===null||r.value<=0)return;const next=angle+sweep*r.value/actual,point=(a,rad)=>[cx+Math.cos(a)*rad,cy+Math.sin(a)*rad],a=point(angle,outer),b=point(next,outer),c=point(next,inner),d=point(angle,inner),large=next-angle>Math.PI?1:0;let shape;if(r.value===actual&&!semi){shape=node('circle',{cx,cy,r:(outer+inner)/2,fill:inner?'none':color(r.label,i),stroke:color(r.label,i),'stroke-width':inner?outer-inner:0});}else{shape=node('path',{d:`M ${a} A ${outer} ${outer} 0 ${large} 1 ${b} L ${c} ${inner?`A ${inner} ${inner} 0 ${large} 0 ${d}`:''} Z`,fill:color(r.label,i),stroke: 'var(--viz-grid)','stroke-width':1});}interactive(shape,r,r.value,total);svg.append(shape);angle=next;
      });
      if(type!=='pie'){const focus=rows.find(r=>r.label===config.focusLabel)||rows.filter(r=>r.value!==null).sort((a,b)=>b.value-a.value)[0];text(cx,cy+(semi?-17:2),config.centerMode==='percent'?pct(focus?.value,actual):number(actual),{'text-anchor':'middle','font-size':31,'font-weight':700});text(cx,cy+(semi?3:23),config.centerMode==='percent'?'Participación destacada':config.unit||'registros',{'text-anchor':'middle',class:'viz-muted','font-size':12});}
    }
    function renderTable(){const table=html('table','viz-table'),thead=html('thead'),head=html('tr'),body=html('tbody');table.append(html('caption','',config.title||'Datos del gráfico'));['Categoría','Valor','% del conjunto','Serie / rango / meta'].forEach(h=>{const th=html('th','',h);th.scope='col';head.append(th);});thead.append(head);const total=percentageTotal;for(const r of rows){const tr=html('tr');[r.label,number(r.value,config.decimals??0),pct(r.value,total),r.parts.length?r.parts.map(p=>p.label+': '+number(p.value)+(currentType==='stacked100'?' ('+pct(p.value,r.value)+' dentro de categoría)':'')).join('; '):r.low!==null||r.high!==null?`${number(r.low)} – ${number(r.high)}`:r.target!==null?'Meta: '+number(r.target):''].forEach(v=>tr.append(html('td','',v)));body.append(tr);}table.append(thead,body);tableWrap.replaceChildren(table);}
    function svgText(){if(!svg)return '';const box=svg.viewBox.baseVal,clone=svg.cloneNode(true),w=Math.max(640,box.width),ink=getComputedStyle(container).getPropertyValue('--text').trim()||'#24394f',bg=getComputedStyle(container).getPropertyValue('--surface').trim()||'#fff',extra=[];
      const wrap=str=>{const words=String(str).split(' '),out=[''];for(const word of words){if((out.at(-1)+' '+word).length>Math.floor(w/7)-6)out.push(word);else out[out.length-1]+=(out.at(-1)?' ':'')+word;}return out;};
      for(const str of [config.subtitle||'',config.context||'Sin filtros adicionales'])extra.push(...wrap(str));
      const header=55+extra.length*18,footer=[...legend.children].flatMap(x=>wrap(x.textContent+(x.getAttribute('aria-pressed')==='false'&&!['pie','donut','semi'].includes(currentType)?' (oculta)':'')).map(t=>({text:t,color:x.style.borderLeftColor}))).concat(wrap(notes.textContent).map(t=>({text:t}))),h=header+box.height+28+footer.length*18,out=node('svg',{xmlns:NS,width:w,height:h,viewBox:`0 0 ${w} ${h}`,style:`--viz-text:${ink};font-family:Arial,Helvetica,sans-serif;font-size:12px;fill:${ink}`});out.append(node('rect',{width:w,height:h,fill:bg}),node('text',{x:20,y:28,'font-size':17,'font-weight':700},config.title||'Gráfico'));extra.forEach((s,i)=>out.append(node('text',{x:20,y:50+i*18},s)));clone.setAttribute('x',(w-box.width)/2);clone.setAttribute('y',header);clone.setAttribute('width',box.width);clone.setAttribute('height',box.height);out.append(clone);footer.forEach((s,i)=>{const y=header+box.height+22+i*18;if(s.color)out.append(node('rect',{x:20,y:y-9,width:9,height:9,rx:2,fill:s.color}));out.append(node('text',{x:s.color?36:20,y},s.text));});return new XMLSerializer().serializeToString(out);}
    function exportSVG(){download(new Blob([svgText()],{type:'image/svg+xml;charset=utf-8'}),'grafico.svg');}
    async function exportPNG(){const img=new Image();await new Promise((resolve,reject)=>{img.onload=resolve;img.onerror=reject;img.src='data:image/svg+xml;charset=utf-8,'+encodeURIComponent(svgText());});const canvas=document.createElement('canvas'),scale=Math.min(2,8192/Math.max(img.width,img.height));canvas.width=Math.round(img.width*scale);canvas.height=Math.round(img.height*scale);canvas.getContext('2d').drawImage(img,0,0,canvas.width,canvas.height);const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/png'));if(!blob)throw Error('No se pudo generar PNG');download(blob,'grafico.png');}
    function exportCSV(){const total=percentageTotal,series=[...new Set(rows.flatMap(r=>r.parts.map(p=>p.label)))],out=[['Categoría','Valor','Porcentaje del conjunto','Denominador','Unidad',...series.map(s=>'Serie: '+s),'Mínimo','Máximo','Meta','Filtros']];for(const r of rows)out.push([r.label,r.value,percent(r.value,total),total,config.unit||'registros',...series.map(s=>r.parts.find(p=>p.label===s)?.value??null),r.low,r.high,r.target,config.context||'']);const decimal=new Intl.NumberFormat(config.locale||'es-CL').formatToParts(1.5).find(p=>p.type==='decimal')?.value||'.';download(new Blob(['\ufeff'+out.map(row=>row.map(v=>typeof v==='number'?'"'+String(v).replace('.',decimal)+'"':csvValue(v)).join(';')).join('\r\n')],{type:'text/csv;charset=utf-8'}),'datos-grafico.csv');}
    const sortLabel=html('label','','Orden'),sortSelect=html('select');sortSelect.setAttribute('aria-label','Orden del gráfico');for(const [v,l] of [['none','Original'],['desc','Mayor a menor'],['asc','Menor a mayor']]){const opt=html('option','',l);opt.value=v;sortSelect.append(opt);}sortSelect.addEventListener('change',()=>{userSort=sortSelect.value;render();});sortLabel.append(sortSelect);controls.append(sortLabel);
    for(const [label,fn]of [['SVG',exportSVG],['PNG',exportPNG],['CSV',exportCSV]]){const b=html('button','viz-export','Descargar '+label);b.type='button';b.addEventListener('click',()=>Promise.resolve(fn()).catch(()=>{notes.textContent='No fue posible exportar el gráfico. Intente descargar SVG o CSV.';}));controls.append(b);}
    const resize=typeof ResizeObserver!=='undefined'?new ResizeObserver(entries=>{const w=Math.round(entries[0].contentRect.width);if(w!==lastWidth){cancelAnimationFrame(raf);raf=requestAnimationFrame(render);}}):null;resize?.observe(container);
    const theme=new MutationObserver(()=>{cancelAnimationFrame(raf);raf=requestAnimationFrame(render);});theme.observe(document.documentElement,{attributes:true,attributeFilter:['class','data-theme']});theme.observe(document.body,{attributes:true,attributeFilter:['class','data-theme']});
    const systemTheme=matchMedia('(prefers-color-scheme: dark)'),onSystemTheme=()=>{cancelAnimationFrame(raf);raf=requestAnimationFrame(render);};systemTheme.addEventListener('change',onSystemTheme);
    function update(next){if(next.onSeriesSelect)hidden.clear();config={...config,...next};sortSelect.value=userSort||config.sort||'none';sortLabel.hidden=['temporal','pareto'].includes(config.type);render();}
    function destroy(){disposed=true;cancelAnimationFrame(raf);resize?.disconnect();theme.disconnect();systemTheme.removeEventListener('change',onSystemTheme);tooltip.remove();root.remove();}
    update(initial||{});return {update,destroy,exportSVG,exportPNG,exportCSV};
  }
  global.PublicCharts={mount,math:{normalize,sum,percent,order,resolveType,ticks,csvValue},types:[...TYPES]};
})(window);
