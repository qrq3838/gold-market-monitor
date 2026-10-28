(() => {
  "use strict";
  const PALETTE = {blue:"#285c89",teal:"#238a84",purple:"#8661a5",red:"#c46c58",gray:"#768292",gold:"#d4a63f"};
  const definitions = [
    {id:"cftc-positions",file:"cftc_gold_positions",frequency:"周频 · 持仓日期",panels:["净多占比与 156 期分位（%）","多空持仓周变化（手）"],units:["%","手"],metrics:[
      {key:"net_long_pct_oi",name:"净多占总持仓",color:PALETTE.blue,panel:0,unit:"%"},
      {key:"percentile_156_reports",name:"156 期分位",color:PALETTE.purple,panel:0,unit:"%",dashed:true},
      {key:"long_change",name:"多头周变化",color:PALETTE.teal,panel:1,unit:"手",type:"bar"},
      {key:"short_change",name:"空头周变化",color:PALETTE.red,panel:1,unit:"手",type:"bar"},
      {key:"net_change",name:"净多周变化",color:PALETTE.blue,panel:1,unit:"手",hidden:true}
    ],summary:[["net_long","净多头","手"],["net_long_pct_oi","净多占比","%"],["percentile_156_reports","156 期分位","%"]]},
    {id:"yield-decomposition",file:"us_yield_decomposition",frequency:"日频 · 三项共同有效日期",panels:["10 年期收益率（%）","20 日变化分解（bp）"],units:["%","bp"],metrics:[
      {key:"nominal_percent",name:"名义利率",color:PALETTE.blue,panel:0,unit:"%"},
      {key:"real_percent",name:"实际利率",color:PALETTE.teal,panel:0,unit:"%"},
      {key:"breakeven_percent",name:"盈亏平衡通胀率",color:PALETTE.purple,panel:0,unit:"%"},
      {key:"real_change_20d_bp",name:"实际利率变化",color:PALETTE.teal,panel:1,unit:"bp",type:"bar",stack:"decomp"},
      {key:"breakeven_change_20d_bp",name:"通胀补偿变化",color:PALETTE.purple,panel:1,unit:"bp",type:"bar",stack:"decomp"},
      {key:"nominal_change_20d_bp",name:"名义利率变化",color:PALETTE.blue,panel:1,unit:"bp"}
    ],summary:[["nominal_percent","名义利率","%"],["real_percent","实际利率","%"],["breakeven_percent","通胀补偿","%"]]},
    {id:"gold-risk",file:"comex_gold_risk",frequency:"日频 · COMEX 有效交易日",panels:["距 252 日最高收盘价回撤（%）","20 日年化波动率（%）"],units:["%","%"],metrics:[
      {key:"drawdown_252d_percent",name:"252 日高点回撤",color:PALETTE.red,panel:0,unit:"%",area:true},
      {key:"volatility_20d_annualized_percent",name:"20 日年化波动率",color:PALETTE.blue,panel:1,unit:"%",area:true}
    ],summary:[["drawdown_252d_percent","当前回撤","%"],["volatility_20d_annualized_percent","年化波动率","%"]]}
  ];
  const format = (v,u) => v == null ? "—" : Number(v).toLocaleString("zh-CN",{maximumFractionDigits:u==="手"?0:2,minimumFractionDigits:u==="手"?0:2})+(u==="手"?" 手":u);
  const esc = value => String(value).replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
  async function mount(config) {
    const byId = suffix => document.getElementById(config.id+"-"+suffix);
    const status=byId("status"), host=byId("chart"), legend=byId("legend");
    try {
      if (!window.echarts) throw new Error("图表组件载入失败，请刷新页面");
      const response=await fetch("data/"+config.file+".json",{cache:"no-store"});
      if (!response.ok) throw new Error("数据载入失败："+response.status);
      const payload=await response.json();
      if (!Array.isArray(payload.dates)||!payload.dates.length||!payload.series||
          !payload.dates.every((d,i)=>/^\d{4}-\d{2}-\d{2}$/.test(d)&&(!i||d>payload.dates[i-1])) ||
          !config.metrics.every(m=>Array.isArray(payload.series[m.key])&&payload.series[m.key].length===payload.dates.length&&payload.series[m.key].every(v=>v==null||Number.isFinite(v)))) {
        throw new Error("数据结构校验失败");
      }
      const dates=payload.dates, latest=dates[dates.length-1], chart=echarts.init(host);
      const state={start:"",end:latest,gold:true,visible:new Set(config.metrics.filter(m=>!m.hidden).map(m=>m.key))};
      let alignedGold=null;
      try {alignedGold=GoldOverlay.alignToDates(dates,await GoldOverlay.load());}
      catch (_) {state.gold=false;}
      byId("latest").textContent="数据截至 "+latest;
      const summary=byId("summary");
      for (const [key,label,unit] of config.summary) {
        const cell=document.createElement("div"),caption=document.createElement("span"),value=document.createElement("strong");
        caption.textContent=label; value.textContent=format(payload.series[key].at(-1),unit);
        cell.append(caption,value);summary.append(cell);
      }
      const start=byId("start-date"),end=byId("end-date");
      for (const input of [start,end]) {input.min=dates[0];input.max=latest;}
      function drawLegend() {
        legend.replaceChildren();
        for (const metric of config.metrics) {
          const button=document.createElement("button"),swatch=document.createElement("span"),text=document.createElement("span");
          button.type="button";button.setAttribute("aria-pressed",String(state.visible.has(metric.key)));
          swatch.className="legend-line";swatch.style.background=metric.color;text.textContent=metric.name;
          button.append(swatch,text);
          button.addEventListener("click",()=>{state.visible.has(metric.key)?state.visible.delete(metric.key):state.visible.add(metric.key);drawLegend();render();});
          legend.append(button);
        }
        if (alignedGold) GoldOverlay.appendToggle(legend,state.gold,()=>{state.gold=!state.gold;drawLegend();render();});
      }
      function render() {
        const indices=dates.map((d,i)=>d>=state.start&&d<=state.end?i:-1).filter(i=>i>=0);
        const shownDates=indices.map(i=>dates[i]), series=[];
        const mobile=host.clientWidth<600, hasGold=state.gold&&alignedGold;
        for (const metric of config.metrics.filter(m=>state.visible.has(m.key))) {
          series.push({name:metric.name,type:metric.type||"line",xAxisIndex:metric.panel,yAxisIndex:2*metric.panel,
            data:indices.map(i=>payload.series[metric.key][i]),showSymbol:false,connectNulls:false,
            itemStyle:{color:metric.color},lineStyle:{width:1.8,type:metric.dashed?"dashed":"solid"},
            areaStyle:metric.area?{opacity:0.11}:undefined,stack:metric.stack,stackStrategy:"all",barMaxWidth:9,
            emphasis:{focus:"series"},animation:false});
        }
        if (hasGold) for(let panel=0;panel<2;panel++) series.push({name:"COMEX 金价",type:"line",xAxisIndex:panel,yAxisIndex:2*panel+1,
          data:indices.map(i=>alignedGold[i]),showSymbol:false,connectNulls:false,lineStyle:{color:PALETTE.gold,width:1.7},itemStyle:{color:PALETTE.gold},z:4});
        const yAxis=[];
        for(let panel=0;panel<2;panel++) {
          yAxis.push({type:"value",gridIndex:panel,name:config.units[panel],nameGap:10,scale:true,axisLabel:{color:"#65717b",fontSize:11,formatter:v=>Math.abs(v)>=10000?(v/10000).toFixed(0)+"万":v},splitLine:{lineStyle:{color:"#e5e9ed",type:"dashed"}}});
          yAxis.push({type:"value",gridIndex:panel,position:"right",name:hasGold?"US$/oz":"",show:!!hasGold,scale:true,
            axisLabel:{color:"#9b762b",fontSize:11},splitLine:{show:false}});
        }
        chart.setOption({animation:false,
          title:config.panels.map((text,i)=>({text,left:mobile?8:18,top:i?360:12,textStyle:{fontSize:mobile?12:14,fontWeight:500,color:"#344759"}})),
          grid:[{left:mobile?48:65,right:hasGold?70:28,top:64,height:240},{left:mobile?48:65,right:hasGold?70:28,top:410,height:240}],
          xAxis:[0,1].map(i=>({type:"category",gridIndex:i,data:shownDates,boundaryGap:false,axisLabel:{fontSize:10,hideOverlap:true,formatter:d=>d.slice(0,7)},axisLine:{lineStyle:{color:"#adb7bf"}},axisTick:{show:false}})),
          yAxis,series,
          axisPointer:{link:[{xAxisIndex:"all"}]},
          tooltip:{trigger:"axis",confine:true,axisPointer:{type:"cross"},formatter:params=>{
            const unique=new Map(params.map(p=>[p.seriesName,p]));
            let content="<strong>"+esc(params[0]?.axisValue||"")+"</strong>";
            for (const p of unique.values()) {const metric=config.metrics.find(m=>m.name===p.seriesName);content+="<br>"+p.marker+esc(p.seriesName)+"："+esc(format(p.value,metric?metric.unit:" US$/oz"));}
            return content;
          }},
          dataZoom:[{type:"inside",xAxisIndex:[0,1],filterMode:"none"},{type:"slider",xAxisIndex:[0,1],bottom:12,height:24,filterMode:"none",borderColor:"#d5dce1",fillerColor:"rgba(212,166,63,.16)",handleStyle:{color:PALETTE.gold},showDataShadow:false}],
          graphic:indices.length?[]:[{type:"text",left:"center",top:"40%",style:{text:"所选范围没有有效数据",fill:"#65717b",fontSize:15}}]
        },true);
        status.textContent=indices.length?config.frequency+" · 展示 "+shownDates[0]+" 至 "+shownDates.at(-1)+" · "+indices.length+" 期":"所选范围没有有效数据";
        if(!alignedGold) status.textContent+=" · COMEX 叠加数据暂不可用";
      }
      function selectRange(years) {
        const cutoff=new Date(latest+"T00:00:00Z");cutoff.setUTCFullYear(cutoff.getUTCFullYear()-Number(years));
        state.start=years==="all"?dates[0]:[cutoff.toISOString().slice(0,10),dates[0]].sort().at(-1);state.end=latest;
        start.value=state.start;end.value=state.end;
        byId("range-buttons").querySelectorAll("button").forEach(b=>b.classList.toggle("active",b.dataset.years===years));
        render();
      }
      byId("range-buttons").addEventListener("click",event=>{const button=event.target.closest("button[data-years]");if(button)selectRange(button.dataset.years);});
      for (const input of [start,end]) input.addEventListener("change",()=>{
        if (!start.value||!end.value||start.value>end.value) {status.textContent="请选择有效日期，开始日期须不晚于结束日期";return;}
        state.start=start.value;state.end=end.value;
        byId("range-buttons").querySelectorAll("button").forEach(b=>b.classList.remove("active"));render();
      });
      const observer=new ResizeObserver(()=>{chart.resize();render();});observer.observe(host);
      drawLegend();selectRange("5");
    } catch (error) {status.textContent="载入失败："+error.message;host.textContent="请刷新页面重试。已有其他指标可继续使用。";}
  }
  definitions.forEach(config=>mount(config));
})();
