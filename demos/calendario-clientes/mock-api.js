/**
 * Demo estática do Calendário de Clientes (Agenda Inteligente).
 *
 * Substitui o backend (Worker + D1) por dados fictícios em memória. O NÚCLEO
 * da Agenda Inteligente (agenda/nucleo.js) é o MESMO CÓDIGO do backend real —
 * o parser em português, o léxico, a similaridade e a resolução de datas não
 * foram reescritos para a demo. O que muda aqui é só a "camada de banco":
 * em vez de consultar o D1, tudo vive em arrays deste arquivo e some ao
 * recarregar a página.
 *
 * IMPORTANTE: este arquivo é carregado como <script> comum (não módulo) DEPOIS
 * de agenda/nucleo.js, na mesma ordem que os outros mock-api.js do portfólio —
 * assim o fetch já está interceptado antes do app original rodar.
 */
(function () {
  'use strict';

  var LOGIN = 'visitante.demo';

  function nowIso() { return new Date().toISOString(); }
  function pad2(n) { return (n < 10 ? '0' : '') + n; }
  function ymdLocal(d) { return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate()); }
  function addDaysIso(iso, n) {
    var p = iso.split('-').map(Number);
    var d = new Date(Date.UTC(p[0], p[1] - 1, p[2]));
    d.setUTCDate(d.getUTCDate() + n);
    return d.toISOString().slice(0, 10);
  }
  var HOJE_ISO = ymdLocal(new Date());

  function erro(msg, status) { var e = new Error(msg); e.status = status || 400; return e; }

  // ═════════════════════════════════════════════════════════════════════════
  //  ESTADO EM MEMÓRIA (substitui o D1)
  // ═════════════════════════════════════════════════════════════════════════
  var seqCliente = 1, seqOpcao = 1, seqPost = 1, seqLog = 1;
  var clientesDb = [];
  var opcoesDb = [];
  var apelidosDb = [];
  var postsDb = [];
  var logDb = [];

  function addCliente(nome) {
    var id = seqCliente++;
    clientesDb.push({ id: id, nome: nome, ativo: true, ordem: id });
    return id;
  }
  function addOpcao(categoria, nome, clientesEscopo) {
    var id = seqOpcao++;
    opcoesDb.push({ id: id, categoria: categoria, nome: nome, ativo: true, ordem: id, clientes: clientesEscopo || [] });
    return id;
  }
  function addApelido(alvo, alvoId, alvoValor, apelido) {
    apelidosDb.push({ alvo: alvo, alvo_id: alvoId || null, alvo_valor: alvoValor || null, apelido: apelido });
  }

  // ---- Clientes (marcas fictícias — nenhuma é cliente real da Vetor) ----
  var C_NORTECH = addCliente('Nortech Software');
  var C_VITRINE = addCliente('Vitrine Moda');
  var C_SABOR = addCliente('Sabor Caseiro');
  var C_CONSTRULAR = addCliente('Constrular Materiais');

  // ---- Listas gerenciáveis ----
  var P_INSTITUCIONAL = addOpcao('pilar', 'Institucional');
  var P_PROMOCAO = addOpcao('pilar', 'Promoção');
  var P_EDUCATIVO = addOpcao('pilar', 'Educativo');
  var P_BASTIDORES = addOpcao('pilar', 'Bastidores');
  var P_DEPOIMENTO = addOpcao('pilar', 'Depoimento');

  var PB_NOVOS = addOpcao('publico', 'Novos seguidores');
  var PB_CLIENTES = addOpcao('publico', 'Clientes atuais');
  // Escopadas de propósito — exercitam a mesma regra de visibilidade por
  // cliente que o backend real usa (migration 0014): "Tomador de decisão" só
  // faz sentido para a marca B2B; "Consumidor final" para as marcas B2C.
  var PB_DECISOR = addOpcao('publico', 'Tomador de decisão', [C_NORTECH]);
  var PB_CONSUMIDOR = addOpcao('publico', 'Consumidor final', [C_VITRINE, C_SABOR, C_CONSTRULAR]);

  var OB_RECONHECIMENTO = addOpcao('objetivo', 'Reconhecimento de marca');
  var OB_LEADS = addOpcao('objetivo', 'Geração de leads');
  var OB_ENGAJAMENTO = addOpcao('objetivo', 'Engajamento');
  var OB_CONVERSAO = addOpcao('objetivo', 'Conversão');

  // ---- Apelidos (o que a equipe editaria em "Gerenciar listas" sem deploy) ----
  addApelido('cliente', C_NORTECH, null, 'nortech');
  addApelido('cliente', C_VITRINE, null, 'vitrine');
  addApelido('cliente', C_SABOR, null, 'sabor');
  addApelido('cliente', C_CONSTRULAR, null, 'constrular');
  addApelido('rede', null, 'Instagram', 'insta');
  addApelido('formato', null, 'Post Único', 'unico');
  addApelido('status', null, 'Publicado', 'no ar');

  // ---- Posts (planejamento fictício, ~2 meses no passado a ~1 mês no futuro) ----
  function addPost(clienteId, offsetDias, assunto, formato, pilarId, publicoId, objetivoId, redes, impulsionar) {
    var id = seqPost++;
    var data = addDaysIso(HOJE_ISO, offsetDias);
    var status;
    if (offsetDias < -3) status = 'Publicado';
    else if (offsetDias <= 2) status = 'Em produção';
    else status = 'Não iniciado';
    postsDb.push({
      id: id, cliente_id: clienteId, data_publicacao: data, data_original: null,
      assunto: assunto, formato: formato, horario: null,
      pilar_id: pilarId || null, publico_id: publicoId || null, objetivo_id: objetivoId || null,
      status: status, impulsionar: impulsionar ? 1 : 0, conteudo: null,
      redes: redes || [], excluido_em: null, excluido_por: null,
      atualizado_em: nowIso(), atualizado_por: 'seed',
    });
    return id;
  }

  // Cada cliente tem o próprio ritmo de publicação (intervalos irregulares
  // de 4 a 9 dias, sem padrão fixo) — perfis reais não publicam de forma
  // sincronizada nem em intervalos idênticos. Antes, os 4 clientes usavam o
  // MESMO array de offsets, então todo post caía no mesmo dia do calendário
  // pros 4 ao mesmo tempo (visual "sincronizado", nada orgânico), e o passo
  // fixo de 7 dias fazia tudo cair no mesmo dia da semana também (achado do
  // usuário: "tudo na segunda"). Gerado com um LCG determinístico (mulberry32)
  // e escolhido entre várias sementes o conjunto com menor repetição de dia
  // da semana e menor coincidência de data entre clientes.
  var OFFSETS_NORTECH = [-39, -35, -31, -22, -16, -11, -5, 0, 4, 9, 17, 22];
  var OFFSETS_VITRINE = [-36, -28, -20, -12, -3, 1, 7, 12, 16, 24, 32, 39];
  var OFFSETS_SABOR = [-34, -25, -21, -15, -6, -1, 5, 11, 20, 29, 35, 40];
  var OFFSETS_CONSTRULAR = [-41, -37, -30, -26, -18, -10, -2, 6, 10, 18, 25, 34];

  function semearCliente(clienteId, offsets, itens) {
    itens.forEach(function (item, i) {
      addPost(clienteId, offsets[i], item[0], item[1], item[2], item[3], item[4], item[5], item[6]);
    });
  }

  semearCliente(C_NORTECH, OFFSETS_NORTECH, [
    ['Como reduzir o tempo de resposta do seu suporte', 'Carrossel', P_EDUCATIVO, PB_CLIENTES, OB_ENGAJAMENTO, ['Instagram', 'LinkedIn'], false],
    ['Bastidores da nossa squad de produto', 'Stories', P_BASTIDORES, PB_NOVOS, OB_ENGAJAMENTO, ['Instagram'], false],
    ['Cliente conta como economizou 10 horas por semana', 'Reels', P_DEPOIMENTO, PB_DECISOR, OB_CONVERSAO, ['Instagram', 'LinkedIn', 'YouTube'], true],
    ['5 sinais de que sua empresa precisa de automação', 'Carrossel', P_EDUCATIVO, PB_DECISOR, OB_LEADS, ['LinkedIn', 'YouTube'], true],
    ['Lançamento do novo painel de relatórios', 'Post no Feed', P_PROMOCAO, PB_CLIENTES, OB_ENGAJAMENTO, ['Instagram', 'LinkedIn'], false],
    ['Nortech chega aos 500 clientes ativos', 'Post Único', P_INSTITUCIONAL, PB_NOVOS, OB_RECONHECIMENTO, ['Instagram', 'LinkedIn'], false],
    ['Webinar gratuito sobre gestão de equipes remotas', 'Reels', P_PROMOCAO, PB_DECISOR, OB_LEADS, ['LinkedIn', 'YouTube'], true],
    ['Dicas rápidas para organizar sua rotina de vendas', 'Stories', P_EDUCATIVO, PB_CLIENTES, OB_ENGAJAMENTO, ['Instagram'], false],
    ['Nossa jornada até aqui em 3 minutos', 'Reels', P_INSTITUCIONAL, PB_NOVOS, OB_RECONHECIMENTO, ['Instagram', 'LinkedIn'], false],
    ['Integração nova com ferramentas de e-mail', 'Post no Feed', P_PROMOCAO, PB_DECISOR, OB_LEADS, ['LinkedIn'], false],
    ['Depoimento de cliente sobre suporte humanizado', 'Carrossel', P_DEPOIMENTO, PB_DECISOR, OB_CONVERSAO, ['Instagram', 'LinkedIn'], false],
    ['Convite para o evento de lançamento', 'Post Único', P_PROMOCAO, PB_CLIENTES, OB_ENGAJAMENTO, ['Instagram', 'LinkedIn'], false],
  ]);

  semearCliente(C_VITRINE, OFFSETS_VITRINE, [
    ['Coleção de inverno chegando essa semana', 'Carrossel', P_PROMOCAO, PB_CONSUMIDOR, OB_CONVERSAO, ['Instagram', 'TikTok'], true],
    ['Bastidores do ensaio fotográfico', 'Stories', P_BASTIDORES, PB_NOVOS, OB_ENGAJAMENTO, ['Instagram', 'TikTok'], false],
    ['Como escolher o tamanho certo pelo nosso guia', 'Carrossel', P_EDUCATIVO, PB_CONSUMIDOR, OB_ENGAJAMENTO, ['Instagram'], false],
    ['Cliente mostra look montado com peças da loja', 'Reels', P_DEPOIMENTO, PB_CONSUMIDOR, OB_CONVERSAO, ['Instagram', 'TikTok'], false],
    ['Frete grátis para todo o Brasil essa semana', 'Post no Feed', P_PROMOCAO, PB_CONSUMIDOR, OB_CONVERSAO, ['Instagram'], true],
    ['Vitrine completa 8 anos de história', 'Post Único', P_INSTITUCIONAL, PB_NOVOS, OB_RECONHECIMENTO, ['Instagram', 'YouTube'], false],
    ['3 combinações para usar a jaqueta jeans', 'Reels', P_EDUCATIVO, PB_CONSUMIDOR, OB_ENGAJAMENTO, ['Instagram', 'TikTok'], false],
    ['Bastidores da equipe separando os pedidos', 'Stories', P_BASTIDORES, PB_NOVOS, OB_ENGAJAMENTO, ['Instagram', 'TikTok'], false],
    ['Nova parceria com estilista convidada', 'Post no Feed', P_PROMOCAO, PB_CONSUMIDOR, OB_RECONHECIMENTO, ['Instagram'], true],
    ['Depoimento sobre a qualidade do tecido', 'Carrossel', P_DEPOIMENTO, PB_CONSUMIDOR, OB_CONVERSAO, ['Instagram'], false],
    ['Enquete sobre qual estampa lançar primeiro', 'Post no Feed', P_PROMOCAO, PB_NOVOS, OB_ENGAJAMENTO, ['Instagram', 'TikTok'], false],
    ['Guia de cuidados com peças delicadas', 'Post Único', P_EDUCATIVO, PB_CONSUMIDOR, OB_ENGAJAMENTO, ['Instagram', 'YouTube'], false],
  ]);

  semearCliente(C_SABOR, OFFSETS_SABOR, [
    ['Prato do dia direto da nossa cozinha', 'Post no Feed', P_PROMOCAO, PB_CONSUMIDOR, OB_ENGAJAMENTO, ['Instagram'], false],
    ['Bastidores do preparo do nosso famoso nhoque', 'Reels', P_BASTIDORES, PB_NOVOS, OB_ENGAJAMENTO, ['Instagram', 'TikTok'], false],
    ['Receita simplificada do nosso molho especial', 'Carrossel', P_EDUCATIVO, PB_CONSUMIDOR, OB_ENGAJAMENTO, ['Instagram', 'YouTube'], false],
    ['Cliente conta por que virou fiel da casa', 'Stories', P_DEPOIMENTO, PB_CONSUMIDOR, OB_CONVERSAO, ['Instagram'], false],
    ['Sabor Caseiro abre nova unidade no bairro', 'Post Único', P_INSTITUCIONAL, PB_NOVOS, OB_RECONHECIMENTO, ['Instagram'], true],
    ['Combo econômico para o almoço de hoje', 'Post no Feed', P_PROMOCAO, PB_CONSUMIDOR, OB_CONVERSAO, ['Instagram', 'TikTok'], true],
    ['3 curiosidades sobre nosso tempero da casa', 'Reels', P_EDUCATIVO, PB_NOVOS, OB_ENGAJAMENTO, ['Instagram', 'TikTok'], false],
    ['Bastidores da equipe na correria do horário de pico', 'Stories', P_BASTIDORES, PB_NOVOS, OB_ENGAJAMENTO, ['Instagram'], false],
    ['Novo cardápio de sobremesas chegou', 'Carrossel', P_PROMOCAO, PB_CONSUMIDOR, OB_CONVERSAO, ['Instagram', 'TikTok'], true],
    ['Depoimento de quem pediu pela primeira vez', 'Post no Feed', P_DEPOIMENTO, PB_CONSUMIDOR, OB_CONVERSAO, ['Instagram'], false],
    ['Nossa história começou numa cozinha pequena', 'Reels', P_INSTITUCIONAL, PB_NOVOS, OB_RECONHECIMENTO, ['Instagram', 'YouTube'], false],
    ['Dica rápida para guardar comida sem perder sabor', 'Post Único', P_EDUCATIVO, PB_CONSUMIDOR, OB_ENGAJAMENTO, ['Instagram', 'TikTok'], false],
  ]);

  semearCliente(C_CONSTRULAR, OFFSETS_CONSTRULAR, [
    ['Promoção de tintas para reformar a sala', 'Post no Feed', P_PROMOCAO, PB_CONSUMIDOR, OB_CONVERSAO, ['Instagram'], true],
    ['Bastidores da montagem do novo showroom', 'Stories', P_BASTIDORES, PB_NOVOS, OB_ENGAJAMENTO, ['Instagram'], false],
    ['Como calcular material para revestir uma parede', 'Carrossel', P_EDUCATIVO, PB_CONSUMIDOR, OB_ENGAJAMENTO, ['Instagram', 'YouTube'], false],
    ['Cliente mostra reforma feita com nosso material', 'Reels', P_DEPOIMENTO, PB_CONSUMIDOR, OB_CONVERSAO, ['Instagram'], false],
    ['Constrular completa 15 anos no bairro', 'Post Único', P_INSTITUCIONAL, PB_NOVOS, OB_RECONHECIMENTO, ['Instagram', 'LinkedIn'], false],
    ['Condições especiais para profissionais cadastrados', 'Carrossel', P_PROMOCAO, PB_CONSUMIDOR, OB_LEADS, ['Instagram', 'LinkedIn'], true],
    ['5 ferramentas que não podem faltar na caixa', 'Reels', P_EDUCATIVO, PB_CONSUMIDOR, OB_ENGAJAMENTO, ['Instagram', 'YouTube'], false],
    ['Bastidores da equipe organizando o estoque novo', 'Stories', P_BASTIDORES, PB_NOVOS, OB_ENGAJAMENTO, ['Instagram'], false],
    ['Chegou a nova linha de pisos porcelanato', 'Post no Feed', P_PROMOCAO, PB_CONSUMIDOR, OB_CONVERSAO, ['Instagram'], true],
    ['Depoimento de profissional parceiro há anos', 'Carrossel', P_DEPOIMENTO, PB_CONSUMIDOR, OB_CONVERSAO, ['Instagram', 'LinkedIn'], false],
    ['Nossa trajetória desde a primeira loja', 'Reels', P_INSTITUCIONAL, PB_NOVOS, OB_RECONHECIMENTO, ['Instagram', 'YouTube'], false],
    ['Dica de manutenção para ferramentas elétricas', 'Post Único', P_EDUCATIVO, PB_CONSUMIDOR, OB_ENGAJAMENTO, ['Instagram', 'YouTube'], false],
  ]);

  // Um post "Não publicado" (atrasado) para o filtro/consulta de status ter o
  // que mostrar — cenário comum: passou da data e ninguém marcou como feito.
  postsDb[0].status = 'Não publicado';
  postsDb[12].status = 'Não publicado';

  function clienteNomePorId(id) {
    var c = clientesDb.filter(function (x) { return x.id === Number(id); })[0];
    return c ? c.nome : null;
  }

  // ═════════════════════════════════════════════════════════════════════════
  //  CRUD de posts e listas — espelha src/calendario/posts.js
  // ═════════════════════════════════════════════════════════════════════════
  var DATE_RE_POST = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;
  var MAX_TXT = 200;
  var MAX_LONG = 2000;

  function parsePostBody(body, opts) {
    opts = opts || {};
    var partial = !!opts.partial;
    if (!body || typeof body !== 'object' || Array.isArray(body)) throw erro('corpo deve ser um objeto JSON');
    var out = {};
    var has = function (k) { return body[k] !== undefined && body[k] !== null; };
    var need = function (cond, msg) { if (!cond) throw erro(msg); };
    var nuloExplicito = function (k) { return partial && (k in body) && body[k] === null; };

    if (!partial || has('cliente_id')) {
      var n = Number(body.cliente_id);
      need(Number.isInteger(n) && n > 0, 'cliente_id inválido');
      out.cliente_id = n;
    }
    if (!partial || has('data_publicacao')) {
      var v = String(body.data_publicacao == null ? '' : body.data_publicacao).trim();
      need(DATE_RE_POST.test(v), 'data_publicacao inválida (use YYYY-MM-DD)');
      out.data_publicacao = v;
    }
    if (nuloExplicito('data_original')) {
      out.data_original = null;
    } else if (has('data_original')) {
      var vdo = String(body.data_original).trim();
      need(vdo === '' || DATE_RE_POST.test(vdo), 'data_original inválida (use YYYY-MM-DD)');
      out.data_original = vdo || null;
    } else if (!partial) {
      out.data_original = null;
    }
    if (!partial || has('assunto')) {
      var va = String(body.assunto == null ? '' : body.assunto).trim();
      need(va.length >= 1 && va.length <= MAX_TXT, 'assunto inválido (1–' + MAX_TXT + ' caracteres)');
      out.assunto = va;
    }
    if (!partial || has('formato')) {
      var vf = String(body.formato == null ? '' : body.formato).trim();
      need(FORMATOS.has(vf), 'formato inválido');
      out.formato = vf;
    }
    if (nuloExplicito('horario')) {
      out.horario = null;
    } else if (has('horario')) {
      var vh = String(body.horario).trim();
      need(vh.length <= 20, 'horario longo demais');
      out.horario = vh || null;
    } else if (!partial) {
      out.horario = null;
    }
    ['pilar_id', 'publico_id', 'objetivo_id'].forEach(function (k) {
      if (body[k] === undefined) { if (!partial) out[k] = null; return; }
      if (body[k] === null) { out[k] = null; return; }
      var nk = Number(body[k]);
      need(Number.isInteger(nk) && nk > 0, k + ' inválido');
      out[k] = nk;
    });
    if (has('status')) {
      var vs = String(body.status).trim();
      need(STATUS.has(vs), 'status inválido');
      out.status = vs;
    } else if (!partial) {
      out.status = 'Não iniciado';
    }
    if (has('impulsionar')) out.impulsionar = body.impulsionar ? 1 : 0;
    else if (!partial) out.impulsionar = 0;
    if (nuloExplicito('conteudo')) {
      out.conteudo = null;
    } else if (has('conteudo')) {
      var vc = String(body.conteudo).trim();
      need(vc.length <= MAX_LONG, 'conteudo longo demais (máx. ' + MAX_LONG + ')');
      out.conteudo = vc || null;
    } else if (!partial) {
      out.conteudo = null;
    }
    if (has('redes')) {
      need(Array.isArray(body.redes), 'redes deve ser uma lista');
      var set = [];
      body.redes.forEach(function (r) {
        var vr = String(r).trim();
        need(REDES.has(vr), 'rede inválida: ' + vr);
        if (set.indexOf(vr) < 0) set.push(vr);
      });
      out.redes = set;
    } else if (!partial) {
      out.redes = [];
    }
    return out;
  }

  function postParaFora(p) {
    return {
      id: p.id, cliente_id: p.cliente_id, cliente_nome: clienteNomePorId(p.cliente_id),
      data_publicacao: p.data_publicacao, data_original: p.data_original, assunto: p.assunto,
      formato: p.formato, horario: p.horario, pilar_id: p.pilar_id, publico_id: p.publico_id,
      objetivo_id: p.objetivo_id, status: p.status, impulsionar: !!p.impulsionar, conteudo: p.conteudo,
      redes: (p.redes || []).slice(), atualizado_em: p.atualizado_em, atualizado_por: p.atualizado_por,
    };
  }

  function listPostsLocal(params) {
    params = params || {};
    var from = params.from, to = params.to, cliente = Number(params.cliente);
    var vivos = postsDb.filter(function (p) { return !p.excluido_em; });
    if (from && DATE_RE_POST.test(from)) vivos = vivos.filter(function (p) { return p.data_publicacao >= from; });
    if (to && DATE_RE_POST.test(to)) vivos = vivos.filter(function (p) { return p.data_publicacao <= to; });
    if (Number.isInteger(cliente) && cliente > 0) vivos = vivos.filter(function (p) { return p.cliente_id === cliente; });
    vivos = vivos.slice().sort(function (a, b) {
      return a.data_publicacao < b.data_publicacao ? -1 : a.data_publicacao > b.data_publicacao ? 1 : a.id - b.id;
    });
    return { ok: true, posts: vivos.map(postParaFora) };
  }

  function createPostLocal(body, login) {
    var p = parsePostBody(body, { partial: false });
    var id = seqPost++;
    var registro = {
      id: id, cliente_id: p.cliente_id, data_publicacao: p.data_publicacao, data_original: p.data_original,
      assunto: p.assunto, formato: p.formato, horario: p.horario, pilar_id: p.pilar_id || null,
      publico_id: p.publico_id || null, objetivo_id: p.objetivo_id || null, status: p.status,
      impulsionar: p.impulsionar, conteudo: p.conteudo, redes: p.redes, excluido_em: null, excluido_por: null,
      atualizado_em: nowIso(), atualizado_por: login || null,
    };
    postsDb.push(registro);
    return { ok: true, id: id, post: postParaFora(registro) };
  }

  function updatePostLocal(id, body, login) {
    var pid = Number(id);
    var existing = postsDb.filter(function (p) { return p.id === pid && !p.excluido_em; })[0];
    if (!existing) throw erro('post não encontrado', 404);
    var patch = parsePostBody(body, { partial: true });
    var campos = ['cliente_id', 'data_publicacao', 'data_original', 'assunto', 'formato', 'horario',
      'pilar_id', 'publico_id', 'objetivo_id', 'status', 'impulsionar', 'conteudo'];
    campos.forEach(function (k) {
      if (patch[k] !== undefined) existing[k] = patch[k];
    });
    if (patch.redes !== undefined) existing.redes = patch.redes;
    existing.atualizado_em = nowIso();
    existing.atualizado_por = login || null;
    return { ok: true, id: pid };
  }

  function setStatusLocal(id, status, login) {
    var pid = Number(id);
    var v = String(status == null ? '' : status).trim();
    if (!STATUS.has(v)) throw erro('status inválido');
    var existing = postsDb.filter(function (p) { return p.id === pid && !p.excluido_em; })[0];
    if (!existing) throw erro('post não encontrado', 404);
    existing.status = v;
    existing.atualizado_em = nowIso();
    existing.atualizado_por = login || null;
    return { ok: true, id: pid, status: v };
  }

  function deletePostLocal(id, login) {
    var pid = Number(id);
    var existing = postsDb.filter(function (p) { return p.id === pid && !p.excluido_em; })[0];
    if (!existing) throw erro('post não encontrado', 404);
    existing.excluido_em = nowIso();
    existing.excluido_por = login || null;
    existing.atualizado_em = existing.excluido_em;
    existing.atualizado_por = login || null;
    return { ok: true, id: pid, excluido_em: existing.excluido_em };
  }

  function restorePostLocal(id, login) {
    var pid = Number(id);
    var existing = postsDb.filter(function (p) { return p.id === pid && p.excluido_em; })[0];
    if (!existing) throw erro('post não estava excluído', 404);
    existing.excluido_em = null;
    existing.excluido_por = null;
    existing.atualizado_em = nowIso();
    existing.atualizado_por = login || null;
    return { ok: true, id: pid };
  }

  function listListasLocal() {
    var normCli = function (c) { return { id: c.id, nome: c.nome, ativo: !!c.ativo }; };
    var normOpt = function (o) { return { id: o.id, nome: o.nome, ativo: !!o.ativo, clientes: (o.clientes || []).slice() }; };
    var clientesOrdenados = clientesDb.slice().sort(function (a, b) {
      return (b.ativo - a.ativo) || (a.ordem - b.ordem) || a.nome.localeCompare(b.nome, 'pt-BR');
    });
    var byCat = { pilar: [], publico: [], objetivo: [] };
    opcoesDb.slice().sort(function (a, b) {
      return (a.categoria < b.categoria ? -1 : a.categoria > b.categoria ? 1 : 0) || (b.ativo - a.ativo) || (a.ordem - b.ordem);
    }).forEach(function (o) { if (byCat[o.categoria]) byCat[o.categoria].push(normOpt(o)); });
    return {
      ok: true,
      clientes: clientesOrdenados.map(normCli),
      pilares: byCat.pilar, publicos: byCat.publico, objetivos: byCat.objetivo,
    };
  }

  function createOpcaoLocal(categoria, body, login) {
    if (['pilar', 'publico', 'objetivo'].indexOf(categoria) < 0) throw erro('categoria inválida');
    var nome = String((body && body.nome) || '').trim();
    if (!nome || nome.length > MAX_TXT) throw erro('nome inválido (1–' + MAX_TXT + ' caracteres)');
    var clientesEscopo = Array.isArray(body && body.clientes)
      ? body.clientes.map(Number).filter(function (n) { return Number.isInteger(n) && n > 0; })
      : [];
    var id = seqOpcao++;
    opcoesDb.push({ id: id, categoria: categoria, nome: nome, ativo: true, ordem: id, clientes: clientesEscopo });
    return { ok: true, id: id, categoria: categoria, nome: nome };
  }

  function updateOpcaoLocal(id, body, login) {
    var oid = Number(id);
    var o = opcoesDb.filter(function (x) { return x.id === oid; })[0];
    if (!o) throw erro('opção não encontrada', 404);
    if (body && body.nome !== undefined) {
      var nome = String(body.nome || '').trim();
      if (!nome || nome.length > MAX_TXT) throw erro('nome inválido');
      o.nome = nome;
    }
    if (body && body.ativo !== undefined) o.ativo = !!body.ativo;
    if (body && Array.isArray(body.clientes)) {
      o.clientes = body.clientes.map(Number).filter(function (n) { return Number.isInteger(n) && n > 0; });
    }
    return { ok: true, id: oid };
  }

  // ═════════════════════════════════════════════════════════════════════════
  //  LÉXICO — reaproveita montarLexico() do núcleo real (agenda/nucleo.js)
  // ═════════════════════════════════════════════════════════════════════════
  function carregarLexicoLocal() {
    return montarLexico({
      clientes: clientesDb.map(function (c) { return { id: c.id, nome: c.nome, ativo: c.ativo }; }),
      opcoes: opcoesDb.map(function (o) {
        return { id: o.id, categoria: o.categoria, nome: o.nome, ativo: o.ativo, clientes: o.clientes || [] };
      }),
      apelidos: apelidosDb,
    });
  }

  // ═════════════════════════════════════════════════════════════════════════
  //  RESOLUÇÃO DE ALVO EM MEMÓRIA — mesma lógica de src/calendario/agenda-alvo.js
  //  (resolverAlvo real), só trocando o SELECT no D1 por um filtro no array
  //  `postsDb`. Reaproveita classificarCandidatos/diaMes/descreverCriterios/
  //  fixarChipDoAlvo/verificarImpedimento/atualizarEfeitos do núcleo (eles são
  //  puros — não tocam em D1 — então vieram junto sem alteração).
  // ═════════════════════════════════════════════════════════════════════════
  function consultarMemoria(criterios, opts) {
    opts = opts || {};
    var comCliente = opts.comCliente !== false;
    var comTitulo = opts.comTitulo !== false;
    var permitirVarredura = !!opts.permitirVarredura;

    var filtros = [];
    if (comCliente && criterios.cliente_id) {
      filtros.push(function (p) { return p.cliente_id === Number(criterios.cliente_id); });
    }
    if (criterios.data && DATE_RE_POST.test(criterios.data)) {
      filtros.push(function (p) { return p.data_publicacao === criterios.data; });
    } else if (criterios.periodo && criterios.periodo.de && criterios.periodo.ate) {
      filtros.push(function (p) { return p.data_publicacao >= criterios.periodo.de && p.data_publicacao <= criterios.periodo.ate; });
    }
    if (criterios.formato) {
      filtros.push(function (p) { return p.formato === criterios.formato; });
    }
    var estruturais = filtros.length;

    var tituloFiltro = null;
    if (comTitulo && criterios.titulo && !estruturais) {
      var alvoTxt = String(criterios.titulo).toLowerCase();
      tituloFiltro = function (p) { return String(p.assunto || '').toLowerCase().indexOf(alvoTxt) >= 0; };
    }

    if (!filtros.length && !tituloFiltro && !permitirVarredura) return { linhas: [], estruturais: estruturais };

    var linhas = postsDb.filter(function (p) { return !p.excluido_em; });
    filtros.forEach(function (f) { linhas = linhas.filter(f); });
    if (tituloFiltro) linhas = linhas.filter(tituloFiltro);

    linhas = linhas.slice().sort(function (a, b) {
      return a.data_publicacao < b.data_publicacao ? -1 : a.data_publicacao > b.data_publicacao ? 1 : a.id - b.id;
    }).slice(0, MAX_LINHAS);

    var out = linhas.map(function (p) {
      return {
        id: p.id, cliente_id: p.cliente_id, cliente_nome: clienteNomePorId(p.cliente_id),
        data_publicacao: p.data_publicacao, assunto: p.assunto, formato: p.formato, status: p.status,
      };
    });
    return { linhas: out, estruturais: estruturais };
  }

  /** Mesmo algoritmo de resolverAlvo() (agenda-alvo.js), sem D1. */
  async function resolverAlvoMemoria(plano, resolucao) {
    if (!plano || !plano.alvo || INTENCOES_COM_ALVO.indexOf(plano.intencao) < 0) return plano;

    plano.alvo.estado = null;
    plano.alvo.motivo = '';
    plano.alvo.impedimento = null;
    plano.alvo.escolhido = null;
    plano.alvo.ampliado = null;
    plano.alvo.total = 0;

    if (plano.faltando.indexOf('alvo') >= 0) return plano;

    var cri = plano.alvo.criterios;
    var clienteDoTexto = Boolean(cri.cliente_id && plano.campos.cliente && plano.campos.cliente.origem !== 'contexto');
    var temEstrutural = Boolean(cri.cliente_id || cri.data || cri.periodo || cri.formato);

    var camadas = [{ opts: {}, ampliado: null }];
    if (cri.titulo && !temEstrutural) {
      camadas.push({ opts: { comTitulo: false, permitirVarredura: true }, ampliado: 'titulo' });
    }
    if (clienteDoTexto && cri.titulo) {
      camadas.push({ opts: { comCliente: false, comTitulo: false, permitirVarredura: true }, ampliado: 'cliente' });
    }

    var r = { estado: 'nenhum', escolhido: null, candidatos: [], total: 0 };
    var ampliado = null;
    for (var i = 0; i < camadas.length; i++) {
      var camada = camadas[i];
      var linhas = consultarMemoria(cri, camada.opts).linhas;
      var c = classificarCandidatos(cri.titulo, linhas, { exigirConfirmacao: camada.ampliado === 'cliente' });
      if (c.estado !== 'nenhum') { r = c; ampliado = camada.ampliado; break; }
    }

    if (ampliado === 'cliente') {
      plano.avisos.push(
        'Não achei esse post em ' + plano.campos.cliente.rotulo + ' — procurei em todas as marcas,'
        + ' porque "' + (plano.campos.cliente.trecho || plano.campos.cliente.rotulo) + '" pode fazer parte do título.',
      );
    }
    plano.alvo.estado = r.estado;
    plano.alvo.ampliado = ampliado;
    plano.alvo.total = r.total;
    plano.alvo.candidatos = r.candidatos.map(function (c) {
      return {
        id: Number(c.post.id), nome: rotuloPostLocal(c.post), data_publicacao: c.post.data_publicacao,
        assunto: c.post.assunto, formato: c.post.formato, status: c.post.status,
        cliente_id: c.post.cliente_id, cliente_nome: c.post.cliente_nome, score: c.score,
      };
    });

    var escolhaInvalida = false;
    if (r.estado === 'perguntar' && resolucao && resolucao.acao === 'escolher') {
      var escolha = plano.alvo.candidatos.filter(function (c) { return Number(c.id) === Number(resolucao.id); })[0];
      if (escolha) {
        plano.alvo.estado = 'resolvido';
        r.escolhido = { post: escolha, score: escolha.score };
      } else {
        escolhaInvalida = true;
      }
    }

    var desc = descreverCriterios(cri, ampliado === 'cliente' ? null : (plano.campos.cliente ? plano.campos.cliente.rotulo : null));

    if (plano.alvo.estado === 'resolvido') {
      var post = r.escolhido.post;
      plano.alvo.escolhido = plano.alvo.candidatos.filter(function (c) { return Number(c.id) === Number(post.id); })[0]
        || Object.assign({ id: Number(post.id) }, post);
      fixarChipDoAlvo(plano, plano.alvo.escolhido, r.escolhido.score);
      verificarImpedimento(plano, plano.alvo.escolhido);
    } else if (plano.alvo.estado === 'perguntar') {
      plano.alvo.motivo = escolhaInvalida
        ? 'o post escolhido não está entre os que atendem ao comando (' + desc + ') — escolha um da lista.'
        : 'mais de um post atende ao comando (' + desc + ') — escolha qual.';
      plano.ambiguidades.push({
        campo: 'alvo', trecho: cri.titulo || desc, acao: 'escolher', sem_ignorar: true,
        opcoes: plano.alvo.candidatos.map(function (c) { return { id: c.id, nome: c.nome, score: c.score }; }),
      });
    } else if (plano.alvo.estado === 'amplo') {
      var sugestao = !cri.titulo ? 'diga o título do post' : (!cri.data ? 'diga o dia do post' : 'seja mais específico no título');
      plano.alvo.motivo = r.total + ' posts atendem ao comando (' + desc + ') — ' + sugestao + '.';
      plano.avisos.push(plano.alvo.motivo);
    } else {
      plano.alvo.motivo = 'não achei post com ' + desc + '.';
      plano.avisos.push(plano.alvo.motivo);
    }

    atualizarEfeitos(plano);
    return plano;
  }

  function rotuloPostLocal(p) {
    var partes = [diaMes(p.data_publicacao), p.assunto];
    var extra = [p.formato, p.cliente_nome].filter(Boolean).join(' · ');
    return partes.join(' · ') + (extra ? ' (' + extra + ')' : '');
  }

  // ═════════════════════════════════════════════════════════════════════════
  //  LOG DE COMANDOS + DESFAZER — espelha src/calendario/agenda-log.js
  // ═════════════════════════════════════════════════════════════════════════
  var JANELA_DESFAZER_MIN_LOCAL = 60;

  function lerSnapshotLocal(postId) {
    var pid = Number(postId);
    var p = postsDb.filter(function (x) { return x.id === pid; })[0];
    if (!p) return null;
    return {
      id: p.id, cliente_id: p.cliente_id, data_publicacao: p.data_publicacao, data_original: p.data_original,
      assunto: p.assunto, formato: p.formato, horario: p.horario, pilar_id: p.pilar_id, publico_id: p.publico_id,
      objetivo_id: p.objetivo_id, status: p.status, impulsionar: p.impulsionar, conteudo: p.conteudo,
      excluido_em: p.excluido_em, redes: (p.redes || []).slice(),
    };
  }

  function registrarLogLocal(dados) {
    var id = seqLog++;
    logDb.push({
      id: id, criado_em: nowIso(), login: dados.login || null, texto: String(dados.texto || '').slice(0, 500),
      intencao: dados.intencao || null, resultado: dados.resultado === 'ok' ? 'ok' : 'recusado',
      erro: dados.erro ? String(dados.erro).slice(0, 500) : null,
      post_id: dados.postId ? Number(dados.postId) : null,
      antes: dados.antes ? JSON.stringify(dados.antes) : null,
      depois: dados.depois ? JSON.stringify(dados.depois) : null,
      plano: (dados.resultado === 'ok' && dados.plano) ? JSON.stringify(dados.plano) : null,
      desfeito_em: null, desfeito_por: null,
    });
    return id;
  }

  function ultimoDesfazivelLocal(login) {
    var corteMs = Date.now() - JANELA_DESFAZER_MIN_LOCAL * 60000;
    for (var i = logDb.length - 1; i >= 0; i--) {
      var l = logDb[i];
      if (l.login === login && l.resultado === 'ok' && !l.desfeito_em && l.post_id != null
        && (l.antes != null || l.intencao === 'criar') && new Date(l.criado_em).getTime() >= corteMs) {
        return l;
      }
    }
    return null;
  }

  function marcarDesfeitoLocal(logId, login) {
    var l = logDb.filter(function (x) { return x.id === Number(logId); })[0];
    if (!l) return false;
    l.desfeito_em = nowIso();
    l.desfeito_por = login || null;
    return true;
  }

  // ═════════════════════════════════════════════════════════════════════════
  //  SUGESTÕES (vitrine "experimente") — adaptado de agenda-sugestoes.js
  // ═════════════════════════════════════════════════════════════════════════
  var QUANTAS_SUGESTOES = 4;
  var MAX_VALIDACOES_SUGESTOES = 12;
  var LIMIAR_CONFIANCA_SUGESTOES = 0.7;
  var AMOSTRA_SUGESTOES = 80;
  var MESES_EXTENSO = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho',
    'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
  var PERMISSAO_SUGESTAO = { consultar: null, criar: 'edit', mover: 'edit', status: 'status', remover: 'edit', alterar: 'edit' };

  function amostraDePostsLocal(contexto) {
    var vivos = postsDb.filter(function (p) { return !p.excluido_em; });
    if (contexto && contexto.mes) {
      vivos = vivos.filter(function (p) { return p.data_publicacao >= (contexto.mes + '-01') && p.data_publicacao <= (contexto.mes + '-31'); });
    }
    if (contexto && contexto.cliente_id) {
      vivos = vivos.filter(function (p) { return p.cliente_id === Number(contexto.cliente_id); });
    }
    return vivos.slice().sort(function (a, b) { return a.data_publicacao < b.data_publicacao ? 1 : -1; })
      .slice(0, AMOSTRA_SUGESTOES)
      .map(function (p) {
        return {
          id: p.id, assunto: p.assunto, formato: p.formato, status: p.status, impulsionar: p.impulsionar,
          data_publicacao: p.data_publicacao, cliente_id: p.cliente_id, cliente_nome: clienteNomePorId(p.cliente_id),
        };
      });
  }

  function agrupar(lista, chave) {
    var m = new Map();
    lista.forEach(function (item) {
      var k = chave(item);
      if (!k) return;
      if (!m.has(k)) m.set(k, []);
      m.get(k).push(item);
    });
    return m;
  }
  function maisComum(valores) {
    var n = new Map(); valores.forEach(function (v) { if (v) n.set(v, (n.get(v) || 0) + 1); });
    var melhor = null, max = 0;
    n.forEach(function (q, v) { if (q > max) { max = q; melhor = v; } });
    return melhor;
  }
  function pluralFormato(formato) {
    var PLURAL = { Carrossel: 'Carrosséis', Reels: 'Reels', Stories: 'Stories', 'Post no Feed': 'posts no Feed', 'Post Único': 'posts únicos' };
    return PLURAL[formato] || formato;
  }
  function statusPlural(status) {
    var PLURAL = { 'Não iniciado': 'não iniciados', 'Em produção': 'em produção', 'Não publicado': 'não publicados', Publicado: 'publicados' };
    return PLURAL[status] || String(status).toLowerCase();
  }
  function mesPorExtensoLocal(mes) {
    var m = /^\d{4}-(\d{2})$/.exec(String(mes || ''));
    return m ? MESES_EXTENSO[Number(m[1]) - 1] : 'este mês';
  }
  function outroDiaLocal(iso) {
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso || ''));
    if (!m) return '15/06';
    var dia = Number(m[3]);
    var novo = dia <= 21 ? dia + 7 : dia - 7;
    return String(novo).padStart(2, '0') + '/' + m[2];
  }
  function outroFormatoLocal(atual) {
    var ORDEM = ['Carrossel', 'Reels', 'Stories', 'Post no Feed'];
    return ORDEM.filter(function (f) { return f !== atual; })[0] || 'Reels';
  }
  function diaFuturoLocal(contexto) {
    var hoje = /^\d{4}-\d{2}-(\d{2})$/.exec(String(contexto.hoje || ''));
    var mesmoMes = contexto.hoje && contexto.mes && contexto.hoje.slice(0, 7) === contexto.mes;
    if (mesmoMes && hoje) return String(Math.min(Number(hoje[1]) + 3, 28)).padStart(2, '0');
    return '15';
  }
  function normSimples(s) {
    return String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim();
  }
  function ancorasLocal(posts) {
    var vezes = new Map();
    posts.forEach(function (p) { var k = normSimples(p.assunto); vezes.set(k, (vezes.get(k) || 0) + 1); });
    var bons = posts.filter(function (p) {
      var a = String(p.assunto || '');
      if (a.length < 6 || a.length > 75) return false;
      if (vezes.get(normSimples(a)) !== 1) return false;
      if (/\bpara\b/i.test(a)) return false;
      if (/["'“”]/.test(a)) return false;
      return true;
    }).sort(function (a, b) { return String(a.assunto).length - String(b.assunto).length; });
    var porCliente = new Map(); var escolhidos = [];
    for (var i = 0; i < bons.length; i++) {
      var p = bons[i];
      var n = porCliente.get(p.cliente_id) || 0;
      if (n >= 2) continue;
      porCliente.set(p.cliente_id, n + 1);
      escolhidos.push(p);
      if (escolhidos.length >= 6) break;
    }
    return escolhidos;
  }
  function montarCandidatosSugestao(posts, lexico, contexto, permissoes) {
    var pode = function (intencao) {
      var p = PERMISSAO_SUGESTAO[intencao];
      if (!p) return true;
      return p === 'edit' ? !!permissoes.canEdit : !!permissoes.canToggleStatus;
    };
    var grupos = new Map();
    var add = function (intencao, texto, perigo) {
      if (!pode(intencao)) return;
      if (!grupos.has(intencao)) grupos.set(intencao, []);
      grupos.get(intencao).push({ intencao: intencao, texto: texto, perigo: !!perigo });
    };

    agrupar(posts, function (p) { return p.cliente_nome; }).forEach(function (doCliente, cliente) {
      var formato = maisComum(doCliente.map(function (p) { return p.formato; }));
      if (formato) add('consultar', 'Mostre os ' + pluralFormato(formato) + ' da ' + cliente + ' em ' + mesPorExtensoLocal(contexto.mes));
      var status = maisComum(doCliente.filter(function (p) { return p.status !== 'Publicado'; }).map(function (p) { return p.status; }));
      if (status) add('consultar', 'Mostre os posts ' + statusPlural(status) + ' da ' + cliente);
      if (doCliente.some(function (p) { return p.impulsionar; })) add('consultar', 'Mostre os posts impulsionados da ' + cliente);
    });

    ancorasLocal(posts).forEach(function (post) {
      var alvo = 'o post ' + post.assunto + ' da ' + post.cliente_nome;
      add('mover', 'Adie ' + alvo + ' para ' + outroDiaLocal(post.data_publicacao));
      if (post.status === 'Publicado') add('status', 'Despublique ' + alvo);
      else add('status', 'Marque ' + alvo + ' como publicado');
      add('alterar', 'Altere o formato do post ' + post.assunto + ' da ' + post.cliente_nome + ' para ' + outroFormatoLocal(post.formato));
      add('remover', 'Remova ' + alvo, true);
    });

    var cliente0 = (posts[0] && posts[0].cliente_nome) || (lexico.clientes && lexico.clientes[0] && lexico.clientes[0].nome);
    if (cliente0) {
      var formatoComum = maisComum(posts.map(function (p) { return p.formato; })) || 'Carrossel';
      add('criar', 'Inclua um ' + formatoComum + ' da ' + cliente0 + ' dia ' + diaFuturoLocal(contexto) + ' sobre Novidades');
    }
    return grupos;
  }
  function enfileirarSugestoes(grupos, semente) {
    var ordem = Array.from(grupos.keys()).filter(function (i) { return i !== 'consultar'; });
    if (ordem.length > 1 && semente) {
      var n = ((semente % ordem.length) + ordem.length) % ordem.length;
      ordem.push.apply(ordem, ordem.splice(0, n));
    }
    if (grupos.has('consultar')) ordem.unshift('consultar');
    var listas = ordem.map(function (i) {
      var l = (grupos.get(i) || []).slice();
      if (semente && l.length > 1) {
        var n2 = ((semente % l.length) + l.length) % l.length;
        l.push.apply(l, l.splice(0, n2));
      }
      return l;
    });
    var fila = [];
    var maxLen = Math.max.apply(null, listas.map(function (l) { return l.length; }).concat([0]));
    for (var volta = 0; volta < maxLen; volta++) {
      listas.forEach(function (l) { if (l[volta]) fila.push(l[volta]); });
    }
    return fila;
  }
  async function validarSugestao(candidato, lexico, contexto) {
    var plano;
    try { plano = interpretar(candidato.texto, lexico, contexto); } catch (e) { return null; }
    if (plano.intencao !== candidato.intencao) return null;
    if (plano.confianca < LIMIAR_CONFIANCA_SUGESTOES) return null;
    if ((plano.ambiguidades || []).length) return null;

    var precisaAlvo = (plano.faltando || []).indexOf('alvo') >= 0 || !!plano.alvo;
    if (precisaAlvo) {
      try { await resolverAlvoMemoria(plano, undefined); } catch (e) { return null; }
      if (!plano.alvo || plano.alvo.estado !== 'resolvido') return null;
      if (plano.alvo.impedimento) return null;
      if (plano.alvo.ampliado) return null;
    }
    if (faltantes(plano.intencao, plano.campos, plano.mudancas).length) return null;
    return { texto: candidato.texto, intencao: plano.intencao, escreve: plano.intencao !== 'consultar', perigo: candidato.perigo };
  }
  async function gerarSugestoesLocal(lexico, contexto, permissoes, opcoes) {
    opcoes = opcoes || {};
    var quantas = Number(opcoes.quantas) || QUANTAS_SUGESTOES;
    var posts = amostraDePostsLocal(contexto);
    var grupos = montarCandidatosSugestao(posts, lexico, contexto, permissoes);
    var candidatos = enfileirarSugestoes(grupos, Number(opcoes.semente) || 0);
    var aprovadas = [];
    var validacoes = 0;
    for (var i = 0; i < candidatos.length; i++) {
      if (aprovadas.length >= quantas || validacoes >= MAX_VALIDACOES_SUGESTOES) break;
      validacoes++;
      var ok = await validarSugestao(candidatos[i], lexico, contexto);
      if (ok) aprovadas.push(ok);
    }
    return aprovadas;
  }

  // ═════════════════════════════════════════════════════════════════════════
  //  ROTAS DA AGENDA — espelha src/calendario/agenda.js (handleAgenda/aplicar/desfazer)
  //  Demo = sem login/RBAC, então canEdit e canToggleStatus são sempre true.
  // ═════════════════════════════════════════════════════════════════════════
  var PERMISSAO_POR_INTENCAO = { criar: 'edit', mover: 'edit', status: 'status', remover: 'edit', alterar: 'edit' };
  var MAX_TEXTO_COMANDO = 500;

  function sanearDataCtx(v) { return /^\d{4}-\d{2}-\d{2}$/.test(String(v)) ? String(v) : ''; }
  function sanearMesCtx(v) { return /^\d{4}-\d{2}$/.test(String(v)) ? String(v) : ''; }
  function lerContextoLocal(corpo) {
    var c = (corpo && corpo.contexto) || {};
    return { hoje: sanearDataCtx(c.hoje || ''), mes: sanearMesCtx(c.mes || ''), cliente_id: Number(c.cliente_id || 0) || null };
  }

  async function enriquecerPlanoLocal(plano, resolucoes) {
    podarPerguntasSemEfeito(plano);
    await resolverAlvoMemoria(plano, resolucoes && resolucoes.alvo);
    return plano;
  }

  async function handleInterpretar(corpo) {
    var texto = String((corpo && corpo.texto) || '');
    if (texto.length > MAX_TEXTO_COMANDO) throw erro('comando longo demais (máx. ' + MAX_TEXTO_COMANDO + ' caracteres)');
    var contexto = lerContextoLocal(corpo);
    var lexico = carregarLexicoLocal();
    var plano = interpretar(texto, lexico, contexto);
    await enriquecerPlanoLocal(plano, (corpo && corpo.resolucoes) || {});
    return { ok: true, plano: plano, ui: { ordem: ORDEM_CHIPS, rotulos: ROTULO_CAMPO, intencoes: ROTULO_INTENCAO }, dry_run: true };
  }

  function postoIgualLocal(campos) {
    var cliente = campos.cliente ? campos.cliente.valor : null;
    var data = campos.data_publicacao ? campos.data_publicacao.valor : null;
    var assunto = campos.assunto ? campos.assunto.valor : null;
    if (!cliente || !data || !assunto) return null;
    var achado = postsDb.filter(function (p) {
      return !p.excluido_em && p.cliente_id === cliente && p.data_publicacao === data
        && String(p.assunto).toLowerCase() === String(assunto).toLowerCase();
    })[0];
    return achado ? { id: achado.id } : null;
  }

  function cadastrarOpcoesLocal(aCriar, plano, login) {
    var criadas = [];
    var clienteId = (plano.alvo && plano.alvo.escolhido && plano.alvo.escolhido.cliente_id)
      || (plano.campos.cliente ? plano.campos.cliente.valor : null);
    aCriar.forEach(function (o) {
      var criada = createOpcaoLocal(o.categoria, { nome: o.nome, clientes: clienteId ? [clienteId] : [] }, login);
      criadas.push({ categoria: o.categoria, id: criada.id, nome: criada.nome });
      var destino = o.destino === 'mudanca' ? plano.mudancas : plano.campos;
      destino[o.categoria] = { valor: Number(criada.id), rotulo: criada.nome, trecho: o.nome, origem: 'cadastrado agora', confianca: 1 };
    });
    return criadas;
  }

  async function handleAplicar(corpo) {
    var canEdit = true, canToggleStatus = true;
    var login = LOGIN;

    var texto = String((corpo && corpo.texto) || '');
    if (!texto.trim()) throw erro('comando vazio');
    if (texto.length > MAX_TEXTO_COMANDO) throw erro('comando longo demais (máx. ' + MAX_TEXTO_COMANDO + ' caracteres)');

    var contexto = lerContextoLocal(corpo);
    var lexico = carregarLexicoLocal();
    var plano = interpretar(texto, lexico, contexto);
    var resolucoes = (corpo && corpo.resolucoes) || {};

    function recusa(status, extra) {
      var resposta = Object.assign({ ok: false, plano: plano }, extra || {});
      registrarLogLocal({
        login: login, texto: texto, intencao: plano.intencao, resultado: 'recusado', erro: resposta.error,
        postId: plano.alvo && plano.alvo.escolhido ? plano.alvo.escolhido.id : null,
      });
      var e = new Error(resposta.error || 'recusado');
      e.status = status; e.payload = resposta;
      throw e;
    }

    var nivel = PERMISSAO_POR_INTENCAO[plano.intencao];
    if (!nivel) {
      recusa(400, { error: plano.intencao === 'consultar' ? 'consulta é aplicada na própria tela, sem passar por aqui' : ('“' + plano.intencao + '” ainda não é aplicável (fase ' + (plano.meta.fase_aplicacao || '?') + ')') });
    }
    if (nivel === 'edit' && !canEdit) recusa(403, { error: 'sem permissão para editar posts' });
    if (nivel === 'status' && !canToggleStatus) recusa(403, { error: 'sem permissão para trocar status' });

    await enriquecerPlanoLocal(plano, resolucoes);
    if (plano.alvo) {
      if (plano.alvo.estado && plano.alvo.estado !== 'resolvido') {
        var status409 = plano.alvo.estado === 'perguntar' ? 409 : 400;
        recusa(status409, { error: plano.alvo.motivo, alvo: plano.alvo.estado, candidatos: plano.alvo.candidatos });
      }
      if (plano.alvo.impedimento) recusa(400, { error: plano.alvo.impedimento });
    }

    var aCriar = [];
    var escolhidos = {};
    for (var i = 0; i < plano.ambiguidades.length; i++) {
      var amb = plano.ambiguidades[i];
      if (amb.campo === 'alvo') continue;
      var r = resolucoes[amb.campo];
      if (!r || typeof r !== 'object') recusa(400, { error: 'responda a pergunta sobre "' + amb.trecho + '" antes de aplicar' });
      if (r.acao === 'escolher') {
        var escolha = (amb.opcoes || []).filter(function (o) { return Number(o.id) === Number(r.id); })[0];
        if (!escolha) recusa(400, { error: 'opção inválida para ' + amb.campo });
        escolhidos[amb.campo] = { valor: Number(escolha.id), rotulo: escolha.nome, destino: amb.destino };
      } else if (r.acao === 'criar') {
        if (!CATEGORIA_CAMPO[amb.campo]) recusa(400, { error: 'não é possível cadastrar ' + amb.campo });
        aCriar.push({ categoria: amb.campo, nome: amb.trecho, destino: amb.destino });
      } else if (r.acao === 'ignorar') {
        continue;
      } else {
        recusa(400, { error: 'ação inválida para ' + amb.campo });
      }
    }
    Object.keys(escolhidos).forEach(function (campo) {
      var e = escolhidos[campo];
      var alvoDoChip = e.destino === 'mudanca' ? plano.mudancas : plano.campos;
      alvoDoChip[campo] = { valor: e.valor, rotulo: e.rotulo, trecho: '', origem: 'escolha do usuário', confianca: 1 };
    });

    var virtual = Object.assign({}, plano.campos);
    var virtuaisMudanca = Object.assign({}, plano.mudancas);
    aCriar.forEach(function (o) {
      if (o.destino === 'mudanca') virtuaisMudanca[o.categoria] = { valor: -1 };
      else virtual[o.categoria] = { valor: -1 };
    });
    var falta = faltantes(plano.intencao, virtual, virtuaisMudanca);
    if (falta.length) {
      var nomes = falta.map(function (f) { return ROTULO_CAMPO[f] || f; }).join(', ');
      recusa(400, { error: 'falta informar: ' + nomes, faltando: falta });
    }

    if (plano.intencao === 'criar' && !(corpo && corpo.confirmar_duplicado === true)) {
      var dup = postoIgualLocal(plano.campos);
      if (dup) {
        recusa(409, {
          duplicado: { id: dup.id },
          error: 'já existe um post com esse título, nesse dia, para esse cliente. Reenvie com confirmar_duplicado se quiser criar mesmo assim.',
        });
      }
    }

    if (plano.intencao === 'remover' && !(corpo && corpo.confirmar_remocao === true)) {
      var alvoRem = plano.alvo.escolhido;
      recusa(409, {
        confirmar: 'remocao', alvo_post: alvoRem,
        error: 'confirme a remoção de "' + alvoRem.assunto + '" (' + alvoRem.data_publicacao + '). Reenvie com confirmar_remocao.',
      });
    }

    if (['mover', 'status', 'remover', 'alterar'].indexOf(plano.intencao) >= 0) {
      var alvo = plano.alvo.escolhido;
      var antes = lerSnapshotLocal(alvo.id);

      if (plano.intencao === 'alterar') {
        var criadas = cadastrarOpcoesLocal(aCriar, plano, login);
        var corpoPatch = corpoDaAlteracao(plano.mudancas);
        updatePostLocal(alvo.id, corpoPatch, login);
        var depois = Object.assign({}, alvo, corpoPatch);
        var logId1 = registrarLogLocal({ login: login, texto: texto, intencao: 'alterar', resultado: 'ok', postId: alvo.id, antes: antes, depois: depois, plano: plano });
        return {
          ok: true, acao: 'alterar', post: depois,
          anterior: Object.fromEntries(Object.keys(corpoPatch).map(function (k) { return [k, antes ? antes[k] : null]; })),
          mudou: Object.fromEntries(Object.entries(plano.mudancas).map(function (kv) { return [kv[0], kv[1].rotulo]; })),
          opcoes_criadas: criadas, log_id: logId1, avisos: plano.avisos, plano: plano,
        };
      }
      if (plano.intencao === 'mover') {
        var para = plano.campos.data_publicacao.valor;
        updatePostLocal(alvo.id, { data_publicacao: para }, login);
        var logId2 = registrarLogLocal({ login: login, texto: texto, intencao: 'mover', resultado: 'ok', postId: alvo.id, antes: antes, depois: Object.assign({}, alvo, { data_publicacao: para }), plano: plano });
        return { ok: true, acao: 'mover', post: Object.assign({}, alvo, { data_publicacao: para }), anterior: { data_publicacao: alvo.data_publicacao }, log_id: logId2, avisos: plano.avisos, plano: plano };
      }
      if (plano.intencao === 'status') {
        var paraStatus = plano.campos.status.valor;
        setStatusLocal(alvo.id, paraStatus, login);
        var logId3 = registrarLogLocal({ login: login, texto: texto, intencao: 'status', resultado: 'ok', postId: alvo.id, antes: antes, depois: Object.assign({}, alvo, { status: paraStatus }), plano: plano });
        return { ok: true, acao: 'status', post: Object.assign({}, alvo, { status: paraStatus }), anterior: { status: alvo.status }, log_id: logId3, avisos: plano.avisos, plano: plano };
      }
      // remover
      deletePostLocal(alvo.id, login);
      var logId4 = registrarLogLocal({ login: login, texto: texto, intencao: 'remover', resultado: 'ok', postId: alvo.id, antes: antes, depois: alvo, plano: plano });
      return { ok: true, acao: 'remover', post: alvo, anterior: { excluido_em: null }, log_id: logId4, avisos: plano.avisos, plano: plano };
    }

    // criar
    var opcoesCriadas = cadastrarOpcoesLocal(aCriar, plano, login);
    var res = createPostLocal(corpoDoPost(plano.campos), login);
    var logId5 = registrarLogLocal({ login: login, texto: texto, intencao: 'criar', resultado: 'ok', postId: res.id, antes: null, depois: res.post, plano: plano });
    return { ok: true, acao: 'criar', post: res.post, anterior: null, opcoes_criadas: opcoesCriadas, log_id: logId5, avisos: plano.avisos, plano: plano };
  }

  function handleDesfazer() {
    var canEdit = true, canToggleStatus = true, login = LOGIN;
    var linha = ultimoDesfazivelLocal(login);
    if (!linha) throw erro('não há comando seu para desfazer', 404);

    var nivel = PERMISSAO_POR_INTENCAO[linha.intencao];
    if (nivel === 'edit' && !canEdit) throw erro('desfazer este comando exige permissão de edição', 403);
    if (nivel === 'status' && !canToggleStatus) throw erro('sem permissão para trocar status', 403);

    var post = null;
    if (linha.intencao === 'criar') {
      deletePostLocal(linha.post_id, login);
      post = linha.depois ? JSON.parse(linha.depois) : { id: linha.post_id };
    } else {
      var antes = JSON.parse(linha.antes);
      var atual = lerSnapshotLocal(linha.post_id);
      if (!atual) throw erro('o post do comando não existe mais', 404);
      if (atual.excluido_em && !antes.excluido_em) restorePostLocal(linha.post_id, login);
      updatePostLocal(linha.post_id, {
        data_publicacao: antes.data_publicacao, data_original: antes.data_original, assunto: antes.assunto,
        formato: antes.formato, horario: antes.horario, pilar_id: antes.pilar_id, publico_id: antes.publico_id,
        objetivo_id: antes.objetivo_id, status: antes.status, impulsionar: antes.impulsionar, conteudo: antes.conteudo,
        redes: antes.redes || [],
      }, login);
      post = Object.assign({}, antes, { redes: antes.redes || [] });
    }
    marcarDesfeitoLocal(linha.id, login);
    return { ok: true, desfeito: { log_id: linha.id, intencao: linha.intencao, texto: linha.texto }, post: post };
  }

  async function handleSugestoes(params) {
    var contexto = { hoje: sanearDataCtx(params.get('hoje') || ''), mes: sanearMesCtx(params.get('mes') || ''), cliente_id: Number(params.get('cliente_id') || 0) || null };
    var lexico = carregarLexicoLocal();
    var sugestoes = await gerarSugestoesLocal(lexico, contexto, { canEdit: true, canToggleStatus: true }, { semente: Number(params.get('semente') || 0) || 0 });
    return { ok: true, sugestoes: sugestoes };
  }

  function handleLexico() {
    var lexico = carregarLexicoLocal();
    return {
      ok: true, formatos: lexico.formatos, redes: lexico.redes, statuses: lexico.statuses,
      clientes: lexico.clientes.map(function (c) { return c.nome; }),
      totais: {
        clientes: lexico.clientes.length, opcoes: lexico.opcoes.length,
        literais: Object.fromEntries(Object.entries(lexico.literais).map(function (kv) { return [kv[0], kv[1].length]; })),
      },
      literais: lexico.literais,
    };
  }

  // ═════════════════════════════════════════════════════════════════════════
  //  ROTEADOR — intercepta fetch() e nunca deixa a exceção escapar
  // ═════════════════════════════════════════════════════════════════════════
  var realFetch = window.fetch.bind(window);

  function jsonResponse(obj, status) {
    return new Promise(function (resolve) {
      setTimeout(function () {
        resolve(new Response(JSON.stringify(obj), { status: status || 200, headers: { 'Content-Type': 'application/json; charset=utf-8' } }));
      }, 110);
    });
  }

  window.fetch = function (input, init) {
    var opts = init || {};
    var url = new URL(typeof input === 'string' ? input : input.url, location.href);
    var path = url.pathname;
    var method = (opts.method || 'GET').toUpperCase();
    var bodyJson = function () { try { return JSON.parse(opts.body || '{}'); } catch (e) { return {}; } };

    if (path === '/api/me' && method === 'GET') {
      return jsonResponse({
        user: LOGIN, roles: ['demo'], canEditAvisos: false,
        canEditCalendario: true, canToggleCalendarioStatus: true,
        canEditOkr: false, canCreateOkr: false, canEditOkrConfig: false, canStartMeeting: false, isSuper: false,
      });
    }

    if (path.indexOf('/api/calendario') !== 0) return realFetch(input, init);

    var seg = path.replace(/^\/api\/calendario\/?/, '').split('/').filter(Boolean);

    try {
      if (seg[0] === 'listas' && seg.length === 1 && method === 'GET') {
        return jsonResponse(listListasLocal());
      }

      if (seg[0] === 'agenda') {
        if (seg.length === 2 && seg[1] === 'interpretar' && method === 'POST') {
          return handleInterpretar(bodyJson()).then(function (r) { return jsonResponse(r); });
        }
        if (seg.length === 2 && seg[1] === 'sugestoes' && method === 'GET') {
          return handleSugestoes(url.searchParams).then(function (r) { return jsonResponse(r); });
        }
        if (seg.length === 2 && seg[1] === 'lexico' && method === 'GET') {
          return jsonResponse(handleLexico());
        }
        if (seg.length === 2 && seg[1] === 'aplicar' && method === 'POST') {
          return handleAplicar(bodyJson()).then(function (r) { return jsonResponse(r); })
            .catch(function (e) { return jsonResponse(e.payload || { ok: false, error: String(e.message || e) }, e.status || 500); });
        }
        if (seg.length === 2 && seg[1] === 'desfazer' && method === 'POST') {
          try { return jsonResponse(handleDesfazer()); }
          catch (e) { return jsonResponse({ ok: false, error: String(e.message || e) }, e.status || 500); }
        }
      }

      if (seg[0] === 'posts') {
        if (seg.length === 1 && method === 'GET') {
          return jsonResponse(listPostsLocal({ from: url.searchParams.get('from'), to: url.searchParams.get('to'), cliente: url.searchParams.get('cliente') }));
        }
        if (seg.length === 1 && method === 'POST') {
          return jsonResponse(createPostLocal(bodyJson(), LOGIN), 201);
        }
        if (seg.length === 2 && method === 'PATCH') {
          return jsonResponse(updatePostLocal(seg[1], bodyJson(), LOGIN));
        }
        if (seg.length === 2 && method === 'DELETE') {
          return jsonResponse(deletePostLocal(seg[1], LOGIN));
        }
        if (seg.length === 3 && seg[2] === 'status' && method === 'PATCH') {
          var b = bodyJson();
          return jsonResponse(setStatusLocal(seg[1], b.status, LOGIN));
        }
      }

      if (seg[0] === 'opcoes') {
        if (seg.length === 2 && method === 'POST') return jsonResponse(createOpcaoLocal(seg[1], bodyJson(), LOGIN), 201);
        if (seg.length === 2 && method === 'PATCH') return jsonResponse(updateOpcaoLocal(seg[1], bodyJson(), LOGIN));
      }

      return jsonResponse({ ok: false, error: 'rota do calendário não encontrada (demo)' }, 404);
    } catch (e) {
      return jsonResponse({ ok: false, error: String((e && e.message) || e) }, (e && e.status) || 500);
    }
  };
})();
