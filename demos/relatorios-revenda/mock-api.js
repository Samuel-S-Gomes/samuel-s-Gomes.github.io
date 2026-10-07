// ============================================================================
// mock-api.js — Demo de portfólio (dados 100% fictícios).
// Intercepta window.fetch para as rotas /api/relatorios/* que o dashboard real
// (Paginas-MKT/public/dashboard/relatorios-revenda/) consulta, e responde com
// dados gerados na hora — nenhum backend, nenhuma credencial, nenhum dado real.
// Mesmo padrão das outras demos deste portfólio (ver demos/okr-reuniao,
// demos/financeiro-revendas): shim de fetch + gerador determinístico.
// ============================================================================
(function(){
  'use strict';

  // ---- PRNG determinístico (mesma seed = mesmos números sempre) ------------
  function hashSeed(str){
    let h=1779033703^str.length;
    for(let i=0;i<str.length;i++){h=Math.imul(h^str.charCodeAt(i),3432918353);h=(h<<13)|(h>>>19);}
    return ()=>{h=Math.imul(h^(h>>>16),2246822507);h=Math.imul(h^(h>>>13),3266489909);h^=h>>>16;return h>>>0;};
  }
  function rngFor(seedStr){
    const seedFn=hashSeed(seedStr); let a=seedFn();
    return function(){a|=0;a=(a+0x6D2B79F5)|0;let t=Math.imul(a^(a>>>15),1|a);t=(t+Math.imul(t^(t>>>7),61|t))^t;return ((t^(t>>>14))>>>0)/4294967296;};
  }
  const pick=(rng,arr)=>arr[Math.floor(rng()*arr.length)];
  const int=(rng,lo,hi)=>Math.round(lo+rng()*(hi-lo));

  // ---- Calendário: MONTH_FLOOR real do dashboard até o mês corrente --------
  const NOWD=new Date();
  const NOWM=NOWD.getFullYear()+'-'+String(NOWD.getMonth()+1).padStart(2,'0');
  function monthsBetween(a,b){
    const out=[]; let [y,m]=a.split('-').map(Number); const [ey,em]=b.split('-').map(Number);
    while(y<ey||(y===ey&&m<=em)){out.push(y+'-'+String(m).padStart(2,'0'));if(++m>12){m=1;y++;}}
    return out;
  }
  // Janela de dados: 14 meses até o corrente (2 meses "sem histórico" antes da
  // série de 12 meses pré-carregada pelo front — mesma sensação de cliente
  // recém-chegado que a Vetta/Bravo etc teriam num relatório real).
  const DATA_START=(()=>{const d=new Date(NOWD.getFullYear(),NOWD.getMonth()-13,1);return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0');})();
  const ALL_MONTHS=monthsBetween(DATA_START,NOWM);
  const isCurrent=m=>m===NOWM;

  // ---- Imagens reais por ramo de atividade -----------------------------------
  // O Módulo de Edição e a área de Criativos/Publicações precisam de imagens de
  // verdade (não placeholders abstratos) para o mockup fazer sentido. Fotos de
  // banco livre (Openverse — Flickr/Wikimedia sob licença Creative Commons
  // comercial), curadas por ramo de atividade de cada cliente fictício, e
  // baixadas para img/<cliente>/N.jpg (self-contained: a demo não depende do
  // Flickr estar no ar, nem sofre com hotlink/CSP em nenhum ambiente).
  const IMG_POOLS={
    vetta:[ // software / tecnologia
      'img/vetta/1.jpg',
      'img/vetta/2.jpg',
      'img/vetta/3.jpg',
      'img/vetta/4.jpg',
      'img/vetta/5.jpg',
      'img/vetta/6.jpg',
      'img/vetta/7.jpg',
      'img/vetta/8.jpg',
      'img/vetta/9.jpg',
      'img/vetta/10.jpg',
    ],
    praxis:[ // contabilidade / finanças
      'img/praxis/1.jpg',
      'img/praxis/2.jpg',
      'img/praxis/3.jpg',
      'img/praxis/4.jpg',
      'img/praxis/5.jpg',
      'img/praxis/6.jpg',
      'img/praxis/7.jpg',
      'img/praxis/8.jpg',
      'img/praxis/9.jpg',
      'img/praxis/10.jpg',
    ],
    zelo:[ // alimentos / mercado fresco
      'img/zelo/1.jpg',
      'img/zelo/2.jpg',
      'img/zelo/3.jpg',
      'img/zelo/4.jpg',
      'img/zelo/5.jpg',
      'img/zelo/6.jpg',
      'img/zelo/7.jpg',
      'img/zelo/8.jpg',
      'img/zelo/9.jpg',
      'img/zelo/10.jpg',
    ],
    configura:[ // móveis / decoração
      'img/configura/1.jpg',
      'img/configura/2.jpg',
      'img/configura/3.jpg',
      'img/configura/4.jpg',
      'img/configura/5.jpg',
      'img/configura/6.jpg',
      'img/configura/7.jpg',
      'img/configura/8.jpg',
      'img/configura/9.jpg',
      'img/configura/10.jpg',
    ],
    bravo:[ // academia / fitness
      'img/bravo/1.jpg',
      'img/bravo/2.jpg',
      'img/bravo/3.jpg',
      'img/bravo/4.jpg',
      'img/bravo/5.jpg',
      'img/bravo/6.jpg',
      'img/bravo/7.jpg',
      'img/bravo/8.jpg',
      'img/bravo/9.jpg',
      'img/bravo/10.jpg',
    ],
    onponto:[ // logística / transporte
      'img/onponto/1.jpg',
      'img/onponto/2.jpg',
      'img/onponto/3.jpg',
      'img/onponto/4.jpg',
      'img/onponto/5.jpg',
      'img/onponto/6.jpg',
      'img/onponto/7.jpg',
      'img/onponto/8.jpg',
      'img/onponto/9.jpg',
      'img/onponto/10.jpg',
    ],
  };
  function imgFor(revKey,seed){
    const pool=IMG_POOLS[revKey]||IMG_POOLS.vetta;
    const rng=rngFor(seed);
    return pool[Math.floor(rng()*pool.length)];
  }
  function postImgFor(revKey,seed){
    const pool=IMG_POOLS[revKey]||IMG_POOLS.vetta;
    const rng=rngFor(seed);
    return pool[Math.floor(rng()*pool.length)];
  }

  // ---- As revendas fictícias -------------------------------------------------
  // Mesmo elenco de empresas fictícias proposto para a demo do Financeiro de
  // Revendas (docs/operacao-marketing.md) — consistência entre as duas demos.
  // `channels` reflete que nem todo cliente contrata as mesmas frentes (o
  // Módulo de Edição do dashboard oculta área/bloco quando a frente não existe,
  // em vez de mostrar uma seção zerada) — ver defaultVisibility() mais abaixo.
  const REVENDAS=[
    {key:'vetta',    nome:'Vetta Sistemas',      username:'vettasistemas',
      channels:{meta:true, google:true,  instagram:true},
      base:{leads:34,reach:9200,cpl:22,followers:2600,growth:1.035}},
    {key:'praxis',   nome:'Praxis Contábil',     username:'praxiscontabil',
      channels:{meta:true, google:false, instagram:true},
      base:{leads:18,reach:5400,cpl:31,followers:1350,growth:1.025}},
    {key:'zelo',     nome:'Zelo Alimentos',      username:'zeloalimentos',
      channels:{meta:true, google:true,  instagram:true},
      base:{leads:41,reach:12800,cpl:14,followers:4800,growth:1.045}},
    {key:'configura',nome:'Configura Móveis',    username:'configuramoveis',
      channels:{meta:false,google:true,  instagram:true},
      base:{leads:26,reach:7600,cpl:26,followers:2100,growth:1.03}},
    {key:'bravo',    nome:'Bravo Fitness',       username:'bravofitness',
      channels:{meta:true, google:false, instagram:true},
      base:{leads:52,reach:15400,cpl:11,followers:6200,growth:1.06}},
    {key:'onponto',  nome:'On Ponto Logística',  username:'',
      channels:{meta:true, google:true,  instagram:false},
      base:{leads:15,reach:4100,cpl:38,followers:0, growth:1.0}},
  ];
  const revByKey=k=>REVENDAS.find(r=>r.key===k);

  // Visibilidade padrão do Módulo de Edição por cliente: reflete só as frentes
  // realmente contratadas (`channels`). Continua editável na hora — o analista
  // pode reexibir um bloco escondido pelo módulo, mesmo que a frente não exista
  // aqui (a demo não impede reativar, só a real também não impediria).
  function defaultVisibility(rev){
    const v={};
    if(!rev.channels.google){ v['block:google']=false; v['block:gkw']=false; v['block:gcmp']=false; v['kpis:google']=false; v['leads:google']=false; }
    if(!rev.channels.meta){ v['block:ads']=false; v['block:criativos']=false; v['kpis:meta']=false; v['leads:meta']=false; }
    if(!rev.channels.instagram){ v['area:redes']=false; v['kpis:ig']=false; }
    return v;
  }

  const AD_NOMES=['Campanha Institucional','Depoimento de Cliente','Oferta do Mês','Vídeo Demonstração',
    'Carrossel de Benefícios','Anúncio de Reels','Prova Social','Chamada para WhatsApp','Lançamento de Produto','Remarketing'];
  const KW_TERMOS=['sistema de gestão','software para revenda','automação comercial','crm para pequenas empresas',
    'plataforma de vendas','erp online','gestão financeira empresa','contratar consultoria','solução para loja','app de gestão'];
  const CONJ_NOMES=['Prospecção — Geral','Remarketing — Site','Busca — Marca','Busca — Genérico','Display — Interesses'];
  const ASSUNTOS=['Bastidores da equipe','Dica rápida para o seu negócio','Case de sucesso de cliente','Novidade no catálogo',
    'Enquete com os seguidores','Convite para o webinar','Antes e depois de um projeto','Curiosidade do setor','Promoção relâmpago','Depoimento em vídeo'];

  // ---- geração por revenda+mês (determinística) ------------------------------
  function metaMonthlyRow(rev,m){
    if(!rev.channels.meta) return {m,leads:0,leadsForm:0,leadsWa:0,reach:0,clicks:0,spend:0};
    const rng=rngFor(rev.key+'|meta|'+m);
    const idx=ALL_MONTHS.indexOf(m);
    const trend=1+idx*0.012; // leve crescimento ao longo do tempo
    const noise=0.85+rng()*0.3;
    const leads=Math.max(1,Math.round(rev.base.leads*trend*noise));
    const wa=rng()<0.65 ? Math.round(leads*(0.15+rng()*0.35)) : 0;
    const form=leads-wa;
    const reach=Math.round(rev.base.reach*trend*(0.85+rng()*0.3));
    const clicks=Math.round(reach*(0.03+rng()*0.025));
    const spend=Math.round(leads*rev.base.cpl*(0.9+rng()*0.2));
    return {m,leads,leadsForm:form,leadsWa:wa,reach,clicks,spend};
  }
  function googleRow(rev,m){
    if(!rev.channels.google) return null;
    const rng=rngFor(rev.key+'|gads|'+m);
    const idx=ALL_MONTHS.indexOf(m);
    const trend=1+idx*0.01;
    const impr=Math.round(rev.base.reach*1.6*trend*(0.8+rng()*0.4));
    const clicks=Math.round(impr*(0.02+rng()*0.02));
    const cost=Math.round(clicks*(2.2+rng()*1.8));
    // Regra de fidelidade real: a ação de conversão fica zerada (rastreamento
    // não configurado) mesmo com tráfego — mantido aqui como detalhe autêntico.
    const conv=0;
    return {m,conv,impr,clicks,cost};
  }
  function igMonthlyRow(rev,m){
    if(!rev.channels.instagram) return {reach:0,views:0,visits:0};
    const rng=rngFor(rev.key+'|ig|'+m);
    const idx=ALL_MONTHS.indexOf(m);
    const trend=1+idx*0.015;
    const reach=Math.round(rev.base.reach*0.55*trend*(0.85+rng()*0.3));
    const views=Math.round(reach*(1.6+rng()*0.8));
    const visits=Math.round(reach*(0.08+rng()*0.05));
    return {reach,views,visits};
  }
  function followerSeries(rev){
    if(!rev.channels.instagram) return [];
    const rows=[]; let v=Math.round(rev.base.followers/Math.pow(rev.base.growth,ALL_MONTHS.length-1));
    ALL_MONTHS.forEach((m)=>{
      const rng=rngFor(rev.key+'|fol|'+m);
      v=Math.round(v*(rev.base.growth-0.01+rng()*0.02));
      rows.push({m,v});
    });
    return rows;
  }
  function followerDaily(rev){
    if(!rev.channels.instagram) return [];
    // últimos ~4 meses em base diária, para habilitar granularidade Semana/Dia.
    const monthly=followerSeries(rev);
    const recentMonths=ALL_MONTHS.slice(-4);
    const out=[];
    recentMonths.forEach(m=>{
      const row=monthly.find(x=>x.m===m); if(!row) return;
      const [y,mm]=m.split('-').map(Number);
      const daysInMonth=isCurrent(m)?NOWD.getDate():new Date(y,mm,0).getDate();
      const prevRow=monthly[monthly.indexOf(row)-1];
      const start=prevRow?prevRow.v:Math.round(row.v*0.97);
      for(let d=1;d<=daysInMonth;d++){
        const rng=rngFor(rev.key+'|fold|'+m+'-'+d);
        const frac=d/daysInMonth;
        const v=Math.round(start+(row.v-start)*frac + (rng()-0.5)*3);
        out.push({data:m+'-'+String(d).padStart(2,'0'),v});
      }
    });
    return out;
  }
  function adsForMonth(rev,m){
    if(!rev.channels.meta) return [];
    const mm=metaMonthlyRow(rev,m);
    if(mm.reach===0) return [];
    const rng=rngFor(rev.key+'|ads|'+m);
    const n=int(rng,5,9);
    const rows=[];
    let remCad=mm.leads, remClicks=mm.clicks, remReach=mm.reach;
    for(let i=0;i<n;i++){
      const last=i===n-1;
      const share=last?1:(0.12+rng()*0.28);
      const cad=last?Math.max(0,remCad):Math.round(remCad*share);
      const clicks=last?Math.max(cad,remClicks):Math.round(remClicks*share);
      const reach=last?Math.max(clicks,Math.round(remReach*0.3)):Math.round(remReach*(share*0.9));
      remCad-=cad;remClicks-=clicks;remReach-=reach;
      const wa=rng()<0.5?Math.round(cad*(0.2+rng()*0.4)):0;
      const nome=(i+1)+' - '+pick(rng,AD_NOMES);
      rows.push({n:nome,reach:Math.max(reach,cad),clicks:Math.max(clicks,cad),cad,cadForm:cad-wa,cadWa:wa,
        thumb:imgFor(rev.key,rev.key+'-ad-'+m+'-'+i),creative:nome});
    }
    return rows.sort((a,b)=>b.cad-a.cad);
  }
  function keywordsForMonth(rev,m){
    if(!rev.channels.google) return [];
    const g=googleRow(rev,m); if(!g||!g.clicks) return [];
    const rng=rngFor(rev.key+'|kw|'+m);
    const n=int(rng,6,10);
    let remClicks=g.clicks, remImpr=g.impr, remCost=g.cost;
    const rows=[];
    for(let i=0;i<n;i++){
      const last=i===n-1;
      const share=last?1:(0.1+rng()*0.25);
      const clicks=last?Math.max(1,remClicks):Math.round(remClicks*share);
      const impr=last?Math.max(clicks,remImpr):Math.round(remImpr*share);
      const cost=last?Math.max(0,remCost):Math.round(remCost*share);
      remClicks-=clicks;remImpr-=impr;remCost-=cost;
      rows.push({kw:pick(rng,KW_TERMOS),clicks:Math.max(clicks,1),impr:Math.max(impr,clicks),cost:Math.max(cost,0),conv:0});
    }
    return rows.sort((a,b)=>b.clicks-a.clicks);
  }
  function campaignsForMonth(rev,m){
    if(!rev.channels.google) return [];
    const g=googleRow(rev,m); if(!g||!g.clicks) return [];
    const rng=rngFor(rev.key+'|cmp|'+m);
    const names=CONJ_NOMES.slice(0,int(rng,3,5));
    let remClicks=g.clicks, remImpr=g.impr, remCost=g.cost;
    const rows=names.map((name,i)=>{
      const last=i===names.length-1;
      const share=last?1:(0.15+rng()*0.3);
      const clicks=last?Math.max(1,remClicks):Math.round(remClicks*share);
      const impr=last?Math.max(clicks,remImpr):Math.round(remImpr*share);
      const cost=last?Math.max(0,remCost):Math.round(remCost*share);
      remClicks-=clicks;remImpr-=impr;remCost-=cost;
      return {name,clicks:Math.max(clicks,1),impr:Math.max(impr,clicks),cost:Math.max(cost,0),conv:0};
    });
    return rows.sort((a,b)=>b.clicks-a.clicks);
  }
  function postsForMonth(rev,m){
    if(!rev.channels.instagram || ALL_MONTHS.indexOf(m)<0) return {posts:[],notes:[]};
    const rng=rngFor(rev.key+'|posts|'+m);
    const [y,mm]=m.split('-').map(Number);
    const daysInMonth=isCurrent(m)?NOWD.getDate():new Date(y,mm,0).getDate();
    const n=int(rng,6,12);
    const fmts=['Post Único','Post Único','Carrossel','Carrossel','Reels','Reels','Stories'];
    const posts=[];
    for(let i=0;i<n;i++){
      const day=int(rng,1,daysInMonth);
      const date=m+'-'+String(day).padStart(2,'0');
      const formato=pick(rng,fmts);
      const isStory=formato==='Stories';
      const views=isStory?0:int(rng,800,9000);
      const impulsionado=!isStory&&rev.channels.meta&&rng()<0.35;
      const viewsPaid=impulsionado?Math.round(views*(0.4+rng()*0.8)):0;
      posts.push({
        id:rev.key+'-'+m+'-'+i,
        date,
        formato,
        assunto:pick(rng,ASSUNTOS),
        permalink:'https://www.instagram.com/'+rev.username+'/',
        thumb:postImgFor(rev.key,rev.key+'-post-'+m+'-'+i),
        visualizacoes:views+viewsPaid,
        visualizacoesOrg:views,
        visualizacoesPaid:viewsPaid,
        impulsionado,
        curtidas:isStory?0:int(rng,40,600),
        comentarios:isStory?0:int(rng,1,40),
        salvos:isStory?0:int(rng,2,90),
        envios:isStory?0:int(rng,1,60),
      });
    }
    return {posts,notes:[]};
  }
  function igDailyForMonth(rev,m){
    if(!rev.channels.instagram) return null;
    const idx=ALL_MONTHS.indexOf(m);
    // só os últimos 6 meses têm série diária de resultados (mesma limitação real:
    // "dados diários disponíveis a partir de..." aparece cedo demais senão).
    if(idx<ALL_MONTHS.length-6) return null;
    const [y,mm]=m.split('-').map(Number);
    const daysInMonth=isCurrent(m)?NOWD.getDate():new Date(y,mm,0).getDate();
    const ig=igMonthlyRow(rev,m);
    const dates=[],reach=[],views=[];
    for(let d=1;d<=daysInMonth;d++){
      const rng=rngFor(rev.key+'|igd|'+m+'-'+d);
      dates.push(m+'-'+String(d).padStart(2,'0'));
      reach.push(Math.round((ig.reach/daysInMonth)*(0.5+rng())));
      views.push(Math.round((ig.views/daysInMonth)*(0.5+rng())));
    }
    return {dates,reach,views};
  }

  // ---- payload completo de UM mês (contrato de /api/relatorios/data) --------
  function monthPayload(rev,m){
    if(ALL_MONTHS.indexOf(m)<0){
      return {metaMonthly:{m,leads:0,leadsForm:0,leadsWa:0,reach:0,clicks:0,spend:0},google:rev.channels.google?{m,conv:0,impr:0,clicks:0,cost:0}:null,
        igMonthly:{reach:0,views:0,visits:0},igDaily:null,ads:[],googleKeywords:[],googleCampaigns:[]};
    }
    return {
      metaMonthly:metaMonthlyRow(rev,m),
      google:googleRow(rev,m),
      igMonthly:igMonthlyRow(rev,m),
      igDaily:igDailyForMonth(rev,m),
      ads:adsForMonth(rev,m),
      googleKeywords:keywordsForMonth(rev,m),
      googleCampaigns:campaignsForMonth(rev,m),
    };
  }

  // ---- persistência local (Modo Apresentação + status ativo/inativo) --------
  const LS_PREFIX='demo-relatorios-revenda:';
  function lsGet(key,fallback){ try{const v=localStorage.getItem(LS_PREFIX+key); return v?JSON.parse(v):fallback;}catch(e){return fallback;} }
  function lsSet(key,val){ try{localStorage.setItem(LS_PREFIX+key,JSON.stringify(val));}catch(e){} }

  // ---- roteador do shim de fetch ---------------------------------------------
  function jsonResponse(obj){
    return Promise.resolve(new Response(JSON.stringify(obj),{status:200,headers:{'Content-Type':'application/json'}}));
  }
  function qp(url,name){ return new URL(url,location.href).searchParams.get(name); }

  const originalFetch=window.fetch.bind(window);
  window.fetch=function(input,init){
    const url=typeof input==='string'?input:(input&&input.url)||'';
    if(!url.startsWith('/api/relatorios/')) return originalFetch(input,init);

    const revKey=qp(url,'revenda')||'vetta';
    const rev=revByKey(revKey)||REVENDAS[0];

    // GET /api/relatorios/data?revenda=&month=
    if(url.indexOf('/api/relatorios/data')===0){
      const month=qp(url,'month');
      const targetM=month||NOWM;
      const p=monthPayload(rev,targetM);
      return jsonResponse({
        ok:true,
        revenda:rev.key,
        revendas:REVENDAS.map(r=>({key:r.key,nome:r.nome,username:r.username,gads:r.channels.google})),
        month:targetM,
        current:NOWM,
        updated:NOWD.toISOString().slice(0,10),
        data:p,
      });
    }

    // GET /api/relatorios/series?revenda=&since=&until=
    if(url.indexOf('/api/relatorios/series')===0){
      const since=qp(url,'since')||DATA_START+'-01', until=qp(url,'until')||(NOWM+'-28');
      const months=ALL_MONTHS.filter(m=>m>=since.slice(0,7)&&m<=until.slice(0,7));
      return jsonResponse({
        ok:true,
        metaMonthly:months.map(m=>metaMonthlyRow(rev,m)),
        google:rev.channels.google?months.map(m=>googleRow(rev,m)):[],
      });
    }

    // GET /api/relatorios/followers?revenda=
    if(url.indexOf('/api/relatorios/followers')===0){
      return jsonResponse({ok:true,monthly:followerSeries(rev),daily:followerDaily(rev)});
    }

    // GET /api/relatorios/creatives?month=&revenda=  (não usado: ads já vêm com thumb "ao vivo")
    if(url.indexOf('/api/relatorios/creatives')===0){
      return jsonResponse({ok:true,creatives:[]});
    }

    // GET /api/relatorios/posts?month=&revenda=
    if(url.indexOf('/api/relatorios/posts')===0){
      const month=qp(url,'month')||NOWM;
      return jsonResponse(Object.assign({ok:true},postsForMonth(rev,month)));
    }

    // GET/PUT /api/relatorios/apresentacao?revenda=
    if(url.indexOf('/api/relatorios/apresentacao')===0){
      const method=(init&&init.method)||'GET';
      if(method==='PUT'){
        try{ const body=JSON.parse(init.body); lsSet('apres:'+rev.key,body.config||{}); }catch(e){}
        return jsonResponse({ok:true});
      }
      // Sem config salva ainda (1ª visita): a demo semeia a visibilidade padrão
      // do cliente (defaultVisibility) em vez de devolver null — é isso que faz
      // o Módulo de Edição já abrir refletindo as frentes que o cliente contrata.
      const saved=lsGet('apres:'+rev.key,null);
      const config=saved||{v:1,order:null,hidden:[],custom:[],postOrder:{},notes:{},visibility:defaultVisibility(rev)};
      return jsonResponse({ok:true,config});
    }

    // GET/PUT /api/relatorios/status (ativos/inativos, global à demo)
    if(url.indexOf('/api/relatorios/status')===0){
      const method=(init&&init.method)||'GET';
      if(method==='PUT'){
        try{ const body=JSON.parse(init.body); lsSet('status',body.inactive||[]); }catch(e){}
        return jsonResponse({ok:true});
      }
      return jsonResponse({ok:true,inactive:lsGet('status',[])});
    }

    // qualquer outra rota /api/relatorios/* não coberta: 404 silencioso
    return Promise.resolve(new Response(JSON.stringify({ok:false,error:'not_mocked'}),{status:404,headers:{'Content-Type':'application/json'}}));
  };
})();
