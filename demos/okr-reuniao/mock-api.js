/* Demo estática do Dashboard de Reunião OKR.
   Substitui o backend (Worker + D1 + KV + proxy /dados) por dados fictícios em
   memória: nomes, revendas e números são inventados. Edições valem até recarregar. */
(function () {
  const OKR_APPROVAL = 0.7;

  // Mesma regra de src/okr/krs.js: atingir a meta = 70% de progresso.
  function computeProgress({ meses, target, percentValue, lowerIsBetter }) {
    const nums = (meses || []).map((n) => Number(n) || 0);
    const nonzero = nums.filter((n) => n !== 0);
    const agg = percentValue
      ? (nonzero.length ? nonzero.reduce((a, b) => a + b, 0) / nonzero.length : 0)
      : nums.reduce((a, b) => a + b, 0);
    if (!(target > 0)) return 0;
    if (lowerIsBetter) return agg <= 0 ? 1 : (target / agg) * OKR_APPROVAL;
    return (agg / target) * OKR_APPROVAL;
  }

  function payload(secoes, atualizadoEm) {
    const out = secoes.map((s) => ({
      nome: s.nome,
      krs: s.krs.map((k) => ({ squad: '', sub: '', ...k, progress: computeProgress(k) })),
    }));
    const all = out.flatMap((s) => s.krs);
    const okrGeral = all.length ? all.reduce((a, k) => a + Math.min(k.progress, 1), 0) / all.length : 0;
    return { atualizadoEm, okrGeral, secoes: out };
  }

  const IG = { owner: 'Gabriela', squad: 'Carla · Elisa' };

  /* ---------- Q1 (jan–mar) — trimestre fechado ---------- */
  window.DEMO_OKR_Q1 = payload([
    { nome: 'Clientes', krs: [
      { owner: 'Carla', titulo: 'Alfa', sub: 'Leads', target: 26, meses: [22, 10, 4] },
      { owner: 'Carla', titulo: 'Nexo', sub: 'Leads', target: 25, meses: [18, 11, 6] },
      { owner: 'Carla', titulo: 'Prisma', sub: 'Leads', target: 75, meses: [38, 47, 41] },
      { owner: 'Carla', titulo: 'Vértice', sub: 'Leads', target: 60, meses: [27, 31, 22] },
      { owner: 'Carla', titulo: 'Orbe', sub: 'Interações', target: 1500, meses: [1650, 420, 130] },
    ] },
    { nome: 'Geração de Leads', krs: [
      { owner: 'Carla', titulo: 'Expansão', sub: 'Geração de leads', target: 33, meses: [8, 15, 12] },
      { owner: 'Carla', titulo: 'Beemore', sub: 'Geração de leads', target: 60, meses: [22, 31, 78] },
    ] },
    { nome: 'Site', krs: [
      { owner: 'Helena', squad: 'Elisa', titulo: 'Beemore', sub: 'Texto', target: 70, meses: [22, 12, 10] },
      { owner: 'Igor', squad: 'Diego', titulo: 'Beemore', sub: 'Técnico', target: 70, meses: [22, 24, 22] },
      { owner: 'Helena', squad: 'Elisa', titulo: 'Uniplus', sub: 'Texto', target: 70, meses: [20, 14, 12] },
      { owner: 'Fábio', titulo: 'Uniplus', sub: 'Visual', target: 70, meses: [10, 7, 2] },
      { owner: 'Igor', squad: 'Diego', titulo: 'Uniplus', sub: 'Técnico', target: 70, meses: [23, 23, 22] },
    ] },
    { nome: 'Projetos', krs: [
      { owner: 'Helena', titulo: 'Guia de Comunicação', target: 70, meses: [0, 30, 16] },
      { owner: 'Helena', squad: 'Fábio', titulo: 'Rebranding', target: 70, meses: [0, 32, 4] },
      { owner: 'Fábio', squad: 'Igor', titulo: 'Visual do Produto', target: 70, meses: [20, 15, 6] },
      { owner: 'Fábio', squad: 'Helena', titulo: 'Intelidata+', target: 70, meses: [33, 0, 34] },
      { owner: 'Fábio', titulo: 'Kit de Eventos', target: 70, meses: [0, 48, 52] },
    ] },
    { nome: 'Instagram', krs: [
      { ...IG, titulo: 'Beemore', sub: 'Seguidores', target: 40, meses: [10, 24, 31] },
      { ...IG, titulo: 'Beemore', sub: 'Visualizações', target: 160000, meses: [412000, 9800, 198000] },
      { ...IG, titulo: 'Intelidata', sub: 'Interações', target: 28000, meses: [9200, 21400, 5100] },
      { ...IG, titulo: 'Intelidata', sub: 'Visualizações', target: 1000000, meses: [128000, 284000, 91000] },
      { ...IG, titulo: 'Uniplus', sub: 'Seguidores', target: 180, meses: [41, 86, 110] },
      { ...IG, titulo: 'Uniplus', sub: 'Visualizações', target: 500000, meses: [612000, 74000, 88000] },
    ] },
  ], '2026-04-01T09:00:00-03:00');

  /* ---------- Q2 (abr–jun) — vinha da planilha via /dados/okr-data.json ---------- */
  const Q2 = payload([
    { nome: 'Clientes', krs: [
      { owner: 'Carla', titulo: 'Alfa', sub: 'Leads', target: 30, meses: [9, 12, 11] },
      { owner: 'Carla', titulo: 'Nexo', sub: 'Leads', target: 28, meses: [7, 8, 6] },
      { owner: 'Carla', titulo: 'Prisma', sub: 'Leads', target: 80, meses: [31, 35, 38] },
      { owner: 'Carla', titulo: 'Vértice', sub: 'Leads', target: 60, meses: [19, 22, 25] },
      { owner: 'Carla', titulo: 'Orbe', sub: 'Interações', target: 1800, meses: [520, 610, 480] },
    ] },
    { nome: 'Funil ADS Intelidata', krs: [
      { owner: 'Carla', squad: 'Igor', titulo: 'Beemore', sub: 'Leads', target: 90, meses: [28, 35, 41] },
    ] },
    { nome: 'Tickets Internos', krs: [
      { owner: 'Igor', squad: 'Todos', titulo: 'Entregues', sub: 'Tickets entregues', target: 120, meses: [38, 44, 41] },
    ] },
    { nome: 'Projetos', krs: [
      { owner: 'Helena', titulo: 'Guia de Comunicação', target: 70, meses: [20, 25, 18] },
      { owner: 'Helena', squad: 'Fábio', titulo: 'Rebranding', target: 70, meses: [15, 20, 30] },
      { owner: 'Igor', squad: 'Diego', titulo: 'Portal do Revendedor', target: 70, meses: [25, 30, 20] },
      { owner: 'Igor', titulo: 'Calendário Editorial Web', target: 70, meses: [10, 30, 35] },
    ] },
    { nome: 'Instagram', krs: [
      { ...IG, titulo: 'Beemore', sub: 'Seguidores', target: 60, meses: [18, 22, 25] },
      { ...IG, titulo: 'Intelidata', sub: 'Visualizações', target: 900000, meses: [240000, 310000, 280000] },
      { ...IG, titulo: 'Uniplus', sub: 'Seguidores', target: 200, meses: [55, 72, 64] },
    ] },
  ], '2026-07-01T09:00:00-03:00');

  /* ---------- Q3 (jul–set) — editável; no original vive no D1 ---------- */
  let nextId = 1;
  const kr = (secao, k) => ({
    dbId: nextId++, secao, squad: '', sub: '', unidade: '',
    mesesAtivos: [true, true, true], lowerIsBetter: false, percentValue: false,
    metaPersonalizada: false, metaMeses: null, ...k,
  });
  let q3 = [
    kr('Clientes', { owner: 'Carla', titulo: 'Alfa', sub: 'Leads', unidade: 'leads', target: 30, meses: [11, 12, 10] }),
    kr('Clientes', { owner: 'Carla', titulo: 'Nexo', sub: 'Leads', unidade: 'leads', target: 30, meses: [9, 13, 9] }),
    kr('Clientes', { owner: 'Carla', titulo: 'Prisma', sub: 'Leads', unidade: 'leads', target: 80, meses: [29, 31, 26] }),
    kr('Clientes', { owner: 'Carla', titulo: 'Vértice', sub: 'Leads', unidade: 'leads', target: 60, meses: [18, 24, 19] }),
    kr('Funil ADS Intelidata', { owner: 'Carla', squad: 'Igor', titulo: 'Beemore', sub: 'Leads', unidade: 'leads', target: 100, meses: [31, 38, 34] }),
    kr('Funil ADS Intelidata', { owner: 'Carla', squad: 'Igor', titulo: 'Uniplus', sub: 'SAL', unidade: 'leads', target: 45, meses: [12, 17, 15],
      metaPersonalizada: true, metaMeses: [12, 15, 18] }),
    kr('Tickets Internos', { owner: 'Igor', squad: 'Todos', titulo: 'Entregues', sub: 'Tickets entregues', unidade: 'tickets', target: 130, meses: [42, 47, 40] }),
    kr('Projetos', { owner: 'Helena', titulo: 'Guia de Comunicação', unidade: '% concluído', target: 70, meses: [0, 35, 20], mesesAtivos: [false, true, true] }),
    kr('Projetos', { owner: 'Igor', squad: 'Diego', titulo: 'Portal do Revendedor', unidade: '% concluído', target: 70, meses: [25, 25, 10] }),
    kr('Projetos', { owner: 'Igor', squad: 'Diego · Fábio', titulo: 'Dashboard TV', unidade: '% concluído', target: 70, meses: [0, 0, 40], mesesAtivos: [false, false, true] }),
    kr('Projetos', { owner: 'Fábio', squad: 'Bruno', titulo: 'Catálogo de Folders', unidade: '% concluído', target: 70, meses: [20, 30, 12] }),
    kr('Redes Sociais', { ...IG, titulo: 'Beemore', sub: 'Seguidores', unidade: 'seguidores', target: 90, meses: [28, 35, 29] }),
    kr('Redes Sociais', { ...IG, titulo: 'Beemore', sub: 'Taxa de engajamento', unidade: '% engajamento', target: 4, meses: [3.8, 4.4, 4.1], percentValue: true }),
    kr('Redes Sociais', { ...IG, titulo: 'Intelidata', sub: 'Visualizações', unidade: 'visualizações', target: 1200000, meses: [380000, 452000, 410000] }),
    kr('Redes Sociais', { ...IG, titulo: 'Uniplus', sub: 'Seguidores', unidade: 'seguidores', target: 240, meses: [70, 88, 78] }),
  ];
  let q3AtualizadoEm = new Date().toISOString();

  function listQ3() {
    const bySecao = new Map();
    [...q3]
      .sort((a, b) => a.secao.localeCompare(b.secao, 'pt-BR') || a.dbId - b.dbId)
      .forEach((k) => {
        if (!bySecao.has(k.secao)) bySecao.set(k.secao, []);
        const meses = k.meses.map((v, i) => (k.mesesAtivos[i] ? v : 0));
        bySecao.get(k.secao).push({ ...k, meses });
      });
    const secoes = [...bySecao.entries()].map(([nome, krs]) => ({ nome, krs }));
    return { ok: true, quarter: 'Q3', ano: 2026, ...payload(secoes, q3AtualizadoEm) };
  }

  function applyBody(target, b) {
    const need = (cond, msg) => { if (!cond) throw Object.assign(new Error(msg), { status: 400 }); };
    const set = (k, v) => { if (v !== undefined) target[k] = v; };
    if (b.secao !== undefined) need(String(b.secao).trim(), 'seção inválida (1–120 caracteres)');
    if (b.titulo !== undefined) need(String(b.titulo).trim(), 'título inválido (1–120 caracteres)');
    ['secao', 'titulo', 'sub', 'owner', 'squad', 'unidade'].forEach((k) => set(k, b[k] === undefined ? undefined : String(b[k] || '').trim()));
    if (b.target !== undefined) set('target', Number(b.target) || 0);
    if (b.mesesAtivos !== undefined) {
      const a = b.mesesAtivos.map(Boolean);
      need(a.some(Boolean), 'o KR precisa de pelo menos um mês de trabalho');
      target.mesesAtivos = a;
    }
    const meses = target.meses ? [...target.meses] : [0, 0, 0];
    ['mes1', 'mes2', 'mes3'].forEach((k, i) => { if (b[k] !== undefined) meses[i] = Number(b[k]) || 0; });
    target.meses = meses.map((v, i) => (target.mesesAtivos[i] ? v : 0));
    if (b.lowerIsBetter !== undefined) target.lowerIsBetter = !!b.lowerIsBetter;
    if (b.percentValue !== undefined) target.percentValue = !!b.percentValue;
    if (b.metaPersonalizada !== undefined) target.metaPersonalizada = !!b.metaPersonalizada;
    if (b.metaMes1 !== undefined || b.metaMes2 !== undefined || b.metaMes3 !== undefined) {
      target.metaMeses = [b.metaMes1, b.metaMes2, b.metaMes3].map((v) => (v == null ? null : Number(v)));
    }
    q3AtualizadoEm = new Date().toISOString();
  }

  /* ---------- Avisos do Modo Reunião ---------- */
  let avisos = [
    { id: 'a1', title: 'Novo fluxo de aprovação de posts', image: null,
      body: 'A partir da próxima semana, todo post de cliente passa pela revisão do líder de conteúdo antes de ir para o calendário. O status "Em revisão" já está disponível.' },
    { id: 'a2', title: 'Treinamento de mídia paga', image: null,
      body: 'Quinta-feira, 14h, na sala de reuniões: estrutura de campanhas, régua de otimização e leitura dos relatórios de revenda.' },
    { id: 'a3', title: 'Semana do Revendedor', image: null,
      body: 'O evento anual com as revendas acontece em novembro. Precisamos fechar identidade visual, convite e roteiro das palestras até o fim do mês.' },
  ];

  /* ---------- Roteador ---------- */
  const reply = (obj, status = 200) => new Promise((resolve) => setTimeout(() => resolve(new Response(JSON.stringify(obj), {
    status, headers: { 'Content-Type': 'application/json; charset=utf-8' },
  })), 150));

  const realFetch = window.fetch.bind(window);
  window.fetch = function (input, init) {
    const opts = init || {};
    const url = new URL(typeof input === 'string' ? input : input.url, location.href);
    const path = url.pathname;
    const method = (opts.method || 'GET').toUpperCase();
    const body = () => { try { return JSON.parse(opts.body || '{}'); } catch { return {}; } };

    try {
      if (path === '/dados/okr-data.json') return reply(Q2);

      if (path === '/api/me') {
        return reply({ ok: true, login: 'visitante.demo', canEditAvisos: true, canEditOkr: true, canCreateOkr: true,
          canEditOkrConfig: true, canStartMeeting: true, isSuper: true });
      }

      if (path === '/api/avisos') {
        if (method === 'PUT') {
          const b = body();
          avisos = (Array.isArray(b.avisos) ? b.avisos : [])
            .filter((a) => a && (a.title || a.body || a.image))
            .map((a, i) => ({ id: String(a.id || 'a' + i), title: String(a.title || ''), body: String(a.body || ''), image: a.image || null }));
        }
        return reply({ ok: true, avisos });
      }

      if (path === '/api/okr/krs') {
        if (method === 'GET') {
          if (url.searchParams.get('quarter') !== 'Q3') return reply({ ok: true, atualizadoEm: null, okrGeral: 0, secoes: [] });
          return reply(listQ3());
        }
        if (method === 'POST') {
          const novo = kr('', { meses: [0, 0, 0], target: 0 });
          applyBody(novo, body());
          q3.push(novo);
          return reply({ ok: true, id: novo.dbId }, 201);
        }
      }

      const m = path.match(/^\/api\/okr\/krs\/(\d+)$/);
      if (m) {
        const idx = q3.findIndex((k) => k.dbId === Number(m[1]));
        if (idx < 0) return reply({ ok: false, error: 'KR não encontrado' }, 404);
        if (method === 'PATCH') { applyBody(q3[idx], body()); return reply({ ok: true, id: q3[idx].dbId }); }
        if (method === 'DELETE') { q3.splice(idx, 1); q3AtualizadoEm = new Date().toISOString(); return reply({ ok: true, id: Number(m[1]) }); }
      }
    } catch (e) {
      return reply({ ok: false, error: e.message }, e.status || 500);
    }

    return realFetch(input, init);
  };
})();
