/* Demo estática do Cronograma de Projetos.
   Substitui o backend (Worker + D1) por dados fictícios em memória: projetos,
   equipe e números são inventados. CRUD completo (criar/editar/excluir projeto,
   objetivo e pintar a grade) funciona normalmente; tudo some ao recarregar. */
(function () {
  const DATA_RE = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;
  const ESTADOS = new Set(['planejado', 'executado']);

  function segundaDaSemana(iso) {
    const d = new Date(iso + 'T00:00:00Z');
    const dow = d.getUTCDay();
    d.setUTCDate(d.getUTCDate() - (dow === 0 ? 6 : dow - 1));
    return d.toISOString().slice(0, 10);
  }
  function addDias(iso, n) {
    const d = new Date(iso + 'T00:00:00Z');
    d.setUTCDate(d.getUTCDate() + n);
    return d.toISOString().slice(0, 10);
  }
  const addSemanas = (iso, n) => addDias(iso, n * 7);
  const hojeSemana = segundaDaSemana(new Date().toISOString().slice(0, 10));

  /* ---------- Estado em memória ---------- */
  let seqProjeto = 1;
  let seqObjetivo = 1;
  let projetos = [];   // { id, nome, descricao, cor, inicio, fim, ativo, ordem, owner, squad, atualizado_em, atualizado_por }
  let objetivos = [];  // { id, projeto_id, secao, grupo, nome, peso, ordem, concluido, obs, atualizado_em, atualizado_por }
  const celulas = new Map(); // 'objetivoId|semana' -> { objetivo_id, semana, estado, valor }

  const now = () => new Date().toISOString();
  const chaveCelula = (oid, semana) => oid + '|' + semana;

  function somaObjetivos(objs, cels) {
    const somas = new Map();
    for (const c of cels) {
      if (c.estado !== 'executado') continue;
      const atual = somas.get(c.objetivo_id) || { valor: 0, semanas: 0 };
      atual.valor += Number(c.valor) || 0;
      atual.semanas += 1;
      somas.set(c.objetivo_id, atual);
    }
    return objs.map((o) => {
      const s = somas.get(o.id) || { valor: 0, semanas: 0 };
      const peso = o.peso === null || o.peso === undefined ? null : Number(o.peso);
      return {
        ...o,
        executado: Math.round(s.valor * 100) / 100,
        semanas_executadas: s.semanas,
        restante: peso === null ? null : Math.round((peso - s.valor) * 100) / 100,
        pct: peso ? Math.round((s.valor / peso) * 1000) / 10 : null,
      };
    });
  }

  /* ---------- Seed fictício ---------- */
  function semear() {
    const dono = (nome, projetoId, secao, grupo, obj, semanaIni, semanas, peso) => {
      const id = seqObjetivo++;
      objetivos.push({
        id, projeto_id: projetoId, secao, grupo, nome: obj, peso,
        ordem: objetivos.filter((o) => o.projeto_id === projetoId).length * 10,
        concluido: 0, obs: null, atualizado_em: now(), atualizado_por: 'demo',
      });
      // distribui o peso em partes iguais pelas semanas do objetivo; semanas
      // que já passaram viram 'executado', o resto fica só 'planejado'.
      const parte = Math.round((peso / semanas) * 100) / 100;
      for (let i = 0; i < semanas; i++) {
        const semana = addSemanas(semanaIni, i);
        const passou = semana < hojeSemana;
        celulas.set(chaveCelula(id, semana), {
          objetivo_id: id, semana,
          estado: passou ? 'executado' : 'planejado',
          valor: parte,
        });
      }
      return id;
    };

    const A = seqProjeto++; // Redesenho do Portal do Cliente
    const iniA = addSemanas(hojeSemana, -14);
    projetos.push({
      id: A, nome: 'Redesenho do Portal do Cliente',
      descricao: 'Reformulação visual e técnica do portal — telas novas, guia de estilo e testes com usuários.',
      cor: '#0072ce', inicio: iniA, fim: addSemanas(hojeSemana, 10), ativo: 1, ordem: 10,
      owner: 'Fernanda', squad: 'Bruno · Igor', atualizado_em: now(), atualizado_por: 'demo',
    });
    dono(null, A, 'Web', 'Desktop', 'Nova página de login', addSemanas(iniA, 0), 3, 8);
    dono(null, A, 'Web', 'Desktop', 'Painel de faturas', addSemanas(iniA, 2), 5, 10);
    dono(null, A, 'Web', 'Desktop', 'Central de suporte', addSemanas(iniA, 6), 4, 6);
    dono(null, A, 'Web', 'Mobile', 'App responsivo', addSemanas(iniA, 8), 6, 12);
    dono(null, A, 'Web', 'Mobile', 'Notificações push', addSemanas(iniA, 14), 3, 5);
    dono(null, A, 'Design', 'UI/UX', 'Novo guia de estilo', addSemanas(iniA, 4), 4, 7);
    dono(null, A, 'Design', 'UI/UX', 'Protótipo navegável', addSemanas(iniA, 10), 5, 6);
    dono(null, A, 'Design', 'UI/UX', 'Testes com usuários', addSemanas(iniA, 18), 3, 5);

    const B = seqProjeto++; // Assistente de Mídia Paga
    const iniB = addSemanas(hojeSemana, -8);
    projetos.push({
      id: B, nome: 'Assistente de Mídia Paga',
      descricao: 'Automatiza relatórios e integra as contas de anúncio num único painel.',
      cor: '#de8d13', inicio: iniB, fim: addSemanas(hojeSemana, 8), ativo: 1, ordem: 20,
      owner: 'Thiago', squad: 'Yasmin', atualizado_em: now(), atualizado_por: 'demo',
    });
    dono(null, B, 'Automação', 'Relatórios', 'Dashboard de performance', addSemanas(iniB, 0), 4, 9);
    dono(null, B, 'Automação', 'Relatórios', 'Alertas automáticos', addSemanas(iniB, 4), 3, 6);
    dono(null, B, 'Automação', 'Relatórios', 'Exportação em PDF', addSemanas(iniB, 8), 2, 4);
    dono(null, B, 'Integrações', 'APIs', 'Conexão com Google Ads', addSemanas(iniB, 0), 3, 8);
    dono(null, B, 'Integrações', 'APIs', 'Conexão com Meta Ads', addSemanas(iniB, 3), 3, 8);
    dono(null, B, 'Integrações', 'APIs', 'Sincronização diária', addSemanas(iniB, 6), 3, 5);
    // observação: iniB = hoje-8sem, então tarefas com offset >= 8 já caem no
    // futuro (planejado); as demais terminam antes de hoje (executado).

    const C = seqProjeto++; // Automação com IA
    const iniC = addSemanas(hojeSemana, -4);
    projetos.push({
      id: C, nome: 'Automação com IA',
      descricao: 'Uso de IA para gerar conteúdo e triar o primeiro atendimento das revendas.',
      cor: '#7a4fbf', inicio: iniC, fim: addSemanas(hojeSemana, 14), ativo: 1, ordem: 30,
      owner: 'Igor', squad: 'Camila Reis · Larissa · Vinícius', atualizado_em: now(), atualizado_por: 'demo',
    });
    dono(null, C, 'Conteúdo', 'Geração', 'Gerador de legendas', addSemanas(iniC, 0), 3, 7);
    dono(null, C, 'Conteúdo', 'Geração', 'Resumo automático de posts', addSemanas(iniC, 3), 3, 5);
    dono(null, C, 'Conteúdo', 'Geração', 'Sugestão de hashtags', addSemanas(iniC, 6), 2, 4);
    dono(null, C, 'Atendimento', 'Chatbot', 'Fluxo de triagem', addSemanas(iniC, 2), 5, 9);
    dono(null, C, 'Atendimento', 'Chatbot', 'Base de respostas', addSemanas(iniC, 5), 4, 6);
    dono(null, C, 'Atendimento', 'Chatbot', 'Escalonamento humano', addSemanas(iniC, 9), 3, 5);
    // iniC = hoje-4sem: só "Gerador de legendas" termina antes de hoje;
    // os demais cruzam ou ficam inteiros no futuro (planejado).

    // Um projeto arquivado, só para o filtro "ativo" ter algo a esconder.
    const D = seqProjeto++;
    projetos.push({
      id: D, nome: 'Migração do Blog',
      descricao: 'Projeto encerrado — mantido como histórico.',
      cor: '#777777', inicio: addSemanas(hojeSemana, -30), fim: addSemanas(hojeSemana, -18),
      ativo: 0, ordem: 40, owner: 'Bruno', squad: null, atualizado_em: now(), atualizado_por: 'demo',
    });
    dono(null, D, 'Blog', 'Migração', 'Exportar conteúdo antigo', addSemanas(hojeSemana, -30), 4, 6);
    dono(null, D, 'Blog', 'Migração', 'Publicar no novo domínio', addSemanas(hojeSemana, -25), 4, 6);
  }
  semear();

  /* ---------- Regras de negócio (espelham src/cronograma/projetos.js) ---------- */
  function listProjetos() {
    const lista = [...projetos]
      .sort((a, b) => (b.ativo - a.ativo) || (a.ordem - b.ordem) || a.nome.localeCompare(b.nome, 'pt-BR'))
      .map((p) => ({ ...p, objetivos: objetivos.filter((o) => o.projeto_id === p.id).length }));
    return { ok: true, projetos: lista };
  }

  function getProjeto(id) {
    const pid = Number(id);
    const projeto = projetos.find((p) => p.id === pid);
    if (!projeto) return { erro: 404, msg: 'projeto não encontrado' };
    const objs = objetivos.filter((o) => o.projeto_id === pid)
      .sort((a, b) => (a.ordem - b.ordem) || (a.id - b.id));
    const objIds = new Set(objs.map((o) => o.id));
    const cels = [...celulas.values()].filter((c) => objIds.has(c.objetivo_id))
      .sort((a, b) => (a.semana < b.semana ? -1 : a.semana > b.semana ? 1 : 0));
    return { ok: true, projeto, objetivos: somaObjetivos(objs, cels), celulas: cels };
  }

  function getPortfolio() {
    const ativos = projetos.filter((p) => p.ativo === 1)
      .sort((a, b) => (a.ordem - b.ordem) || a.nome.localeCompare(b.nome, 'pt-BR'));
    if (!ativos.length) return { ok: true, inicio: null, fim: null, linhas: [] };

    const linhas = ativos.map((p) => {
      const objs = objetivos.filter((o) => o.projeto_id === p.id);
      const objIds = new Set(objs.map((o) => o.id));
      const cels = [...celulas.values()].filter((c) => objIds.has(c.objetivo_id));
      const porSemana = new Map();
      let entregue = 0;
      for (const c of cels) {
        const atual = porSemana.get(c.semana) || { exec: false, valor: 0 };
        if (c.estado === 'executado') { atual.exec = true; atual.valor += Number(c.valor) || 0; entregue += Number(c.valor) || 0; }
        porSemana.set(c.semana, atual);
      }
      const peso = Math.round(objs.reduce((a, o) => a + (Number(o.peso) || 0), 0) * 100) / 100;
      entregue = Math.round(entregue * 100) / 100;
      const semanas = [...porSemana.entries()]
        .map(([semana, v]) => ({ semana, estado: v.exec ? 'executado' : 'planejado', valor: v.valor || null }))
        .sort((a, b) => (a.semana < b.semana ? -1 : 1));
      return {
        ...p, objetivos: objs.length, peso: peso || null, executado: entregue,
        pct: peso ? Math.round((entregue / peso) * 1000) / 10 : null, semanas,
      };
    });

    const inicio = linhas.reduce((a, l) => (a && a <= l.inicio ? a : l.inicio), null);
    const fim = linhas.reduce((a, l) => (a && a >= l.fim ? a : l.fim), null);
    return { ok: true, inicio, fim, linhas };
  }

  function parseProjetoBody(body, existing) {
    const b = body || {};
    const nome = 'nome' in b ? String(b.nome || '').trim() : existing?.nome;
    if (!nome) throw erro('nome inválido');
    return {
      nome,
      descricao: 'descricao' in b ? (String(b.descricao || '').trim() || null) : (existing ? existing.descricao : null),
      cor: 'cor' in b ? String(b.cor || '#0072ce') : (existing ? existing.cor : '#0072ce'),
      inicio: segundaDaSemana('inicio' in b ? b.inicio : existing.inicio),
      fim: segundaDaSemana('fim' in b ? b.fim : existing.fim),
      ativo: 'ativo' in b ? (b.ativo === false || b.ativo === 0 ? 0 : 1) : (existing ? existing.ativo : 1),
      ordem: 'ordem' in b ? Math.trunc(Number(b.ordem) || 0) : (existing ? existing.ordem : 0),
      owner: 'owner' in b ? (String(b.owner || '').trim() || null) : (existing ? existing.owner : null),
      squad: 'squad' in b ? (String(b.squad || '').trim() || null) : (existing ? existing.squad : null),
    };
  }

  function erro(msg, status = 400) { const e = new Error(msg); e.status = status; return e; }

  function createProjeto(body) {
    const p = parseProjetoBody(body, null);
    if (p.fim < p.inicio) throw erro('fim não pode ser anterior ao início');
    const id = seqProjeto++;
    const registro = { id, ...p, atualizado_em: now(), atualizado_por: 'demo' };
    projetos.push(registro);
    return { ok: true, id, projeto: registro };
  }

  function updateProjeto(id, body) {
    const pid = Number(id);
    const idx = projetos.findIndex((p) => p.id === pid);
    if (idx < 0) throw erro('projeto não encontrado', 404);
    const p = parseProjetoBody(body, projetos[idx]);
    if (p.fim < p.inicio) throw erro('fim não pode ser anterior ao início');
    projetos[idx] = { ...projetos[idx], ...p, atualizado_em: now(), atualizado_por: 'demo' };
    return { ok: true, id: pid, projeto: projetos[idx] };
  }

  function deleteProjeto(id) {
    const pid = Number(id);
    const idx = projetos.findIndex((p) => p.id === pid);
    if (idx < 0) throw erro('projeto não encontrado', 404);
    const alvo = objetivos.filter((o) => o.projeto_id === pid).map((o) => o.id);
    for (const oid of alvo) for (const k of [...celulas.keys()]) if (k.startsWith(oid + '|')) celulas.delete(k);
    objetivos = objetivos.filter((o) => o.projeto_id !== pid);
    projetos.splice(idx, 1);
    return { ok: true, id: pid };
  }

  function parseObjetivoBody(body, existing) {
    const b = body || {};
    const projeto_id = 'projeto_id' in b ? Number(b.projeto_id) : existing?.projeto_id;
    const nome = 'nome' in b ? String(b.nome || '').trim() : existing?.nome;
    if (!nome) throw erro('nome do objetivo inválido');
    if (!projetos.some((p) => p.id === projeto_id)) throw erro('projeto_id inválido');
    return {
      projeto_id,
      secao: 'secao' in b ? (String(b.secao || '').trim() || null) : (existing ? existing.secao : null),
      grupo: 'grupo' in b ? (String(b.grupo || '').trim() || null) : (existing ? existing.grupo : null),
      nome,
      peso: 'peso' in b ? (b.peso === '' || b.peso === null ? null : Number(b.peso)) : (existing ? existing.peso : null),
      ordem: 'ordem' in b ? Math.trunc(Number(b.ordem) || 0) : (existing ? existing.ordem : 0),
      concluido: 'concluido' in b ? (b.concluido === true || b.concluido === 1 || b.concluido === '1' ? 1 : 0) : (existing ? existing.concluido : 0),
      obs: 'obs' in b ? (String(b.obs || '').trim() || null) : (existing ? existing.obs : null),
    };
  }

  function createObjetivo(body) {
    const o = parseObjetivoBody(body, null);
    if (body.ordem === undefined || body.ordem === null) {
      const doProjeto = objetivos.filter((x) => x.projeto_id === o.projeto_id);
      const doGrupo = doProjeto.filter((x) => (x.secao || '') === (o.secao || '') && (x.grupo || '') === (o.grupo || ''));
      if (doGrupo.length) {
        const base = Math.max(...doGrupo.map((x) => x.ordem));
        for (const x of objetivos) if (x.projeto_id === o.projeto_id && x.ordem > base) x.ordem += 1;
        o.ordem = base + 1;
      } else {
        const max = doProjeto.length ? Math.max(...doProjeto.map((x) => x.ordem)) : 0;
        o.ordem = doProjeto.length ? max + 10 : 10;
      }
    }
    const id = seqObjetivo++;
    const registro = { id, ...o, atualizado_em: now(), atualizado_por: 'demo' };
    objetivos.push(registro);
    return { ok: true, id, objetivo: { ...registro, executado: 0, restante: o.peso, pct: o.peso ? 0 : null } };
  }

  function updateObjetivo(id, body) {
    const oid = Number(id);
    const idx = objetivos.findIndex((o) => o.id === oid);
    if (idx < 0) throw erro('objetivo não encontrado', 404);
    const o = parseObjetivoBody(body, objetivos[idx]);
    objetivos[idx] = { ...objetivos[idx], ...o, atualizado_em: now(), atualizado_por: 'demo' };
    return { ok: true, id: oid, objetivo: objetivos[idx] };
  }

  function deleteObjetivo(id) {
    const oid = Number(id);
    const idx = objetivos.findIndex((o) => o.id === oid);
    if (idx < 0) throw erro('objetivo não encontrado', 404);
    for (const k of [...celulas.keys()]) if (k.startsWith(oid + '|')) celulas.delete(k);
    objetivos.splice(idx, 1);
    return { ok: true, id: oid };
  }

  function upsertCelulas(body) {
    if (!body || !Array.isArray(body.celulas)) throw erro('corpo deve ter a lista `celulas`');
    let gravadas = 0, apagadas = 0;
    const vistos = new Set();
    for (const c of body.celulas) {
      const oid = Number(c.objetivo_id);
      if (!objetivos.some((o) => o.id === oid)) throw erro('há objetivo inexistente no lote', 404);
      const semana = segundaDaSemana(c.semana);
      vistos.add(oid);
      const chave = chaveCelula(oid, semana);
      if (c.estado === null || c.estado === undefined || c.estado === '') {
        celulas.delete(chave);
        apagadas += 1;
        continue;
      }
      if (!ESTADOS.has(String(c.estado))) throw erro('estado inválido: ' + c.estado);
      const valor = (c.valor === undefined || c.valor === null || c.valor === '') ? null : Number(c.valor);
      celulas.set(chave, { objetivo_id: oid, semana, estado: String(c.estado), valor });
      gravadas += 1;
    }
    const ids = [...vistos];
    const objs = objetivos.filter((o) => ids.includes(o.id));
    const cels = [...celulas.values()].filter((c) => ids.includes(c.objetivo_id));
    return { ok: true, gravadas, apagadas, objetivos: somaObjetivos(objs, cels) };
  }

  /* ---------- Roteador ---------- */
  const reply = (obj, status = 200) => new Promise((resolve) => setTimeout(() => resolve(new Response(JSON.stringify(obj), {
    status, headers: { 'Content-Type': 'application/json; charset=utf-8' },
  })), 120));

  const realFetch = window.fetch.bind(window);
  window.fetch = function (input, init) {
    const opts = init || {};
    const url = new URL(typeof input === 'string' ? input : input.url, location.href);
    const path = url.pathname;
    const method = (opts.method || 'GET').toUpperCase();
    const body = () => { try { return JSON.parse(opts.body || '{}'); } catch { return {}; } };

    if (!path.startsWith('/api/cronograma')) return realFetch(input, init);

    try {
      const baseP = '/api/cronograma/projetos';
      const baseO = '/api/cronograma/objetivos';

      if (path === baseP && method === 'GET') return reply(listProjetos());
      if (path === '/api/cronograma/portfolio' && method === 'GET') return reply(getPortfolio());

      if (path === baseP && method === 'POST') return reply(createProjeto(body()), 201);

      let m = path.match(/^\/api\/cronograma\/projetos\/(\d+)$/);
      if (m) {
        if (method === 'GET') {
          const r = getProjeto(m[1]);
          if (r.erro) return reply({ ok: false, error: r.msg }, r.erro);
          return reply(r);
        }
        if (method === 'PATCH') return reply(updateProjeto(m[1], body()));
        if (method === 'DELETE') return reply(deleteProjeto(m[1]));
      }

      if (path === baseO && method === 'POST') return reply(createObjetivo(body()), 201);

      m = path.match(/^\/api\/cronograma\/objetivos\/(\d+)$/);
      if (m) {
        if (method === 'PATCH') return reply(updateObjetivo(m[1], body()));
        if (method === 'DELETE') return reply(deleteObjetivo(m[1]));
      }

      if (path === '/api/cronograma/celulas' && method === 'PUT') return reply(upsertCelulas(body()));

      return reply({ ok: false, error: 'rota de cronograma não encontrada' }, 404);
    } catch (e) {
      return reply({ ok: false, error: e.message || String(e) }, e.status || 500);
    }
  };
})();
