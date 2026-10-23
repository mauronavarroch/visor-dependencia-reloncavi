/* Adaptador de estadísticas agregadas. Nunca consulta pacientes. */
(function () {
  'use strict';
  const palette = {'Oxigenodependientes':'#0F69B4','Electrodependientes':'#E0701E','Adultos':'#56866A','Adulto':'#56866A','Niños':'#9874B1','Niño':'#9874B1','Sin clasificación':'#718096','Sin información':'#718096','Cilindro':'#0F69B4','Termo':'#287F99','Concentrador':'#C76820','Ventilador mecánico invasivo':'#95632D','Ventilador mecánico':'#95632D','Con oxigenoterapia':'#C76820','Con ventilación mecánica':'#95632D'};
  const instances = new Map();
  function groups(rows) {
    return (rows || []).map(r => {
      const parts = (r.parts || []).map(p=>({label:p.label,value:p.n,color:palette[p.label]}));
      const sum = parts.reduce((n,p)=>n+(Number.isFinite(p.value)?p.value:0),0);
      if (Number.isFinite(r.n) && r.n > sum && parts.length) parts.push({label:'Sin clasificación',value:r.n-sum,color:palette['Sin clasificación']});
      return {label:r.label || 'Sin información',value:r.n,parts};
    });
  }
  function render(d, filters, choose) {
    const host=document.getElementById('charts');
    const electro=(d.groups.Dependencia || []).find(x=>x.label==='Electrodependientes')?.n || 0;
    const specifications=[
      {id:'territory',type:'stacked',wide:true,title:'¿Cómo se distribuye el registro por comuna?',subtitle:'Cantidad y participación en la selección · Desglose por dependencia',field:'Comuna',data:groups(d.charts.territory),total:d.total},
      {id:'dependency',type:'donut',title:'Tipo de dependencia',subtitle:'Participación sobre todos los registros seleccionados',field:'Dependencia',data:groups(d.groups.Dependencia),total:d.total},
      {id:'ages',type:'donut',title:'Adultos y niños',subtitle:'Composición etaria de la selección actual',field:'ADULTO/NIÑO',data:groups(d.groups['ADULTO/NIÑO']),total:d.total},
      {id:'age-territory',type:'stacked100',wide:true,title:'Composición etaria en cada comuna',subtitle:'Cada barra representa el 100% de su comuna · Las etiquetas conservan el número de registros',field:'Comuna',data:groups(d.charts.age),total:d.total},
      {id:'equipment',type:'ranking',title:'Equipos registrados',subtitle:'Ranking por cantidad · Porcentajes sobre la selección',field:'Equipo',data:groups(d.groups.Equipo),total:d.total},
      {id:'modality',type:'horizontal',title:'Modalidad de electrodependencia',subtitle:'Porcentajes sobre electrodependientes seleccionados · Derivada del equipo informado',field:'Modalidad',data:groups(d.charts.modality).map(({label,value})=>({label,value})),total:electro}
    ];
    for (const spec of specifications) {
      let entry=instances.get(spec.id);
      if (!entry) {
        const article=document.createElement('article');
        article.id='viz-'+spec.id;
        article.className='viz-card'+(spec.wide?' viz-wide':'');
        host.append(article);
        entry={el:article,instance:null}; instances.set(spec.id,entry);
      }
      const config={...spec,unit:'registros',locale:'es-CL',colors:palette,context:Object.entries(filters).map(([k,v])=>k+': '+v).join(' · ')||'Todos los registros · Sin filtros',selected:filters[spec.field],sort:spec.type==='donut'?'none':'desc',onSelect:label=>choose(spec.field,label)};
      if(spec.id==='territory'){
        config.selectedSeries=filters.Dependencia;
        config.onSeriesSelect=label=>choose('Dependencia',label);
      }
      if(spec.id==='age-territory'){
        const ages={'Adultos':'Adulto','Niños':'Niño'};
        config.selectedSeries=Object.keys(ages).find(label=>ages[label]===filters['ADULTO/NIÑO']);
        config.onSeriesSelect=label=>choose('ADULTO/NIÑO',ages[label]||label);
      }
      if(entry.instance)entry.instance.update(config);else entry.instance=PublicCharts.mount(entry.el,config);
    }
  }
  window.PublicDashboard={render,groups,destroy(){instances.forEach(x=>x.instance?.destroy());instances.clear();}};
})();
