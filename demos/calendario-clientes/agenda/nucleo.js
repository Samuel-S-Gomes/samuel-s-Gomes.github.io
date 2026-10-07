/* ============================================================================
 * Núcleo da Agenda Inteligente — copiado do backend real (Paginas-MKT/src/calendario)
 * e concatenado num script único (sem módulos ES, import/export removidos) para
 * rodar 100% no navegador. NENHUMA regra de negócio foi reescrita aqui.
 *
 * A única função deste arquivo que toca D1 é `resolverAlvo` (dentro da seção de
 * agenda-alvo.js) — ela fica presente mas MORTA: quem resolve o alvo na demo é
 * `resolverAlvoMemoria()` em ../mock-api.js, que reaproveita as peças PURAS
 * desta seção (classificarCandidatos, podarPerguntasSemEfeito, diaMes,
 * descreverCriterios, fixarChipDoAlvo, verificarImpedimento, atualizarEfeitos)
 * contra um array de posts em memória em vez de uma consulta ao banco.
 * ============================================================================ */

/* ---------- enums.js ---------- */
/**
 * Enums FIXOS do calendário — a fonte única da verdade em JS para os valores que
 * o schema (migration 0009) trava com CHECK.
 *
 * Vive num módulo próprio, sem nenhuma dependência, para quebrar o ciclo de
 * import que apareceria de outra forma: posts.js → agenda.js → agenda-lexico.js
 * → posts.js. ESM tolera ciclos, mas quem for editar isso depois não deveria ter
 * que raciocinar sobre ordem de avaliação de módulo.
 *
 * ★ Ao mudar um valor aqui, mude o CHECK da migration junto (e vice-versa).
 */

/** calendario_posts.formato — define também a cor do card (§4.1 do doc). */
const FORMATOS = new Set(['Post no Feed', 'Post Único', 'Carrossel', 'Reels', 'Stories']);

/** calendario_posts.status — os 4 valores da planilha original. */
const STATUS = new Set(['Não iniciado', 'Em produção', 'Não publicado', 'Publicado']);

/** calendario_post_redes.rede. */
const REDES = new Set(['Instagram', 'LinkedIn', 'YouTube', 'TikTok']);

/** Categorias de lista gerenciável e o campo do post que cada uma preenche. */
const CATEGORIA_CAMPO = { pilar: 'pilar_id', publico: 'publico_id', objetivo: 'objetivo_id' };

/**
 * Filtro de post VIVO (soft delete, migration 0027) — `p` é o alias da tabela.
 *
 * Não é enum, e mora aqui pelo MESMO motivo que os enums: é uma régua que
 * `posts.js` e `agenda-alvo.js` precisam compartilhar, e importá-la de posts.js
 * recriaria o ciclo que este módulo existe para quebrar.
 *
 * ★ Um `AND excluido_em IS NULL` esquecido em qualquer leitura é o jeito
 * silencioso de o soft delete "não funcionar": o post apagado volta a aparecer na
 * grade, ou é oferecido como alvo de um comando. Use esta constante, não a string.
 */
const VIVO_SQL = 'p.excluido_em IS NULL';


/* ---------- agenda-texto.js ---------- */
/**
 * ============================================================================
 *  AGENDA INTELIGENTE — camada de texto (normalização, spans e similaridade)
 * ============================================================================
 * Módulo PURO: sem I/O, sem D1, sem fetch. Roda igual no Worker e no `node`
 * (é o que permite testar o parser com `npm run test:agenda`, sem wrangler).
 *
 * Três responsabilidades:
 *   1. NORMALIZAR    — comparar texto do usuário com o léxico sem tropeçar em
 *                      acento, caixa ou espaço duplo.
 *   2. SPANS         — controlar qual PEDAÇO do comando já foi consumido por um
 *                      matcher, para que o resíduo final possa virar título.
 *   3. SIMILARIDADE  — casar "5 Beneficios do Uniplu" com o valor cadastrado,
 *                      sem depender de biblioteca externa.
 *
 * Ver docs/calendario-editorial/agenda-inteligente.md.
 */

// ─────────────────────────────────────────────────────────────────────────────
// 1. Normalização
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Forma canônica de comparação: minúsculas, sem acento, sem pontuação de borda,
 * espaços colapsados. É ESTA forma que é gravada em calendario_apelidos.apelido.
 *
 * Importante: a normalização preserva o COMPRIMENTO em caracteres quando
 * possível (NFD + remoção de diacríticos não muda a contagem de letras-base),
 * mas NÃO é garantida para colapso de espaços — por isso os matchers trabalham
 * sobre `normalizarPreservandoIndices`, e só o léxico usa esta função.
 */
function normalizar(s) {
  return String(s == null ? '' : s)
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')   // tira diacríticos (á -> a, ç -> c)
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s/:.-]+/gu, ' ') // mantém letras, números e / : . - (datas/horas)
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Normaliza mantendo um MAPA de índices para o texto original.
 * Devolve `{ texto, mapa }` onde `mapa[i]` é o índice, no texto ORIGINAL, do
 * caractere que virou `texto[i]`. É isso que permite devolver ao front o trecho
 * exato ("Sophos", com maiúscula e acento) que gerou cada chip.
 */
function normalizarPreservandoIndices(original) {
  const src = String(original == null ? '' : original);
  let texto = '';
  const mapa = [];
  let ultimoFoiEspaco = true; // evita espaço inicial
  for (let i = 0; i < src.length; i++) {
    const bruto = src[i];
    const semAcento = bruto.normalize('NFD').replace(/[̀-ͯ]/g, '');
    // Um caractere pode virar '' (diacrítico solto) ou mais de um; usamos só o 1º.
    const c = (semAcento[0] || '').toLowerCase();
    if (!c) continue;
    const ehUtil = /[\p{L}\p{N}/:.-]/u.test(c);
    if (ehUtil) {
      texto += c;
      mapa.push(i);
      ultimoFoiEspaco = false;
    } else if (!ultimoFoiEspaco) {
      texto += ' ';
      mapa.push(i);
      ultimoFoiEspaco = true;
    }
  }
  // Remove espaço final (e seu índice) para o texto ficar trim().
  while (texto.endsWith(' ')) { texto = texto.slice(0, -1); mapa.pop(); }
  return { texto, mapa };
}

/** Palavras que nunca devem sobrar sozinhas num título/resíduo. */
const CONECTORES = new Set([
  'a', 'o', 'as', 'os', 'um', 'uma', 'uns', 'umas', 'de', 'da', 'do', 'das', 'dos',
  'em', 'na', 'no', 'nas', 'nos', 'para', 'pra', 'pro', 'por', 'com', 'sem', 'e',
  'ou', 'que', 'ao', 'aos', 'à', 'as', 'the', 'post', 'posts', 'publicacao',
  'publicar', 'conteudo', 'sobre',
]);

/** Remove conectores das BORDAS de um trecho (o miolo é preservado). */
function limparBordas(s) {
  let partes = normalizar(s).split(' ').filter(Boolean);
  while (partes.length && CONECTORES.has(partes[0])) partes.shift();
  while (partes.length && CONECTORES.has(partes[partes.length - 1])) partes.pop();
  return partes.join(' ');
}

// ─────────────────────────────────────────────────────────────────────────────
// 2. Spans — controle do que já foi consumido
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Marcador de trechos consumidos sobre o texto normalizado. Cada matcher que
 * reconhece algo chama `consumir(i, j, campo)`; o que restar no fim vira título
 * (ou critério de busca, em comandos de alterar/remover).
 */
class Spans {
  constructor(tamanho) {
    this.tamanho = tamanho;
    this.marcas = new Array(tamanho).fill(null); // null | nome do campo
  }

  /** Já existe algo consumido no intervalo [i, j)? */
  ocupado(i, j) {
    for (let k = Math.max(0, i); k < Math.min(this.tamanho, j); k++) {
      if (this.marcas[k] !== null) return true;
    }
    return false;
  }

  consumir(i, j, campo) {
    for (let k = Math.max(0, i); k < Math.min(this.tamanho, j); k++) this.marcas[k] = campo;
  }

  /** Trechos [i, j) ainda livres, ignorando os que só têm espaço. */
  livres(texto) {
    const out = [];
    let ini = null;
    for (let k = 0; k <= this.tamanho; k++) {
      const livre = k < this.tamanho && this.marcas[k] === null;
      if (livre && ini === null) ini = k;
      if (!livre && ini !== null) { out.push([ini, k]); ini = null; }
    }
    return out.filter(([i, j]) => texto.slice(i, j).trim().length > 0);
  }

  /** Fração do texto (sem espaços) que foi consumida — entra no cálculo de confiança. */
  cobertura(texto) {
    let uteis = 0;
    let cobertos = 0;
    for (let k = 0; k < this.tamanho; k++) {
      if (texto[k] === ' ') continue;
      uteis++;
      if (this.marcas[k] !== null) cobertos++;
    }
    return uteis ? cobertos / uteis : 0;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 3. Similaridade
// ─────────────────────────────────────────────────────────────────────────────

/** Bigramas de uma string normalizada (com marcadores de borda por palavra). */
function bigramas(s) {
  const set = new Map();
  for (const palavra of s.split(' ').filter(Boolean)) {
    const p = ` ${palavra} `;
    for (let i = 0; i < p.length - 1; i++) {
      const bg = p.slice(i, i + 2);
      set.set(bg, (set.get(bg) || 0) + 1);
    }
  }
  return set;
}

/**
 * Coeficiente de Sørensen–Dice sobre bigramas (0..1). Escolhido em vez de
 * Levenshtein porque é tolerante a ordem de palavras ("Uniplus benefícios" vs
 * "benefícios do Uniplus") e não precisa de matriz — cabe em 20 linhas e roda
 * em microssegundos no Worker.
 */
function dice(a, b) {
  const A = normalizar(a);
  const B = normalizar(b);
  if (!A || !B) return 0;
  if (A === B) return 1;
  const ba = bigramas(A);
  const bb = bigramas(B);
  let inter = 0;
  let totalA = 0;
  let totalB = 0;
  for (const n of ba.values()) totalA += n;
  for (const n of bb.values()) totalB += n;
  for (const [bg, n] of ba) {
    const m = bb.get(bg);
    if (m) inter += Math.min(n, m);
  }
  return (2 * inter) / (totalA + totalB || 1);
}

/**
 * Similaridade usada para casar valores de lista. Combina Dice com um bônus de
 * CONTENÇÃO DE TOKENS: "educacao" dentro de "educacao e desenvolvimento" tem
 * Dice modesto (~0.6) mas é claramente um candidato, então a fração de tokens
 * do consultado presentes no candidato puxa a nota para cima.
 */
function similaridade(consulta, candidato) {
  const d = dice(consulta, candidato);
  const tq = normalizar(consulta).split(' ').filter(Boolean);
  const tc = new Set(normalizar(candidato).split(' ').filter(Boolean));
  if (!tq.length) return d;
  let batidos = 0;
  for (const t of tq) {
    if (tc.has(t)) { batidos++; continue; }
    // prefixo de 4+ letras conta como meio acerto ("educa" ~ "educativo")
    for (const c of tc) {
      if (t.length >= 4 && (c.startsWith(t) || t.startsWith(c))) { batidos += 0.5; break; }
    }
  }
  const contencao = Math.min(1, batidos / tq.length);
  return Math.max(d, 0.55 * d + 0.45 * contencao);
}

/**
 * Limiares de decisão do parser. Deliberadamente conservadores: quando em
 * dúvida, a ferramenta PERGUNTA (chip amarelo) em vez de adivinhar.
 *   >= AUTO       -> resolve sozinho (havendo concorrentes, exige folga)
 *   >= AUTO_UNICO -> resolve sozinho QUANDO É O ÚNICO candidato plausível
 *   >= PERGUNTAR  -> devolve candidatos para o usuário escolher
 *   <  PERGUNTAR  -> ignora (o trecho sobra para o título)
 *
 * AUTO_UNICO existe por um caso concreto: "pilar de educação" para a Sophos só
 * tem um pilar visível compatível ("Educação e Desenvolvimento"). Perguntar com
 * uma única opção na tela é atrito puro — preenchemos o chip, mas com confiança
 * baixa, então ele aparece marcado como "conferir".
 */
const LIMIAR = { AUTO: 0.86, AUTO_UNICO: 0.7, PERGUNTAR: 0.55 };

/**
 * Ranqueia candidatos por similaridade e classifica a decisão.
 * `itens`: [{ nome, ...qualquer coisa }]. Devolve
 * `{ decisao:'auto'|'perguntar'|'nenhum', escolhido, candidatos:[{item,score}] }`.
 */
function ranquear(consulta, itens, { limite = 4 } = {}) {
  const scored = (itens || [])
    .map((item) => ({ item, score: similaridade(consulta, item.nome) }))
    .filter((c) => c.score >= LIMIAR.PERGUNTAR)
    .sort((a, b) => b.score - a.score)
    .slice(0, limite);

  if (!scored.length) return { decisao: 'nenhum', escolhido: null, candidatos: [] };

  const primeiro = scored[0];
  const segundo = scored[1];
  // Só resolve sozinho se for bom E folgadamente melhor que o segundo colocado.
  const folgado = !segundo || primeiro.score - segundo.score >= 0.12;
  if (primeiro.score >= LIMIAR.AUTO && folgado) {
    return { decisao: 'auto', escolhido: primeiro, candidatos: scored };
  }
  if (!segundo && primeiro.score >= LIMIAR.AUTO_UNICO) {
    return { decisao: 'auto', escolhido: primeiro, candidatos: scored };
  }
  return { decisao: 'perguntar', escolhido: null, candidatos: scored };
}


/* ---------- agenda-datas.js ---------- */
/**
 * ============================================================================
 *  AGENDA INTELIGENTE — resolvedor de DATAS e HORÁRIOS em português
 * ============================================================================
 * Módulo PURO (sem I/O). Roda no Worker e no `node`.
 *
 * POR QUE NÃO USAR BIBLIOTECA
 * `dateparser` é Python (não roda no Worker). `chrono-node` roda, mas o locale
 * pt tem cobertura menor que o en e — o ponto decisivo — nenhuma biblioteca sabe
 * o CONTEXTO desta tela: quando a pessoa digita "para 18/06" ou "dia 15", o ano
 * (e o mês) que faltam vêm do MÊS VISÍVEL na grade do calendário. É esse
 * contexto que faz a diferença entre acertar e criar um post em 2002.
 *
 * REGRA DE INFERÊNCIA (previsibilidade > esperteza)
 *   - falta o ano  -> ano do MÊS VISÍVEL na grade;
 *   - falta o mês  -> mês (e ano) do MÊS VISÍVEL na grade;
 *   - nada é "corrigido" para o futuro automaticamente. Se o resultado cai no
 *     passado, a data vale e é devolvida com um AVISO. Ajustar sozinho para o
 *     ano seguinte já causou bug em ferramenta de calendário antes; aqui o
 *     usuário vê o chip com a data resolvida e corrige se não for isso.
 *
 * REGRA ANTI-FALSO-POSITIVO (a mais importante deste arquivo)
 * Um número solto NÃO é data. "5 Benefícios do Uniplus" não pode virar dia 5.
 * Só viram data os números com marcador explícito (`dia 5`, `5 de junho`) ou
 * formato inequívoco (`5/6`, `05/06/2026`).
 */

const MESES = {
  janeiro: 1, jan: 1, fevereiro: 2, fev: 2, marco: 3, mar: 3, abril: 4, abr: 4,
  maio: 5, mai: 5, junho: 6, jun: 6, julho: 7, jul: 7, agosto: 8, ago: 8,
  setembro: 9, set: 9, outubro: 10, out: 10, novembro: 11, nov: 11,
  dezembro: 12, dez: 12,
};

// Dia da semana -> índice JS (0 = domingo). A grade da tela começa no domingo.
const SEMANA = {
  domingo: 0, dom: 0,
  segunda: 1, seg: 1, 'segunda-feira': 1,
  terca: 2, ter: 2, 'terca-feira': 2,
  quarta: 3, qua: 3, 'quarta-feira': 3,
  quinta: 4, qui: 4, 'quinta-feira': 4,
  sexta: 5, sex: 5, 'sexta-feira': 5,
  sabado: 6, sab: 6,
};

const MESES_ALT = Object.keys(MESES).sort((a, b) => b.length - a.length).join('|');
const SEMANA_ALT = Object.keys(SEMANA).sort((a, b) => b.length - a.length).join('|');

// ─────────────────────────────────────────────────────────────────────────────
// Utilidades de data (trabalhamos sempre com 'YYYY-MM-DD', nunca com Date+fuso)
// ─────────────────────────────────────────────────────────────────────────────

const pad = (n) => String(n).padStart(2, '0');

/** Data válida no calendário? (rejeita 31/02, 30/02, mês 13…) */
function dataValida(ano, mes, dia) {
  if (!(ano >= 1900 && ano <= 2200)) return false;
  if (!(mes >= 1 && mes <= 12)) return false;
  if (!(dia >= 1 && dia <= 31)) return false;
  const ultimo = new Date(Date.UTC(ano, mes, 0)).getUTCDate();
  return dia <= ultimo;
}

const ymd = (ano, mes, dia) => `${ano}-${pad(mes)}-${pad(dia)}`;

/** 'YYYY-MM-DD' -> {ano, mes, dia}. Não usa Date (evita surpresa de fuso). */
function partes(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso || ''));
  if (!m) return null;
  return { ano: Number(m[1]), mes: Number(m[2]), dia: Number(m[3]) };
}

/** Soma dias a uma data ISO, em UTC (sem horário de verão para atrapalhar). */
function somarDias(iso, dias) {
  const p = partes(iso);
  if (!p) return null;
  const d = new Date(Date.UTC(p.ano, p.mes - 1, p.dia));
  d.setUTCDate(d.getUTCDate() + dias);
  return ymd(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate());
}

function diaDaSemana(iso) {
  const p = partes(iso);
  if (!p) return null;
  return new Date(Date.UTC(p.ano, p.mes - 1, p.dia)).getUTCDay();
}

function primeiroDia(ano, mes) { return ymd(ano, mes, 1); }
function ultimoDia(ano, mes) {
  return ymd(ano, mes, new Date(Date.UTC(ano, mes, 0)).getUTCDate());
}

// ─────────────────────────────────────────────────────────────────────────────
// Contexto
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Normaliza o contexto vindo da tela.
 *   hoje: 'YYYY-MM-DD'  — data do usuário (o front manda a dele, não a do Worker,
 *                          porque o Worker roda em UTC e o time está em BRT).
 *   mes:  'YYYY-MM'     — mês visível na grade; é a base da inferência.
 */
function normalizarContexto(ctx) {
  const hoje = partes((ctx && ctx.hoje) || '') ? ctx.hoje : null;
  let mesRef = null;
  const m = /^(\d{4})-(\d{2})$/.exec(String((ctx && ctx.mes) || ''));
  if (m) mesRef = { ano: Number(m[1]), mes: Number(m[2]) };
  if (!mesRef && hoje) { const p = partes(hoje); mesRef = { ano: p.ano, mes: p.mes }; }
  return { hoje, mesRef };
}

// ─────────────────────────────────────────────────────────────────────────────
// Resolvedor de DATA
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Coleta TODAS as expressões de data reconhecidas no texto normalizado, já
 * ordenadas por preferência (ver o comentário da ordenação no fim da função).
 *
 * @param {string} texto  texto já normalizado (minúsculo, sem acento)
 * @param {object} ctx    { hoje: 'YYYY-MM-DD', mes: 'YYYY-MM' }
 * @param {object} opcoes { inicio: índice a partir do qual procurar }
 * @returns {Array<{
 *   tipo: 'dia' | 'periodo',
 *   data?: string, de?: string, ate?: string,
 *   inicio: number, fim: number, trecho: string,
 *   origem: string,              // qual regra casou (entra no chip/depuração)
 *   inferido: string[],          // ['ano'] / ['mes','ano'] — o que veio do contexto
 *   avisos: string[]
 * }>}
 */
function coletarDatas(texto, ctx, opcoes = {}) {
  const { hoje, mesRef } = normalizarContexto(ctx);
  const inicio = opcoes.inicio || 0;
  const alvo = texto.slice(inicio);
  const anoRef = mesRef ? mesRef.ano : (hoje ? partes(hoje).ano : new Date().getUTCFullYear());

  const candidatos = [];
  const add = (m, extra) => {
    if (!extra) return;
    candidatos.push({
      inicio: inicio + m.index,
      fim: inicio + m.index + m[0].length,
      trecho: m[0].trim(),
      inferido: [],
      avisos: [],
      ...extra,
    });
  };

  // ── 1. Numérica completa: 18/06/2026, 18-06-26, 18.06.2026 ────────────────
  for (const m of alvo.matchAll(/\b(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})\b/g)) {
    const dia = Number(m[1]);
    const mes = Number(m[2]);
    let ano = Number(m[3]);
    if (ano < 100) ano += ano < 70 ? 2000 : 1900;
    if (dataValida(ano, mes, dia)) add(m, { tipo: 'dia', data: ymd(ano, mes, dia), origem: 'numerica-completa' });
  }

  // ── 2. Numérica curta: 18/06 (sem ano) ────────────────────────────────────
  // Só casa se NÃO houver um terceiro grupo (senão a regra 1 já pegou).
  for (const m of alvo.matchAll(/\b(\d{1,2})[/](\d{1,2})\b(?![/.-]\d)/g)) {
    const dia = Number(m[1]);
    const mes = Number(m[2]);
    if (!dataValida(anoRef, mes, dia)) continue;
    add(m, {
      tipo: 'dia',
      data: ymd(anoRef, mes, dia),
      origem: 'numerica-curta',
      inferido: ['ano'],
      avisos: [`Ano não informado — assumi ${anoRef} (o ano do mês aberto no calendário).`],
    });
  }

  // ── 3. "15 de janeiro [de 2026]" / "15 de jan" ────────────────────────────
  for (const m of alvo.matchAll(new RegExp(`\\b(\\d{1,2})\\s*(?:de\\s+)?(${MESES_ALT})\\b(?:\\s+(?:de\\s+)?(\\d{4}))?`, 'g'))) {
    const dia = Number(m[1]);
    const mes = MESES[m[2]];
    const ano = m[3] ? Number(m[3]) : anoRef;
    if (!dataValida(ano, mes, dia)) continue;
    add(m, {
      tipo: 'dia',
      data: ymd(ano, mes, dia),
      origem: 'dia-mes-extenso',
      inferido: m[3] ? [] : ['ano'],
      avisos: m[3] ? [] : [`Ano não informado — assumi ${ano}.`],
    });
  }

  // ── 4. "dia 15" / "no dia 15" / "para o dia 15" ───────────────────────────
  // Marcador OBRIGATÓRIO: é o que impede "5 Benefícios" de virar dia 5.
  for (const m of alvo.matchAll(/\b(?:no\s+|para\s+o\s+|para\s+|ao\s+)?dia\s+(\d{1,2})\b(?![/.-]\d)/g)) {
    const dia = Number(m[1]);
    if (!mesRef || !dataValida(mesRef.ano, mesRef.mes, dia)) continue;
    add(m, {
      tipo: 'dia',
      data: ymd(mesRef.ano, mesRef.mes, dia),
      origem: 'dia-do-mes-visivel',
      inferido: ['mes', 'ano'],
      avisos: [`Mês não informado — assumi ${pad(mesRef.mes)}/${mesRef.ano} (o mês aberto no calendário).`],
    });
  }

  // ── 5. Relativas simples ──────────────────────────────────────────────────
  if (hoje) {
    const rel = [
      [/\bdepois\s+de\s+amanha\b/g, 2, 'depois-de-amanha'],
      [/\bamanha\b/g, 1, 'amanha'],
      [/\bhoje\b/g, 0, 'hoje'],
      [/\bontem\b/g, -1, 'ontem'],
    ];
    for (const [re, delta, origem] of rel) {
      for (const m of alvo.matchAll(re)) add(m, { tipo: 'dia', data: somarDias(hoje, delta), origem });
    }
    // "em 3 dias", "daqui a 2 semanas"
    for (const m of alvo.matchAll(/\b(?:em|daqui\s+a|dentro\s+de)\s+(\d{1,3})\s+(dias?|semanas?|meses|mes)\b/g)) {
      const n = Number(m[1]);
      const unidade = m[2];
      const dias = /semana/.test(unidade) ? n * 7 : /mes/.test(unidade) ? n * 30 : n;
      add(m, { tipo: 'dia', data: somarDias(hoje, dias), origem: 'relativa-quantidade' });
    }
    // "próxima segunda", "segunda que vem", "na terça"
    for (const m of alvo.matchAll(new RegExp(`\\b(?:(?:na|no|nesta|neste|proxima|proximo)\\s+)?(${SEMANA_ALT})(?:\\s*-?\\s*feira)?(?:\\s+que\\s+vem)?\\b`, 'g'))) {
      const dow = SEMANA[m[1]];
      if (dow === undefined) continue;
      const bruto = m[0];
      // Sem nenhum marcador ("segunda" cru), o risco de falso positivo é alto
      // ("segunda opção", "segunda parte") — exige marcador.
      if (!/\b(na|no|nesta|neste|proxima|proximo)\b/.test(bruto) && !/que\s+vem/.test(bruto)) continue;
      const atual = diaDaSemana(hoje);
      let delta = (dow - atual + 7) % 7;
      if (delta === 0) delta = 7; // "próxima segunda" nunca é hoje
      // Nota: "próxima segunda" devolve a PRÓXIMA OCORRÊNCIA, mesmo que ela
      // ainda caia nesta semana — é a leitura coloquial no Brasil. O chip mostra
      // a data resolvida, então o usuário confere.
      add(m, { tipo: 'dia', data: somarDias(hoje, delta), origem: 'dia-da-semana' });
    }
  }

  // ── 6. Períodos (úteis para CONSULTAR: "os Reels de julho") ───────────────
  // Mês por extenso SEM dia: "em julho", "julho de 2026".
  for (const m of alvo.matchAll(new RegExp(`\\b((?:em|de|no\\s+mes\\s+de)\\s+)?(${MESES_ALT})\\b(?:\\s+(?:de\\s+)?(\\d{4}))?`, 'g'))) {
    // Sem preposição na frente, um dígito imediatamente antes indica que a
    // regra 3 (dia + mês) já cobriu isso. A checagem é feita a partir do INÍCIO
    // DO NOME DO MÊS — olhar 4 caracteres atrás do match inteiro fazia
    // "sm10 em julho" ser descartado por causa do "10" do nome do cliente.
    const inicioMes = m.index + (m[1] ? m[1].length : 0);
    if (!m[1]) {
      const antes = alvo.slice(Math.max(0, inicioMes - 4), inicioMes);
      if (/\d\s*(?:de\s*)?$/.test(antes)) continue;
    }
    const mes = MESES[m[2]];
    const ano = m[3] ? Number(m[3]) : anoRef;
    add(m, {
      tipo: 'periodo',
      de: primeiroDia(ano, mes),
      ate: ultimoDia(ano, mes),
      origem: 'mes-extenso',
      inferido: m[3] ? [] : ['ano'],
    });
  }
  if (mesRef) {
    for (const m of alvo.matchAll(/\b(este|esse|neste|nesse)\s+mes\b/g)) {
      add(m, {
        tipo: 'periodo',
        de: primeiroDia(mesRef.ano, mesRef.mes),
        ate: ultimoDia(mesRef.ano, mesRef.mes),
        origem: 'mes-visivel',
      });
    }
    for (const m of alvo.matchAll(/\b(?:mes\s+que\s+vem|proximo\s+mes)\b/g)) {
      const mes = mesRef.mes === 12 ? 1 : mesRef.mes + 1;
      const ano = mesRef.mes === 12 ? mesRef.ano + 1 : mesRef.ano;
      add(m, { tipo: 'periodo', de: primeiroDia(ano, mes), ate: ultimoDia(ano, mes), origem: 'mes-seguinte' });
    }
  }
  if (hoje) {
    for (const m of alvo.matchAll(/\b(?:semana\s+que\s+vem|proxima\s+semana)\b/g)) {
      // Semana Dom→Sáb, como a grade da tela (decisão §7 nº 13 do calendário).
      const inicioSemana = somarDias(hoje, 7 - diaDaSemana(hoje));
      add(m, { tipo: 'periodo', de: inicioSemana, ate: somarDias(inicioSemana, 6), origem: 'semana-seguinte' });
    }
    for (const m of alvo.matchAll(/\b(?:esta|essa|nesta|nessa)\s+semana\b/g)) {
      const inicioSemana = somarDias(hoje, -diaDaSemana(hoje));
      add(m, { tipo: 'periodo', de: inicioSemana, ate: somarDias(inicioSemana, 6), origem: 'semana-atual' });
    }
  }

  // ORDEM DE PREFERÊNCIA (a ordem importa e já pegou bug real):
  //   1. 'dia' antes de 'periodo'. "post sobre a Reforma de março para 10/04"
  //      tem os dois; a data específica é a intenção, o "de março" é do título.
  //   2. mais à esquerda;
  //   3. o match mais longo (18/06/2026 ganha de 18/06).
  candidatos.sort((a, b) => (
    (a.tipo === 'dia' ? 0 : 1) - (b.tipo === 'dia' ? 0 : 1)
    || a.inicio - b.inicio
    || (b.fim - b.inicio) - (a.fim - a.inicio)
  ));
  for (const c of candidatos) {
    if (hoje && c.tipo === 'dia' && c.data < hoje) {
      c.avisos = c.avisos.concat('A data resolvida está no passado.');
    }
  }
  return candidatos;
}

/** A melhor expressão de data do texto (ou null). Ver coletarDatas(). */
function acharData(texto, ctx, opcoes = {}) {
  const c = coletarDatas(texto, ctx, opcoes);
  return c.length ? c[0] : null;
}

/**
 * Todas as datas do texto, SEM sobreposição, da esquerda para a direita.
 * Usado por comandos com duas datas ("mova o post de 10/06 para 18/06") — o
 * parser decide qual é destino pela preposição que a antecede.
 */
function acharDatas(texto, ctx, opcoes = {}) {
  const candidatos = coletarDatas(texto, ctx, opcoes)
    .slice()
    .sort((a, b) => a.inicio - b.inicio || (b.fim - b.inicio) - (a.fim - a.inicio) || (a.tipo === 'dia' ? -1 : 1));
  const out = [];
  for (const c of candidatos) {
    if (out.some((o) => c.inicio < o.fim && o.inicio < c.fim)) continue; // sobrepõe um já aceito
    out.push(c);
  }
  return out;
}

// ─────────────────────────────────────────────────────────────────────────────
// Resolvedor de HORÁRIO
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Procura um horário. Campo é informativo no calendário (decisão §7 nº 11), mas
 * a extração precisa ser boa para não roubar dígitos da data.
 * Devolve { hora:'HH:MM', inicio, fim, trecho, origem } ou null.
 */
function acharHorario(texto, opcoes = {}) {
  const inicio = opcoes.inicio || 0;
  const alvo = texto.slice(inicio);
  const achados = [];
  const add = (m, hora, origem) => {
    if (!hora) return;
    achados.push({ inicio: inicio + m.index, fim: inicio + m.index + m[0].length, trecho: m[0].trim(), hora, origem });
  };
  const hm = (h, min) => (h >= 0 && h <= 23 && min >= 0 && min <= 59 ? `${pad(h)}:${pad(min)}` : null);

  // 14h30 / 14h / 14 h
  for (const m of alvo.matchAll(/\b(\d{1,2})\s*h(?:oras?)?(?:\s*(\d{2}))?\b/g)) {
    add(m, hm(Number(m[1]), Number(m[2] || 0)), 'hhh');
  }
  // 14:30 — exige os dois pontos para não confundir com data
  for (const m of alvo.matchAll(/\b(\d{1,2}):(\d{2})\b/g)) {
    add(m, hm(Number(m[1]), Number(m[2])), 'hh:mm');
  }
  // "às 9", "as 14" (marcador obrigatório)
  for (const m of alvo.matchAll(/\bas\s+(\d{1,2})\b(?![/.:-]\d)/g)) {
    add(m, hm(Number(m[1]), 0), 'as-hh');
  }
  // "2 da tarde", "9 da manhã", "8 da noite"
  for (const m of alvo.matchAll(/\b(\d{1,2})\s*(?:h(?:oras?)?\s*)?da\s+(manha|tarde|noite)\b/g)) {
    let h = Number(m[1]);
    if (m[2] === 'tarde' && h < 12) h += 12;
    if (m[2] === 'noite' && h < 12) h += 12;
    add(m, hm(h, 0), 'periodo-do-dia');
  }
  // "meio-dia" / "meia-noite"
  for (const m of alvo.matchAll(/\bmeio\s*-?\s*dia\b/g)) add(m, '12:00', 'meio-dia');
  for (const m of alvo.matchAll(/\bmeia\s*-?\s*noite\b/g)) add(m, '00:00', 'meia-noite');

  if (!achados.length) return null;
  // A regra MAIS ESPECÍFICA ganha, não a que aparece primeiro. Em "às 2 da
  // tarde", 'as-hh' casa "as 2" (mais à esquerda) e daria 02:00; 'periodo-do-dia'
  // casa "2 da tarde" e dá 14:00 — que é o que a pessoa quis dizer.
  const PRIORIDADE = { 'periodo-do-dia': 0, 'meio-dia': 0, 'meia-noite': 0, hhh: 1, 'hh:mm': 1, 'as-hh': 2 };
  achados.sort((a, b) => (
    (PRIORIDADE[a.origem] ?? 3) - (PRIORIDADE[b.origem] ?? 3)
    || a.inicio - b.inicio
    || (b.fim - b.inicio) - (a.fim - a.inicio)
  ));
  return achados[0];
}


/* ---------- agenda-lexico.js ---------- */
/**
 * ============================================================================
 *  AGENDA INTELIGENTE — o LÉXICO (vocabulário que o parser reconhece)
 * ============================================================================
 * Módulo PURO na montagem (a leitura do D1 fica em agenda.js). O léxico é o
 * "dicionário" do parser e tem três origens, nesta ordem de prioridade:
 *
 *   1. NOMES CANÔNICOS  — calendario_clientes.nome, calendario_opcoes.nome e os
 *                         enums fixos do schema (formato / rede / status).
 *   2. APELIDOS          — calendario_apelidos (migration 0016). É a camada que
 *                         a equipe edita sem deploy: "insta", "storys", "DI".
 *   3. SIMILARIDADE      — não fica no léxico; é calculada em agenda-texto.js
 *                         sobre as listas canônicas quando 1 e 2 falham.
 *
 * O objeto devolvido é 100% serializável em JSON (sem Map/Set) de propósito:
 * assim ele pode ser inspecionado no teste, logado, e — se um dia quisermos
 * interpretar no navegador — enviado ao front sem conversão.
 */



/** Léxico mínimo (base sem migrations ou D1 indisponível): só os enums fixos. */
function lexicoVazio() {
  return montarLexico({ clientes: [], opcoes: [], apelidos: [] });
}

/**
 * Monta o léxico a partir das linhas cruas do D1.
 *
 * @param {object} raw
 *   clientes: [{id, nome, ativo}]
 *   opcoes:   [{id, categoria, nome, ativo, clientes:[cliente_id]}]
 *   apelidos: [{alvo, alvo_id, alvo_valor, apelido}]
 */
function montarLexico(raw) {
  const clientes = (raw && raw.clientes) || [];
  const opcoes = (raw && raw.opcoes) || [];
  const apelidos = (raw && raw.apelidos) || [];

  const formatos = [...FORMATOS];
  const redes = [...REDES];
  const statuses = [...STATUS];

  // Índice de opções por id, para descobrir a categoria de um apelido 'opcao'.
  const opcaoPorId = new Map();
  for (const o of opcoes) opcaoPorId.set(Number(o.id), o);

  // ── Literais: o que o scanner tenta casar palavra a palavra ───────────────
  // Cada entrada é { texto (normalizado), ...alvo }. Itens INATIVOS ficam fora:
  // se a equipe ocultou "Cultura e pessoas" da interface, o parser também não
  // deve oferecê-lo (mas posts antigos seguem apontando para ele — só não é
  // sugerido em comando novo).
  const literais = { cliente: [], formato: [], rede: [], status: [], opcao: [] };

  for (const c of clientes) {
    if (c.ativo === false) continue;
    literais.cliente.push({ texto: normalizar(c.nome), id: Number(c.id), nome: c.nome, origem: 'nome' });
  }
  for (const o of opcoes) {
    if (o.ativo === false) continue;
    if (!CATEGORIA_CAMPO[o.categoria]) continue;
    literais.opcao.push({
      texto: normalizar(o.nome), id: Number(o.id), nome: o.nome, categoria: o.categoria, origem: 'nome',
    });
  }
  for (const v of formatos) literais.formato.push({ texto: normalizar(v), valor: v, nome: v, origem: 'nome' });
  for (const v of redes) literais.rede.push({ texto: normalizar(v), valor: v, nome: v, origem: 'nome' });
  for (const v of statuses) literais.status.push({ texto: normalizar(v), valor: v, nome: v, origem: 'nome' });

  for (const a of apelidos) {
    const texto = normalizar(a.apelido);
    if (!texto) continue;
    if (a.alvo === 'cliente') {
      const c = clientes.find((x) => Number(x.id) === Number(a.alvo_id));
      if (!c || c.ativo === false) continue;
      literais.cliente.push({ texto, id: Number(c.id), nome: c.nome, origem: 'apelido' });
    } else if (a.alvo === 'opcao') {
      const o = opcaoPorId.get(Number(a.alvo_id));
      if (!o || o.ativo === false || !CATEGORIA_CAMPO[o.categoria]) continue;
      literais.opcao.push({ texto, id: Number(o.id), nome: o.nome, categoria: o.categoria, origem: 'apelido' });
    } else if (a.alvo === 'formato' && FORMATOS.has(a.alvo_valor)) {
      literais.formato.push({ texto, valor: a.alvo_valor, nome: a.alvo_valor, origem: 'apelido' });
    } else if (a.alvo === 'rede' && REDES.has(a.alvo_valor)) {
      literais.rede.push({ texto, valor: a.alvo_valor, nome: a.alvo_valor, origem: 'apelido' });
    } else if (a.alvo === 'status' && STATUS.has(a.alvo_valor)) {
      literais.status.push({ texto, valor: a.alvo_valor, nome: a.alvo_valor, origem: 'apelido' });
    }
  }

  // Ordena por tamanho DESC: o scanner precisa tentar "post unico" antes de
  // "post", e "di solucoes" antes de "di". Empate -> nome canônico antes de
  // apelido (mensagem/chip fica mais fiel ao cadastro).
  for (const k of Object.keys(literais)) {
    literais[k].sort((a, b) => (
      b.texto.length - a.texto.length
      || (a.origem === 'nome' ? -1 : 1) - (b.origem === 'nome' ? -1 : 1)
    ));
    // Remove duplicatas exatas de (texto, alvo) que o seed possa ter gerado.
    const vistos = new Set();
    literais[k] = literais[k].filter((e) => {
      const chave = `${e.texto}|${e.id ?? e.valor}`;
      if (vistos.has(chave)) return false;
      vistos.add(chave);
      return true;
    });
  }

  return {
    clientes,
    opcoes,
    // atalhos por categoria, na mesma forma que a API /listas devolve
    pilares: opcoes.filter((o) => o.categoria === 'pilar'),
    publicos: opcoes.filter((o) => o.categoria === 'publico'),
    objetivos: opcoes.filter((o) => o.categoria === 'objetivo'),
    formatos,
    redes,
    statuses,
    literais,
  };
}

/**
 * Opções de uma categoria visíveis para um cliente. Reproduz a regra da
 * migration 0014 (e do `optVisible` do front): opção SEM escopo é global; opção
 * COM escopo só vale para os clientes listados.
 *
 * Isto não é detalhe: é o que reduz a ambiguidade. Resolvido o cliente, o
 * vocabulário de pilar/público encolhe de ~24 para meia dúzia de valores.
 */
function opcoesVisiveis(lexico, categoria, clienteId) {
  return (lexico.opcoes || []).filter((o) => {
    if (o.categoria !== categoria) return false;
    if (o.ativo === false) return false;
    const escopo = o.clientes || [];
    if (!escopo.length) return true;
    return clienteId != null && escopo.map(Number).includes(Number(clienteId));
  });
}

/** Literais de opção filtrados pelo cliente resolvido (mesma regra acima). */
function literaisOpcaoVisiveis(lexico, clienteId) {
  const permitidos = new Set();
  for (const cat of Object.keys(CATEGORIA_CAMPO)) {
    for (const o of opcoesVisiveis(lexico, cat, clienteId)) permitidos.add(Number(o.id));
  }
  return (lexico.literais.opcao || []).filter((e) => permitidos.has(Number(e.id)));
}


/* ---------- agenda-parser.js ---------- */
/**
 * ============================================================================
 *  AGENDA INTELIGENTE — o PARSER (comando em português -> PLANO)
 * ============================================================================
 * Módulo PURO: recebe texto + léxico + contexto e devolve um PLANO. Não fala com
 * o D1, não escreve nada, não tem efeito colateral. É isso que permite
 * `npm run test:agenda` rodar o corpus inteiro em node, sem wrangler.
 *
 * ► NUNCA EXECUTA. O parser só descreve o que faria. Aplicar é outra etapa
 *   (fase 1+), sempre depois de confirmação do usuário. Ver
 *   docs/calendario-editorial/agenda-inteligente.md.
 *
 * PIPELINE (a ordem é o coração do algoritmo — matchers específicos primeiro,
 * cada um CONSOME o trecho que reconheceu, e o resíduo final vira título):
 *
 *   1. intenção        verbo do comando (criar/remover/mover/alterar/status/consultar)
 *   2. datas e horas   agenda-datas.js (marcador obrigatório p/ número solto)
 *   3. enums           formato, rede(s), status, impulsionar
 *   4. cliente         nome canônico ou apelido
 *   5. opções          pilar / público / objetivo — âncora ("pilar de X") primeiro
 *   6. conteúdo        link/referência/briefing
 *   7. título          marcador explícito ("sob título X", "X" entre aspas) ou resíduo
 *   8. plano           faltando + ambiguidades + confiança + efeitos (dry-run)
 *
 * FILOSOFIA: em caso de dúvida, PERGUNTA. Um chip amarelo pedindo confirmação é
 * infinitamente melhor que apagar o post errado.
 */


// ─────────────────────────────────────────────────────────────────────────────
// Intenções
// ─────────────────────────────────────────────────────────────────────────────

/**
 * A ORDEM IMPORTA e já resolveu um caso real: "Troque a data do post X para
 * 18/06" casa com 'alterar' (troque) E com 'mover' (troque a data). 'mover' vem
 * primeiro, então ganha — que é a leitura certa.
 *
 * ★ PEGADINHA nº 1 — ORTOGRAFIA DO IMPERATIVO. Em português, verbo em -CAR virra
 * -QUE no imperativo/subjuntivo: "troque", "marque", "busque", "coloque",
 * "apague" (-gar → -gue), "corrija" (-gir → -ja), "transfira" (-rir → -ira).
 * Ou seja: `troc\w*` NÃO casa com "troque" — e "Troque a data…" é exatamente a
 * forma que a pessoa digita. Este bug passou pela revisão e só foi pego pelo
 * corpus. Toda vez que adicionar um verbo em -car/-gar/-gir aqui, adicione a
 * forma com -qu/-gu/-j junto.
 *
 * ★ PEGADINHA nº 2 — RADICAIS GULOSOS. `adi\w*` parecia inofensivo para "adiar" e
 * engolia "adicione" (virava 'mover' em vez de 'criar'); `cri\w*` pega
 * "critério", `alter\w*` pega "alternativa" e `edit\w*` pega "editorial". Por
 * isso os verbos ambíguos são listados com sufixos explícitos.
 *
 * ★ PEGADINHA nº 3 — O QUE O REGEX CONSOME É DESCARTADO. Padrões que atravessam o
 * título ("marque o post <TÍTULO> como") apagavam o título junto. Use lookahead
 * ((?=…)) para exigir o contexto sem consumi-lo.
 */
const INTENCOES = [
  // Consome só o verbo; exige "como …" adiante sem engolir o título no meio.
  //
  // ★ PEGADINHA nº 5 — A JANELA DO "como" TEM DE CABER UM TÍTULO REAL. Este
  // lookahead já nasceu com um teto de 60 caracteres, e 60 é menos que o título
  // de um post de verdade: "Marque o post <Métodos de priorização que times de
  // alta performance usam> da Beemore como publicado" (título de 57 caracteres,
  // do calendário real da Beemore) empurrava o "como" para fora da janela, nenhuma
  // outra regra casava "marque", e o comando virava `desconhecida` — sem pista do
  // motivo para quem digitou. O teto agora é 200, que é o tamanho MÁXIMO de um
  // `assunto` (MAX_TXT em posts.js): a janela cobre qualquer título que caiba no
  // banco, então este modo de falha não volta.
  //
  // ★ E o teto sozinho não bastaria. Alargar a janela abriria a porta para o
  // caminho inverso — um CRIAR virar status por causa de um "como" que mora no
  // TÍTULO ("…dia 15 sobre Como usar o Uniplus"). Daí o ponto TEMPERADO
  // `(?:(?!\bsobre\b).)`: o lookahead não atravessa o marcador de título. É o
  // mesmo princípio da pegadinha nº 12 (verbo depois do marcador é assunto, não
  // comando), aplicado agora ao complemento do verbo. As duas direções têm caso
  // no corpus — não mexa numa sem olhar a outra.
  { intencao: 'status', re: /\b(?:marqu\w*|marc\w*|mud\w*|alter(?:e|ar|a|ou)|coloqu\w*|coloc\w*|pass\w*|deix\w*)\s+(?=(?:(?!\bsobre\b).){0,200}?\bcomo\b)/ },
  { intencao: 'status', re: /\b(?:mud\w*|alter(?:e|ar|a|ou)|troqu\w*|troc\w*)\s+o?\s*status\b/ },
  { intencao: 'status', re: /\b(?:despubliqu\w*|despublic\w*|republiqu\w*|republic\w*)\b/ },
  { intencao: 'mover',  re: /\b(?:mov\w*|adi(?:e|ar|a|ou|ado|ada)|antecip\w*|remarqu\w*|remarc\w*|reagend\w*|transfir\w*|transfer\w*)\b/ },
  { intencao: 'mover',  re: /\b(?:troqu\w*|troc\w*|mud\w*|alter(?:e|ar|a|ou)|ajust\w*|corrij\w*|corrig\w*|passa\w*)\s+(?:a\s+|o\s+)?(?:data|dia)\b/ },
  { intencao: 'remover', re: /\b(?:remov\w*|exclu\w*|apagu\w*|apag\w*|delet\w*|cancel\w*|tir(?:e|ar|a|ou)|retir\w*|derrub\w*)\b/ },
  { intencao: 'criar',  re: /\b(?:inclu\w*|adicion\w*|cri(?:e|ar|a|ei|ou|em)|agend\w*|program\w*|lanc\w*|cadastr\w*|marqu\w*\s+um\s+post)\b/ },
  // "Novo reels dia 15" — sem verbo, mas inequívoco. Lookahead no substantivo:
  // exige que ele exista (não confunde com "os posts novos", que é consulta) e
  // não o consome (senão "reels" não chegaria ao léxico de formato).
  { intencao: 'criar', re: /\bnov[oa]s?\s+(?=post|posts|publicacao|reels|reel|carrossel|story|stories|storys|video|feed)/ },
  { intencao: 'consultar', re: /\b(?:most\w*|list\w*|exib\w*|busqu\w*|busc\w*|procur\w*|filtr\w*|quais|quantos?|quantas?|tem\s+algum|o\s+que\s+tem|ver)\b/ },
  { intencao: 'alterar', re: /\b(?:alter(?:e|ar|a|ou)|edit(?:e|ar|a|ou)|mud\w*|troqu\w*|troc\w*|ajust\w*|renome\w*|corrij\w*|corrig\w*|atualiz\w*|defin\w*|coloqu\w*|coloc\w*)\b/ },
];

/** Campos obrigatórios por intenção (o que impede o plano de ser aplicável). */
const OBRIGATORIOS = {
  criar: ['cliente', 'data_publicacao', 'assunto', 'formato'],
  mover: ['alvo', 'data_publicacao'],
  remover: ['alvo'],
  status: ['alvo', 'status'],
  // `mudanca` é pseudo-campo, como `alvo`: não é um chip, é "existe pelo menos
  // uma alteração a fazer?". Um alterar sem valor novo não é aplicável.
  alterar: ['alvo', 'mudanca'],
  consultar: [],
  desconhecida: [],
};

// ─────────────────────────────────────────────────────────────────────────────
// ALTERAR — o "para" separa (fase 4.2)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * ★ A DECISÃO CENTRAL DA FASE 4.2 (escolha do usuário, 2026-08-18).
 *
 * Em `alterar`, **tudo antes do "para" acha o post; tudo depois é o valor novo** —
 * a mesma regra que `mover` já usava para a data ("…para 18/06").
 *
 * O problema que ela resolve: o plano tem UMA GAVETA POR CAMPO. Em "Altere o
 * carrossel de Natal para Reels" existem dois formatos — *Carrossel* diz qual post,
 * *Reels* diz no que ele vira —, os dois disputavam `campos.formato`, o primeiro
 * ganhava, e o segundo caía na âncora fraca `para X` (que é de Público). Daí a
 * oferta absurda de cadastrar "Reels" como público. `criar` só precisa saber *o que
 * o post é*; `alterar` é a primeira intenção em que quase todo campo pode aparecer
 * duas vezes com sentidos OPOSTOS.
 *
 * Implementação: achado o separador, a região do sufixo é **consumida de uma vez**
 * (`_mudanca`). Assim TODOS os matchers existentes só veem o prefixo e continuam
 * valendo sem alteração — o resíduo vira `alvo_titulo` do post certo, e não do
 * título novo. O sufixo é resolvido depois, por `resolverMudanca`.
 */

/**
 * Menção que NOMEIA o campo a alterar ("o pilar **do** post…"). O `do/da` é a
 * assinatura: sem ele, "com pilar de educação" é âncora de VALOR (o que `criar`
 * usa), coisa diferente. É consumida — se não fosse, a âncora de pilar resolveria
 * "post" como nome de pilar, que era exatamente o bug relatado.
 *
 * `_data_original` vem primeiro porque é o mais específico ("a data original do" é
 * prefixo de "a data do"). ★ Ele está APOSENTADO (2026-08-26) e leva `_` como o
 * `_cliente`: continua sendo RECONHECIDO — para a menção não cair numa âncora e o
 * comando acabar alterando outro campo — mas não é escrevível, e a recusa sai com
 * motivo. Ver o passo 1.2 e o §9.1 do doc.
 *
 * ★ Atenção ao que este passo NÃO alcança: quem decide a intenção é o passo 1, e
 * "a data … para X" casa `mover` antes de esta lista ser consultada. Então "Altere
 * a data original do post X para 03/08" chega aqui já como `mover`, e é o AVISO do
 * passo 1.2 que impede a pessoa de achar que alterou a outra data.
 */
const CAMPOS_MENCIONADOS = [
  { campo: '_data_original', re: /\b(?:a\s+)?data\s+original\s+d[oa]s?\b/ },
  { campo: 'assunto', re: /\b(?:o\s+)?(?:titulo|assunto|tema)\s+d[oa]s?\b/ },
  { campo: 'formato', re: /\b(?:o\s+)?formato\s+d[oa]s?\b/ },
  { campo: 'pilar', re: /\b(?:o\s+)?pilar(?:\s+de\s+conteudo)?\s+d[oa]s?\b/ },
  { campo: 'publico', re: /\b(?:o\s+)?publico\s+d[oa]s?\b/ },
  { campo: 'objetivo', re: /\b(?:o\s+)?objetivo\s+d[oa]s?\b/ },
  { campo: 'status', re: /\b(?:o\s+)?status\s+d[oa]s?\b/ },
  { campo: 'horario', re: /\b(?:[oa]\s+)?(?:horario|hora)\s+d[oa]s?\b/ },
  { campo: 'conteudo', re: /\b(?:[oa]\s+)?(?:conteudo|observacoes|observacao|obs|referencia|briefing)\s+d[oa]s?\b/ },
  { campo: 'redes', re: /\b(?:as\s+)?redes?(?:\s+sociais?)?\s+d[oa]s?\b/ },
  { campo: 'impulsionar', re: /\b(?:o\s+)?impulsionamento\s+d[oa]s?\b/ },
  // Trocar o post de MARCA não é alterar campo: o cliente é o critério de busca, e
  // mexer nele pelo mesmo comando seria ambíguo por construção. Recusa com aviso.
  { campo: '_cliente', re: /\b(?:o\s+)?(?:cliente|marca)\s+d[oa]s?\b/ },
];

/** Campos que `alterar` pode escrever (o `_cliente` de propósito não está aqui). */
const CAMPOS_ALTERAVEIS = new Set([
  'assunto', 'formato', 'status', 'redes', 'horario', 'conteudo',
  'pilar', 'publico', 'objetivo', 'impulsionar', 'data_publicacao',
]);

/**
 * Em que fase do roteiro cada intenção passa a ser APLICÁVEL de verdade.
 *
 * `alterar` era fase 3 no roteiro original e saiu dela por um motivo concreto,
 * achado ao implementar mover/status: nesta intenção o MESMO campo serve de
 * critério de busca e de valor novo ("altere o formato do post X para Reels" —
 * `formato` acha o post e é o novo formato), e o parser não tem como distinguir
 * os dois sem interpretação semântica. Exemplo real do que acontece hoje:
 * "Altere o pilar do post Natal da P21 para Educação" lê pilar="post" e
 * público="Educação". Aplicar isso escreveria besteira em cima de dado que já
 * vale. Vai com a fase 4, que é quando existe log de comandos para desfazer.
 */
const FASE_APLICACAO = { criar: 2, mover: 3, status: 3, alterar: 4, remover: 4, consultar: 1, desconhecida: null };

/**
 * Traduz o bloco `mudancas` no corpo do PATCH que `updatePost` espera.
 * Só os campos citados entram — é PATCH parcial, não substituição do post.
 */
function corpoDaAlteracao(mudancas) {
  const COLUNA = {
    pilar: 'pilar_id', publico: 'publico_id', objetivo: 'objetivo_id',
  };
  const body = {};
  for (const [campo, dados] of Object.entries(mudancas || {})) {
    body[COLUNA[campo] || campo] = dados.valor;
  }
  return body;
}

// ─────────────────────────────────────────────────────────────────────────────
// Auxiliares de texto/índices
// ─────────────────────────────────────────────────────────────────────────────

/** O caractere em `pos` do texto normalizado é letra/número? (checa borda) */
function ehAlfaNum(c) { return c !== undefined && /[\p{L}\p{N}]/u.test(c); }

function bordaOk(norm, i, j) {
  return !ehAlfaNum(norm[i - 1]) && !ehAlfaNum(norm[j]);
}

/** Recorta o trecho ORIGINAL (com acento e caixa) que gerou norm[i..j). */
function trechoOriginal(original, mapa, i, j) {
  if (!mapa.length || i >= j) return '';
  const a = mapa[Math.max(0, Math.min(i, mapa.length - 1))];
  const b = mapa[Math.max(0, Math.min(j - 1, mapa.length - 1))];
  return original.slice(a, b + 1).trim();
}

/**
 * Varre o texto procurando literais do léxico (nomes canônicos e apelidos, já
 * ordenados do mais longo para o mais curto — é isso que faz "post único"
 * ganhar de "post" e "DI Soluções" ganhar de "DI").
 *
 * `consumir: false` devolve TODOS os candidatos sem marcar nada — usado quando a
 * escolha não pode ser "o primeiro que aparecer" e precisa de desempate por
 * âncora (ver escolherComAncora).
 *
 * Plural: um "s" final é aceito como parte do match ("não publicados" casa com
 * o status "Não publicado"). Sem isso, metade dos comandos naturais em português
 * escapava do léxico.
 */
function scanLiterais(norm, spans, entradas, campo, { multi = false, consumir = true } = {}) {
  const achados = [];
  for (const e of entradas) {
    if (!e.texto) continue;
    let from = 0;
    for (;;) {
      const i = norm.indexOf(e.texto, from);
      if (i < 0) break;
      let j = i + e.texto.length;
      from = i + 1;
      if (norm[j] === 's' && !ehAlfaNum(norm[j + 1])) j += 1; // tolera plural
      if (!bordaOk(norm, i, j)) continue;
      if (spans.ocupado(i, j)) continue;
      if (consumir) spans.consumir(i, j, campo);
      achados.push({ entrada: e, inicio: i, fim: j });
      if (!multi && consumir) return achados;
      break; // um match por literal; a deduplicação por alvo vem depois
    }
  }
  return achados;
}

/**
 * Escolhe UM candidato entre vários, preferindo o que vem depois de uma âncora.
 *
 * Existe por dois erros reais que o corpus pegou:
 *   - "Agende um storys da KSC ... sobre Uniplus Web" escolhia Uniplus como
 *     cliente (literal mais longo) em vez de KSC (o que vem depois de "da");
 *   - "Marque o post Módulo de produção como no ar" lia o status "Em produção"
 *     do TÍTULO em vez do "no ar" que vem depois de "como".
 *
 * Regra: candidato ancorado ganha de não-ancorado; entre iguais, o mais à
 * esquerda; entre esses, o literal mais longo.
 */
function escolherComAncora(norm, candidatos, ancoraRe, { exigirAncora = false } = {}) {
  if (!candidatos.length) return null;
  const pontuado = candidatos.map((c) => {
    const antes = norm.slice(Math.max(0, c.inicio - 24), c.inicio);
    return { c, ancorado: ancoraRe.test(antes) ? 1 : 0 };
  }).filter((p) => !exigirAncora || p.ancorado);
  if (!pontuado.length) return null;
  pontuado.sort((a, b) => (
    b.ancorado - a.ancorado
    || a.c.inicio - b.c.inicio
    || (b.c.fim - b.c.inicio) - (a.c.fim - a.c.inicio)
  ));
  return pontuado[0].c;
}

/**
 * Palavras de cortesia/enrolação que não carregam informação. Consumidas de
 * propósito: o campo `resto` do plano é a matéria-prima da telemetria ("o que o
 * parser não entendeu?"), e ele só é útil se não estiver poluído com "por favor".
 */
const RUIDO = /\b(?:por\s+favor|pfv?|quero|queria|gostaria(?:\s+de)?|preciso|precisava|pode|poderia|consegue|favor|vamos|bora|ai|entao|ta|ok|obrigad[oa]|blz|beleza|pra\s+mim|me\s+ajuda)\b/g;

/**
 * Aplica um regex e consome o trecho casado. Devolve o match ou null.
 * `maxInicio` (opcional) descarta casamentos que comecem depois daquela posição —
 * usado pela intenção, para um verbo dentro do título não valer como comando.
 */
function casarEConsumir(norm, spans, re, campo, { maxInicio = Infinity } = {}) {
  const rx = new RegExp(re.source, re.flags.includes('g') ? re.flags : `${re.flags}g`);
  for (const m of norm.matchAll(rx)) {
    const i = m.index;
    const j = i + m[0].length;
    if (i > maxInicio) continue;
    if (spans.ocupado(i, j)) continue;
    spans.consumir(i, j, campo);
    return m;
  }
  return null;
}

/** Confiança padrão por origem do casamento. */
const CONF = { nome: 1, apelido: 0.95, data: 1, dataInferida: 0.9, regra: 1, residuo: 0.5 };

/** Quantos tokens depois de uma âncora podem compor o valor de uma opção. */
const MAX_TOKENS_ANCORA = 6;

/**
 * Palavras que INICIAM outra cláusula e portanto encerram o valor de uma âncora.
 * Sem esta lista, "com pilar de educação sobre Treinamento" tentava resolver
 * "educacao sobre" como nome de pilar (empate de score com "educacao", e o
 * desempate por comprimento escolhia o errado).
 * Note que "de" e "e" NÃO entram: "Donos de Padaria" e "Cultura e Pessoas" são
 * nomes reais de opções.
 */
const STOP_ANCORA = new Set([
  'sobre', 'com', 'sem', 'titulo', 'assunto', 'tema', 'intitulado', 'chamado',
  'referencia', 'referencias', 'ref', 'link', 'material', 'briefing', 'obs',
  'observacao', 'observacoes', 'publicacao', 'publicar', 'impulsionar',
  'patrocinado', 'dia', 'data', 'objetivo', 'pilar', 'publico', 'persona',
  'formato', 'status', 'falando', 'rede', 'redes',
  // 'para' encerra o valor: em "pilar de educação para Rodrigo", o pilar é
  // "educação" e o "para Rodrigo" é o público. Sem isto o pilar consumia o
  // "para" e o público nunca era perguntado.
  'para', 'pra', 'pro',
]);

/**
 * Enchimento gramatical que, SOZINHO, não é título de post. "Mostre tudo",
 * "quais posts ESTÃO em produção", "quantos TEM na semana que vem" — o resíduo
 * dessas frases é gramática da pergunta, não nome de conteúdo. Sem esta lista, a
 * consulta virava uma busca por título "tudo"/"estão" e a grade voltava vazia.
 *
 * Só rejeita quando TODOS os tokens do resíduo são enchimento: "Tudo sobre o
 * Uniplus" segue título, porque "uniplus" carrega conteúdo. É justamente por
 * isso que estas palavras NÃO entram em RUIDO — lá seriam consumidas antes das
 * datas (passo 2) e arrancariam pedaço de título legítimo.
 */
const PALAVRAS_VAZIAS = new Set([
  'tudo', 'todos', 'todas', 'todo', 'toda',
  'estao', 'esta', 'estava', 'estavam', 'sao', 'ser',
  'tem', 'tinha', 'ha', 'havia', 'existe', 'existem',
  'algum', 'alguma', 'alguns', 'algumas', 'algo', 'nada',
  'post', 'posts', 'publicacoes', 'conteudo', 'conteudos',
  'que', 'quais', 'qual', 'quantos', 'quantas',
]);

/**
 * O trecho é só gramática/enchimento — logo, não é informação?
 * Usado em dois lugares que precisam da MESMA régua: descartar resíduo que não
 * merece virar título e limpar o `resto` (matéria-prima da telemetria).
 */
function soEnchimento(s) {
  const tokens = String(s).split(' ').filter(Boolean);
  if (!tokens.length) return true;
  return tokens.every((t) => (
    PALAVRAS_VAZIAS.has(t) || CONECTORES.has(t) || STOP_ANCORA.has(t) || /^[.:/-]+$/.test(t)
  ));
}

/**
 * Resolve o valor que vem DEPOIS de uma âncora ("pilar de …", "para …").
 *
 * O truque é o PREFIXO PROGRESSIVO: em vez de chutar onde o valor termina, testa
 * 1, 2, 3… tokens e fica com o que casa melhor no léxico. Foi o que consertou
 * "com pilar Dicas sobre Como organizar a fila" — antes o valor engolia a frase
 * inteira ("dicas sobre como organizar a fila") e não casava com nada, então o
 * pilar "Dicas" virava uma falsa oferta de cadastro.
 *
 * Devolve `{ decisao, escolhido, candidatos, inicio, fim }` ou null.
 */
function resolverAncorado(norm, spans, inicio, visiveis) {
  // Tokens livres a partir da âncora, parando em pontuação ou span consumido.
  const tokens = [];
  let i = inicio;
  while (i < norm.length && tokens.length < MAX_TOKENS_ANCORA) {
    while (i < norm.length && norm[i] === ' ') i++;
    if (i >= norm.length || spans.ocupado(i, i + 1) || /[.;,]/.test(norm[i])) break;
    let j = i;
    while (j < norm.length && norm[j] !== ' ' && !/[.;,]/.test(norm[j]) && !spans.ocupado(j, j + 1)) j++;
    if (j === i) break;
    const texto = norm.slice(i, j);
    if (tokens.length && STOP_ANCORA.has(texto)) break; // começou outra cláusula
    tokens.push({ inicio: i, fim: j, texto });
    i = j;
  }
  if (!tokens.length) return null;

  let melhor = null;
  for (let n = 1; n <= tokens.length; n++) {
    const usados = tokens.slice(0, n);
    const consulta = limparBordas(usados.map((t) => t.texto).join(' '));
    if (!consulta) continue;
    const r = ranquear(consulta, visiveis);
    const score = r.candidatos.length ? r.candidatos[0].score : 0;
    // Empate favorece o valor MAIS LONGO ("Donos de Padaria" > "Donos").
    if (!melhor || score > melhor.score + 0.001) {
      melhor = { ...r, score, inicio: usados[0].inicio, fim: usados[n - 1].fim, n };
    } else if (Math.abs(score - melhor.score) <= 0.001 && r.decisao !== 'nenhum') {
      melhor = { ...r, score, inicio: usados[0].inicio, fim: usados[n - 1].fim, n };
    }
  }
  if (!melhor) return null;
  // Nada casou: o valor é o primeiro token (é o que a UI vai oferecer cadastrar).
  if (melhor.decisao === 'nenhum') {
    return { decisao: 'nenhum', escolhido: null, candidatos: [], inicio: tokens[0].inicio, fim: tokens[0].fim };
  }
  return melhor;
}

/**
 * Posição do "para" que SEPARA critério de valor novo, ou -1.
 *
 * Regra: o ÚLTIMO "para" que não está dentro de um span já consumido. Os spans
 * consumidos até aqui incluem as aspas do passo 0 — é isso que faz
 * `Altere o pilar do post "Dicas para Donos de Padaria" para Educação` dividir no
 * lugar certo. Sem aspas, num título que contenha "para", a divisão erra: é a
 * limitação declarada da decisão (§8.5 do doc), e as aspas são a saída.
 */
function posicaoSeparador(norm, spans) {
  let achado = -1;
  for (const m of norm.matchAll(/\bp(?:ara|ra|ro)\b/g)) {
    if (spans.ocupado(m.index, m.index + m[0].length)) continue;
    achado = m.index;
  }
  return achado;
}

/**
 * Resolve o SUFIXO (o que vem depois do "para") no valor novo de um campo.
 *
 * `campoDito` é o campo nomeado na menção ("o pilar do…"), ou null. Quando ele
 * existe, manda — é ele que desambigua "Educação", que é nome de pilar E de
 * objetivo. Quando não existe, o valor tem de se identificar sozinho pelo TIPO
 * ("Reels" é formato, "Publicado" é status, "18/06" é data), na ordem abaixo.
 *
 * Devolve `{ campo, dados }`, `{ ambiguidade }` ou null.
 */
function resolverMudanca(sufixoOriginal, campoDito, lex, contexto, clienteId) {
  const { texto: norm, mapa } = normalizarPreservandoIndices(sufixoOriginal);
  if (!norm) return null;
  const spans = new Spans(norm.length);
  const bruto = () => trechoOriginal(sufixoOriginal, mapa, 0, norm.length).replace(/^[,;.\s]+|[,;.\s]+$/g, '');

  const chipDe = (valor, rotulo, origem, confianca) => ({
    valor, rotulo, trecho: bruto(), origem, confianca,
  });

  // ── Texto livre: o valor É o sufixo, sem interpretação nenhuma ─────────────
  if (campoDito === 'assunto' || campoDito === 'conteudo') {
    const v = bruto();
    return v.length >= 2 ? { campo: campoDito, dados: chipDe(v, v, 'texto livre', 0.95) } : null;
  }

  // ── Enums e datas: cada um sabe se casa ───────────────────────────────────
  const tentativas = {
    data_publicacao: () => {
      const d = acharDatas(norm, contexto).find((x) => x.tipo === 'dia');
      return d ? chipDe(d.data, d.data, d.origem, CONF.data) : null;
    },
    horario: () => {
      const h = acharHorario(norm);
      return h ? chipDe(h.hora, h.hora, h.origem, CONF.regra) : null;
    },
    formato: () => {
      const f = scanLiterais(norm, spans, lex.literais.formato, 'formato');
      return f.length ? chipDe(f[0].entrada.valor, f[0].entrada.valor, f[0].entrada.origem, CONF[f[0].entrada.origem] || 1) : null;
    },
    status: () => {
      const s = scanLiterais(norm, spans, lex.literais.status, 'status');
      return s.length ? chipDe(s[0].entrada.valor, s[0].entrada.valor, s[0].entrada.origem, CONF[s[0].entrada.origem] || 1) : null;
    },
    redes: () => {
      const r = scanLiterais(norm, spans, lex.literais.rede, 'redes', { multi: true });
      if (!r.length) return null;
      const valores = [];
      for (const x of r) if (!valores.includes(x.entrada.valor)) valores.push(x.entrada.valor);
      return chipDe(valores, valores.join(' + '), 'lexico', 1);
    },
    impulsionar: () => {
      if (/\b(?:nao|sem)\b/.test(norm)) return chipDe(false, 'Não impulsionar', 'regra', CONF.regra);
      if (/\b(?:impulsion\w*|patrocin\w*|midia\s+paga|sim)\b/.test(norm)) return chipDe(true, 'Impulsionar', 'regra', CONF.regra);
      return null;
    },
  };

  // ── Listas gerenciáveis: ranqueia contra o vocabulário VISÍVEL do cliente ──
  const porOpcao = (categoria) => {
    const r = ranquear(limparBordas(norm), opcoesVisiveis(lex, categoria, clienteId));
    if (r.decisao === 'auto') {
      return { campo: categoria, dados: chipDe(Number(r.escolhido.item.id), r.escolhido.item.nome,
        r.escolhido.score >= 0.999 ? 'nome' : 'similaridade', r.escolhido.score) };
    }
    if (r.decisao === 'perguntar') {
      return {
        ambiguidade: {
          campo: categoria, trecho: bruto(), acao: 'escolher', destino: 'mudanca',
          opcoes: r.candidatos.map((c) => ({ id: Number(c.item.id), nome: c.item.nome, score: Number(c.score.toFixed(3)) })),
        },
      };
    }
    return null;
  };

  if (campoDito) {
    if (CATEGORIA_CAMPO[campoDito]) {
      const r = porOpcao(campoDito);
      // Valor que não existe na lista: oferece cadastrar, como em `criar`.
      return r || { ambiguidade: { campo: campoDito, trecho: bruto(), acao: 'criar', destino: 'mudanca', opcoes: [] } };
    }
    const dados = tentativas[campoDito] ? tentativas[campoDito]() : null;
    return dados ? { campo: campoDito, dados } : null;
  }

  // Sem campo nomeado: quem se identifica primeiro ganha. Ordem do mais
  // inequívoco (uma data é uma data) para o mais genérico.
  for (const campo of ['data_publicacao', 'horario', 'formato', 'status', 'redes']) {
    const dados = tentativas[campo]();
    if (dados) return { campo, dados };
  }
  for (const cat of Object.keys(CATEGORIA_CAMPO)) {
    const r = porOpcao(cat);
    if (r && r.campo) return r; // só resolve sozinho; ambiguidade aqui seria chute
  }
  return null;
}

/**
 * O trecho parece um nome próprio (começa com maiúscula e não é sigla solta)?
 * Usado para decidir se um "para X" solto merece virar oferta de novo público.
 */
function pareceNomeProprio(trecho) {
  const t = String(trecho || '').trim();
  if (t.length < 3) return false;
  return /^[A-ZÀ-Ý]/.test(t);
}

// ─────────────────────────────────────────────────────────────────────────────
// Parser
// ─────────────────────────────────────────────────────────────────────────────

/**
 * @param {string} textoOriginal  o que a pessoa digitou
 * @param {object} lexico         de montarLexico() — agenda-lexico.js
 * @param {object} contexto       { hoje:'YYYY-MM-DD', mes:'YYYY-MM', cliente_id? }
 *                                `cliente_id` = cliente selecionado no filtro da
 *                                tela; usado como padrão quando o comando não
 *                                nomeia a marca.
 * @returns {object} PLANO — contrato em docs/calendario-editorial/agenda-inteligente.md
 */
function interpretar(textoOriginal, lexico, contexto = {}) {
  const lex = lexico && lexico.literais ? lexico : lexicoVazio();
  const original = String(textoOriginal == null ? '' : textoOriginal);
  const { texto: norm, mapa } = normalizarPreservandoIndices(original);
  const ctx = normalizarContexto(contexto);
  const spans = new Spans(norm.length);

  const campos = {};        // campo -> { valor, rotulo, trecho, origem, confianca }
  const ambiguidades = [];  // [{ campo, trecho, opcoes:[{id,nome,score}], acao }]
  const avisos = [];

  const registrar = (campo, dados) => { campos[campo] = dados; };
  const chip = (campo, valor, rotulo, i, j, origem, confianca, extra) => {
    registrar(campo, {
      valor,
      rotulo,
      trecho: trechoOriginal(original, mapa, i, j),
      origem,
      confianca,
      ...(extra || {}),
    });
  };

  if (!norm) {
    return montarPlano({ original, norm, intencao: 'desconhecida', campos, mudancas: {}, ambiguidades, avisos: ['Comando vazio.'], spans, lex, ctx });
  }

  // ── 0. TEXTO ENTRE ASPAS É INTOCÁVEL ──────────────────────────────────────
  // Quem escreveu "Dia 15 é o prazo final" quis um TÍTULO, não uma data. Isto
  // roda antes de qualquer matcher justamente para blindar o trecho: sem isso, o
  // "Dia 15" de dentro das aspas virava Data Original.
  const protegido = acharAspas(original, norm, mapa);
  if (protegido) spans.consumir(protegido.inicio, protegido.fim, '_protegido');

  // ── 1. INTENÇÃO ───────────────────────────────────────────────────────────
  // ★ PEGADINHA nº 4 — VERBO DENTRO DO TÍTULO NÃO É COMANDO. "Inclua um carrossel
  // da Sophos dia 12 sobre Teste de Mover na Tela" casava `mov\w*` no TÍTULO e,
  // como 'mover' vem antes de 'criar' na lista, a criação virava mudança de data.
  // Enquanto mover era dry-run isso era um chip feio; com a fase 3 aplicando, o
  // comando passaria a mexer num post existente. Comando em português é
  // imperativo e o verbo vem ANTES do marcador de título — depois dele é assunto.
  // Mesmo espírito do nº 11 (nome de mês depois do marcador é título).
  const marcadorTitulo = posicaoMarcadorTitulo(norm);
  const limiteVerbo = marcadorTitulo >= 0 ? marcadorTitulo : Infinity;
  let intencao = 'desconhecida';
  for (const cand of INTENCOES) {
    const m = casarEConsumir(norm, spans, cand.re, '_intencao', { maxInicio: limiteVerbo });
    if (m) { intencao = cand.intencao; break; }
  }

  // ── 1.2. CAMPO APOSENTADO: "data original" ────────────────────────────────
  // O campo `data_original` foi aposentado pelo usuário em 2026-08-26 (números no
  // §9.1 do doc: 76% dos posts a tinham IGUAL à data de publicação, e nada no
  // sistema a consumia). Saiu do formulário e a Agenda não a escreve mais.
  //
  // ★ Mas a FRASE continua sendo reconhecida, para AVISAR. Sem o aviso, "Altere a
  // data original do post X para 03/08" segue sendo lido como `mover` — a intenção
  // é decidida no passo 1, e "a data … para X" casa `mover` **antes** de a menção
  // de campo (passo 1.6) ser sequer consultada. Ou seja: este comando sempre mexeu
  // na data de PUBLICAÇÃO, e continua mexendo. Corrigir isso pela lista de
  // intenções é reabrir a pegadinha nº 12; o que torna o caso seguro é a pessoa
  // LER em que campo a data está caindo, e é o que o aviso diz.
  //
  // Não consome span: consumir mudaria o que os matchers seguintes veem, e o
  // objetivo aqui é só falar.
  if (/\bdata\s+original\b/.test(norm)) {
    avisos.push('O campo “Data original” foi aposentado — ele não é mais preenchido'
      + ' nem alterado pela Agenda. Se você quis mudar quando o post vai ao ar, é a'
      + ' data de publicação; confira no chip qual data foi entendida.');
  }

  // ── 1.5. RUÍDO ────────────────────────────────────────────────────────────
  for (const m of norm.matchAll(RUIDO)) {
    if (!spans.ocupado(m.index, m.index + m[0].length)) spans.consumir(m.index, m.index + m[0].length, '_ruido');
  }

  // ── 1.6. ALTERAR: o "para" separa critério de valor novo (fase 4.2) ───────
  // Roda AQUI, antes de qualquer matcher de campo, por duas razões:
  //   1. a menção "o pilar do" tem de ser consumida antes da âncora de pilar do
  //      passo 9 — senão ela resolve "post" como nome de pilar (o bug relatado);
  //   2. consumindo a região do SUFIXO de uma vez, todos os matchers seguintes só
  //      veem o prefixo e continuam valendo sem mudança nenhuma. É o que faz o
  //      resíduo virar o título do post PROCURADO, e não o título novo.
  const mudancas = {};
  let sufixoTexto = '';
  let campoDito = null;
  if (intencao === 'alterar') {
    for (const m of CAMPOS_MENCIONADOS) {
      const achou = casarEConsumir(norm, spans, m.re, '_campo_dito');
      if (achou) { campoDito = m.campo; break; }
    }
    const sep = posicaoSeparador(norm, spans);
    if (sep >= 0) {
      const mSep = /^p(?:ara|ra|ro)\b/.exec(norm.slice(sep));
      const fimSep = sep + (mSep ? mSep[0].length : 4);
      spans.consumir(sep, norm.length, '_mudanca');
      sufixoTexto = trechoOriginal(original, mapa, fimSep, norm.length);
    }
  }

  // ── 2. DATAS ──────────────────────────────────────────────────────────────
  // "para" antes da data marca o DESTINO — é o que separa origem de destino em
  // "mova o post de 10/06 para 18/06".
  const datas = acharDatas(norm, contexto).filter((d) => !spans.ocupado(d.inicio, d.fim));
  const temParaAntes = (d) => /\b(?:para|pro|pra|p\/)\s*(?:o\s+dia\s+|o\s+|a\s+)?$/.test(norm.slice(Math.max(0, d.inicio - 18), d.inicio));

  const dias = datas.filter((d) => d.tipo === 'dia');
  const periodos = datas.filter((d) => d.tipo === 'periodo');
  // Só CRIAR e MOVER têm data de DESTINO. Em remover/alterar/status/consultar a
  // data é CRITÉRIO de busca ("exclua o post da Sophos do dia 12/08" não move
  // nada para 12/08 — procura o post que está lá).
  const temDestino = intencao === 'criar' || intencao === 'mover';
  let destino = temDestino ? (dias.find(temParaAntes) || dias[0] || null) : (dias.find(temParaAntes) || null);
  if (destino) {
    spans.consumir(destino.inicio, destino.fim, 'data_publicacao');
    chip(
      'data_publicacao', destino.data, destino.data, destino.inicio, destino.fim,
      destino.origem, destino.inferido.length ? CONF.dataInferida : CONF.data,
      { inferido: destino.inferido },
    );
    for (const a of destino.avisos) avisos.push(a);
  }
  // Outras datas de dia: em mover/remover/alterar viram critério de busca do
  // alvo ("o post do dia 10/06").
  //
  // ★ Em CRIAR não viram mais nada. Até 2026-08-26 a segunda data era gravada como
  // `data_original` **por posição** — não havia marcador, funcionava por acidente.
  // O campo foi APOSENTADO pelo usuário (levantamento no §9.1 do doc: 76% dos posts
  // a tinham igual à data de publicação e nada no sistema a consumia), e com ele
  // fora do formulário, consumir a data aqui gravaria em silêncio num campo que
  // ninguém vê nem consegue corrigir. Deixá-la CAIR NO RESTO é a leitura honesta:
  // o rodapé mostra "não interpretado: 10/09" e a pessoa vê que aquilo não entrou.
  const outrasDatas = dias.filter((d) => d !== destino && !spans.ocupado(d.inicio, d.fim));
  if (outrasDatas.length && intencao !== 'criar') {
    const d = outrasDatas[0];
    spans.consumir(d.inicio, d.fim, 'alvo_data');
    chip('alvo_data', d.data, d.data, d.inicio, d.fim, d.origem, CONF.data, { inferido: d.inferido });
  }
  // Em CRIAR, um nome de mês depois do marcador de título pertence ao TÍTULO:
  // "…sobre Planejamento de Novembro" é o nome do post. Sem isto o "Novembro"
  // era consumido como período e o título ia truncado — grave desde que criar
  // grava de verdade. Mesmo espírito das aspas do passo 0 (§5 nº 3), restrito a
  // PERÍODO porque é o único tipo de data que casa uma palavra solta de prosa
  // ("sobre Vendas ... dia 15" continua achando o dia 15).
  //
  // Só em criar: ali o período é inócuo (corpoDoPost o ignora, e sem dia o plano
  // já acusa `faltando: data_publicacao`), então preferir o título é sempre
  // melhor. Em consultar o período É acionável e continua ganhando.
  const limiteTitulo = intencao === 'criar' ? marcadorTitulo : -1;
  for (const p of periodos) {
    if (spans.ocupado(p.inicio, p.fim)) continue;
    if (limiteTitulo >= 0 && p.inicio > limiteTitulo) continue;
    spans.consumir(p.inicio, p.fim, 'periodo');
    chip('periodo', { de: p.de, ate: p.ate }, `${p.de} a ${p.ate}`, p.inicio, p.fim, p.origem, CONF.data);
    break; // um período por comando
  }

  // ── 3. HORÁRIO ────────────────────────────────────────────────────────────
  const hora = acharHorario(norm);
  if (hora && !spans.ocupado(hora.inicio, hora.fim)) {
    spans.consumir(hora.inicio, hora.fim, 'horario');
    chip('horario', hora.hora, hora.hora, hora.inicio, hora.fim, hora.origem, CONF.regra);
  }

  // ── 4. IMPULSIONAR (negativas ANTES das positivas) ────────────────────────
  const negImpulso = casarEConsumir(norm, spans, /\b(?:sem\s+(?:midia\s+paga|impulsion\w*|patrocin\w*|verba|trafego\s+pago)|nao\s+impulsion\w*|organico|sem\s+anuncio)\b/, 'impulsionar');
  if (negImpulso) {
    chip('impulsionar', false, 'Não impulsionar', negImpulso.index, negImpulso.index + negImpulso[0].length, 'regra', CONF.regra);
  } else {
    const posImpulso = casarEConsumir(norm, spans, /\b(?:com\s+)?(?:impulsion\w*|patrocinad\w*|midia\s+paga|trafego\s+pago|anuncio\s+pago)\b/, 'impulsionar');
    if (posImpulso) {
      chip('impulsionar', true, 'Impulsionar', posImpulso.index, posImpulso.index + posImpulso[0].length, 'regra', CONF.regra);
    }
  }

  // ── 5. FORMATO ────────────────────────────────────────────────────────────
  const fmt = scanLiterais(norm, spans, lex.literais.formato, 'formato');
  if (fmt.length) {
    const e = fmt[0];
    chip('formato', e.entrada.valor, e.entrada.valor, e.inicio, e.fim, e.entrada.origem, CONF[e.entrada.origem] || 1);
  }

  // ── 6. REDES (multi) ──────────────────────────────────────────────────────
  const redesAchadas = scanLiterais(norm, spans, lex.literais.rede, 'redes', { multi: true });
  if (redesAchadas.length) {
    const valores = [];
    let pior = 1;
    let iMin = Infinity;
    let jMax = -1;
    for (const r of redesAchadas) {
      if (!valores.includes(r.entrada.valor)) valores.push(r.entrada.valor);
      pior = Math.min(pior, CONF[r.entrada.origem] || 1);
      iMin = Math.min(iMin, r.inicio);
      jMax = Math.max(jMax, r.fim);
    }
    chip('redes', valores, valores.join(' + '), iMin, jMax, 'lexico', pior);
  }

  // ── 7. STATUS ─────────────────────────────────────────────────────────────
  // Preferência por âncora ("como publicado", "status para em produção") porque
  // nomes de status aparecem em títulos: "post Módulo de produção".
  const stCands = scanLiterais(norm, spans, lex.literais.status, 'status', { multi: true, consumir: false });
  const ANCORA_STATUS = /\b(?:como|para|status)\s*:?\s*(?:o\s+|a\s+)?$/;
  const st = escolherComAncora(norm, stCands, ANCORA_STATUS);
  if (st) {
    spans.consumir(st.inicio, st.fim, 'status');
    // Consome também a âncora ("como", "para"), senão ela sobra no resíduo e
    // aparece como "não interpretado" sem necessidade.
    const antes = norm.slice(Math.max(0, st.inicio - 24), st.inicio);
    const mAnc = ANCORA_STATUS.exec(antes);
    if (mAnc) spans.consumir(st.inicio - (antes.length - mAnc.index), st.inicio, '_ancora_status');
    chip('status', st.entrada.valor, st.entrada.valor, st.inicio, st.fim, st.entrada.origem, CONF[st.entrada.origem] || 1);
  }
  // Verbos que JÁ CARREGAM o status: "despublique o post X" não tem um "como
  // <status>" adiante, e sem esta regra o comando ficava reconhecido como troca
  // de status e ao mesmo tempo `faltando: status` — ou seja, inaplicável por uma
  // razão que a pessoa não tem como adivinhar. Achado ao ligar a fase 3.
  if (intencao === 'status' && !campos.status) {
    for (const [re, valor] of [
      [/\b(?:despubliqu\w*|despublic\w*)\b/, 'Não publicado'],
      [/\b(?:republiqu\w*|republic\w*)\b/, 'Publicado'],
    ]) {
      const m = re.exec(norm);
      if (m) {
        chip('status', valor, valor, m.index, m.index + m[0].length, 'verbo', CONF.regra);
        break;
      }
    }
  }

  // ── 8. CLIENTE ────────────────────────────────────────────────────────────
  // Âncora possessiva ("da SM10", "do cliente P21") vence o literal mais longo:
  // em "storys da KSC sobre Uniplus Web", o cliente é KSC, não Uniplus.
  //
  // Em comandos sobre um post EXISTENTE a âncora é OBRIGATÓRIA. "Transfira o
  // post Uniplus Web para 12/09" fala do post chamado "Uniplus Web" — sem a
  // exigência, "Uniplus" era arrancado do título e virava filtro de cliente,
  // sabotando a busca do alvo.
  const cliCands = scanLiterais(norm, spans, lex.literais.cliente, 'cliente', { multi: true, consumir: false });
  const cli = escolherComAncora(
    norm,
    cliCands,
    /\b(?:d[aeo]s?|para|pro|cliente|marca)\s+(?:o\s+|a\s+|cliente\s+|marca\s+)?$/,
    { exigirAncora: ['mover', 'remover', 'alterar', 'status'].includes(intencao) },
  );
  if (cli) {
    const e = cli;
    spans.consumir(e.inicio, e.fim, 'cliente');
    chip('cliente', e.entrada.id, e.entrada.nome, e.inicio, e.fim, e.entrada.origem, CONF[e.entrada.origem] || 1);
    // Pegadinha real: em "Troque a data do post 5 Benefícios do Uniplus", o
    // "Uniplus" faz parte do TÍTULO, não é o cliente do post. Determinar isso
    // sem LLM não é possível — então avisamos e deixamos o chip corrigível.
    if (intencao !== 'criar' && intencao !== 'consultar') {
      avisos.push(`Li "${campos.cliente.trecho}" como cliente. Se ele faz parte do título do post, corrija o chip.`);
    }
  } else if (contexto.cliente_id && intencao !== 'consultar') {
    // Sem marca no texto: usa a selecionada no filtro da tela.
    //
    // MENOS em `consultar`: uma consulta descreve por inteiro o que se quer ver,
    // e herdar o filtro atual a tornaria circular — o filtro alimentaria o
    // parser, que reaplicaria o filtro. Na prática "Mostre tudo" nunca
    // conseguiria limpar a marca selecionada, ou seja, o comando não podia
    // significar o que diz. Previsibilidade acima de esperteza (§5 nº 7).
    const c = (lex.clientes || []).find((x) => Number(x.id) === Number(contexto.cliente_id));
    if (c) {
      registrar('cliente', {
        valor: Number(c.id), rotulo: c.nome, trecho: '', origem: 'contexto', confianca: 0.7,
      });
    }
  }
  const clienteId = campos.cliente ? campos.cliente.valor : null;

  // ── 9. OPÇÕES GERENCIÁVEIS (pilar / público / objetivo) ───────────────────
  // Primeiro ANCORADAS: "pilar de X", "público X", "objetivo X". A âncora é o
  // que resolve a sobreposição de vocabulário — "educação" existe como pilar
  // ("Educação e Desenvolvimento", "Educativo") E como objetivo ("Educação").
  // `fraca: true` = âncora genérica (o "para X" solto). Só vira oferta de
  // cadastro se o trecho parecer nome próprio — "para Rodrigo" sim, "para
  // vender mais" não.
  const ANCORAS = [
    { categoria: 'pilar', re: /\b(?:pilar\s+de\s+conteudo|pilar|tipo)\s*(?:de\s+|do\s+|da\s+|:\s*)?/ },
    { categoria: 'publico', re: /\b(?:publico|para\s+quem|persona|direcionado\s+(?:a|para))\s*(?:de\s+|para\s+|:\s*)?/ },
    { categoria: 'objetivo', re: /\b(?:com\s+objetivo|objetivo|meta)\s*(?:de\s+|do\s+|da\s+|:\s*)?/ },
    { categoria: 'publico', re: /\bp(?:ara|ra|ro)\s+(?:o\s+|a\s+|os\s+|as\s+)?/, fraca: true },
  ];
  for (const anc of ANCORAS) {
    const campo = anc.categoria;
    if (campos[campo]) continue;
    if (ambiguidades.some((a) => a.campo === campo)) continue;
    const visiveis = opcoesVisiveis(lex, anc.categoria, clienteId);
    const rx = new RegExp(anc.re.source, 'g');

    for (const m of norm.matchAll(rx)) {
      const fimAncora = m.index + m[0].length;
      if (spans.ocupado(m.index, fimAncora)) continue;
      const r = resolverAncorado(norm, spans, fimAncora, visiveis);
      if (!r) continue;

      spans.consumir(m.index, fimAncora, `_ancora_${campo}`);
      const trecho = trechoOriginal(original, mapa, r.inicio, r.fim);

      if (r.decisao === 'auto') {
        spans.consumir(r.inicio, r.fim, campo);
        chip(campo, Number(r.escolhido.item.id), r.escolhido.item.nome, r.inicio, r.fim,
          r.escolhido.score >= 0.999 ? 'nome' : 'similaridade', r.escolhido.score);
      } else if (r.decisao === 'perguntar') {
        spans.consumir(r.inicio, r.fim, campo);
        ambiguidades.push({
          campo,
          trecho,
          acao: 'escolher',
          opcoes: r.candidatos.map((c) => ({ id: Number(c.item.id), nome: c.item.nome, score: Number(c.score.toFixed(3)) })),
        });
      } else if (!anc.fraca || pareceNomeProprio(trecho)) {
        // Não existe na lista: a UI oferece cadastrar o valor novo.
        spans.consumir(r.inicio, r.fim, campo);
        ambiguidades.push({ campo, trecho, acao: 'criar', opcoes: [] });
      } else {
        continue; // âncora fraca + texto comum: não é opção, deixa para o título
      }
      break;
    }
  }

  // Depois NÃO ANCORADAS: o nome exato/apelido de uma opção aparecendo solto no
  // texto ("Carrossel de Dicas para Donos de Padaria").
  const literaisOpcao = literaisOpcaoVisiveis(lex, clienteId);
  for (const cat of Object.keys(CATEGORIA_CAMPO)) {
    if (campos[cat]) continue;
    if (ambiguidades.some((a) => a.campo === cat)) continue;
    const achado = scanLiterais(norm, spans, literaisOpcao.filter((e) => e.categoria === cat), cat);
    if (achado.length) {
      const e = achado[0];
      chip(cat, Number(e.entrada.id), e.entrada.nome, e.inicio, e.fim, e.entrada.origem, CONF[e.entrada.origem] || 1);
    }
  }

  // ── 10. CONTEÚDO / REFERÊNCIA ─────────────────────────────────────────────
  // URL solta ou marcador explícito de referência/briefing.
  const url = casarEConsumir(norm, spans, /\bhttps?:\/\/\S+/, 'conteudo');
  if (url) {
    chip('conteudo', trechoOriginal(original, mapa, url.index, url.index + url[0].length),
      'link', url.index, url.index + url[0].length, 'url', CONF.regra);
    // Consome o rótulo que antecede o link ("referência https://…"), senão ele
    // sobra no resíduo como se não tivesse sido entendido.
    const antesUrl = norm.slice(Math.max(0, url.index - 20), url.index);
    const mRot = /\b(?:referencia|referencias|ref|link|material|briefing)\b\s*:?\s*$/.exec(antesUrl);
    if (mRot) spans.consumir(url.index - (antesUrl.length - mRot.index), url.index, '_ancora_conteudo');
  } else {
    // O \b FINAL é obrigatório: sem ele, "ref" casava dentro de "Reforma
    // Tributária" e roubava o título do post.
    const refRe = /\b(?:referencia|referencias|ref|link|material|briefing|observacao|observacoes|obs)\b\s*:?\s*/g;
    for (const m of norm.matchAll(refRe)) {
      const fimAncora = m.index + m[0].length;
      if (spans.ocupado(m.index, fimAncora)) continue;
      let fim = fimAncora;
      while (fim < norm.length && !spans.ocupado(fim, fim + 1) && !/[.;]/.test(norm[fim])) fim++;
      const valor = trechoOriginal(original, mapa, fimAncora, fim);
      if (!valor) continue;
      spans.consumir(m.index, fim, 'conteudo');
      chip('conteudo', valor, valor.length > 40 ? `${valor.slice(0, 40)}…` : valor, fimAncora, fim, 'ancora', 0.9);
      break;
    }
  }

  // ── 11. TÍTULO (ou critério de busca do alvo) ──────────────────────────────
  const tituloCampo = intencao === 'criar' ? 'assunto' : 'alvo_titulo';
  if (!campos[tituloCampo]) {
    // Aspas (protegidas no passo 0) têm prioridade absoluta; senão, marcador
    // explícito; senão, resíduo.
    const t = protegido
      ? { valor: protegido.valor, inicio: protegido.inicio, fim: protegido.fim, origem: 'aspas', confianca: 1 }
      : acharTitulo(original, norm, mapa, spans);
    if (t) {
      spans.consumir(t.inicio, t.fim, tituloCampo);
      chip(tituloCampo, t.valor, t.valor, t.inicio, t.fim, t.origem, t.confianca);
    }
  }

  // ── 12. ALTERAR: resolve o valor novo (o sufixo consumido no passo 1.6) ────
  // Depois de tudo, porque aqui já se sabe o cliente — e é ele que restringe o
  // vocabulário visível de pilar/público/objetivo (migration 0014).
  if (intencao === 'alterar') {
    if (campoDito === '_cliente') {
      avisos.push('Trocar o post de cliente não é uma alteração de campo:'
        + ' o cliente é o critério que acha o post. Use o modal do post para isso.');
    } else if (campoDito === '_data_original') {
      // O aviso da aposentadoria já saiu no passo 1.2; aqui só se garante que nada
      // seja escrito. Cair no `else` abaixo tentaria resolver o sufixo como valor
      // novo de um campo que não existe mais.
    } else if (sufixoTexto) {
      const r = resolverMudanca(sufixoTexto, campoDito, lex, contexto, clienteId);
      if (r && r.campo && CAMPOS_ALTERAVEIS.has(r.campo)) {
        mudancas[r.campo] = r.dados;
      } else if (r && r.ambiguidade) {
        ambiguidades.push(r.ambiguidade);
      } else {
        avisos.push(`Não entendi “${sufixoTexto.trim()}” como valor novo.`
          + ' Diga que campo mudar ("altere o pilar do post…") ou use um valor conhecido.');
      }
    }
  }

  return montarPlano({ original, norm, intencao, campos, mudancas, ambiguidades, avisos, spans, lex, ctx });
}

// ─────────────────────────────────────────────────────────────────────────────
// Título
// ─────────────────────────────────────────────────────────────────────────────

const MARCADORES_TITULO = [
  /\b(?:sob|com|de)\s+(?:o\s+)?titulo\s*:?\s*/g,
  /\b(?:titulo|assunto|tema)\s*:\s*/g,
  /\b(?:intitulado|chamado|chamada|nomeado)\s*:?\s*/g,
  /\bsobre\s+/g,
  /\bfalando\s+(?:de|sobre)\s+/g,
];

/** Índice do primeiro marcador de título no texto normalizado, ou -1. */
function posicaoMarcadorTitulo(norm) {
  let pos = -1;
  for (const re of MARCADORES_TITULO) {
    // Sem a flag `g`: exec de uma expressão global carrega lastIndex entre
    // chamadas e devolveria posições de outra invocação.
    const m = new RegExp(re.source).exec(norm);
    if (m && (pos < 0 || m.index < pos)) pos = m.index;
  }
  return pos;
}

/**
 * Trecho entre aspas no texto ORIGINAL, traduzido para índices do normalizado.
 * A normalização apaga as aspas, então a detecção tem que olhar o texto cru.
 * Chamado no passo 0 do parser para BLINDAR o trecho antes de qualquer matcher.
 */
function acharAspas(original, norm, mapa) {
  const m = /["“”'«»](.{2,200}?)["“”'«»]/.exec(original);
  if (!m || !m[1].trim()) return null;
  const iOrig = m.index + 1;
  const fOrig = iOrig + m[1].length;
  let i = mapa.findIndex((o) => o >= iOrig);
  let j = mapa.findIndex((o) => o >= fOrig);
  if (i < 0) i = 0;
  if (j < 0) j = mapa.length;
  if (j <= i) return null;
  return { valor: m[1].trim(), inicio: i, fim: j };
}

/**
 * Remove conectores do FIM de um título, preservando caixa e acento (por isso não
 * dá para usar `limparBordas`, que normaliza).
 *
 * Existe por "Mova o post da KSC sobre Duplicidades para 20/08": o marcador
 * "sobre" avança até o próximo span consumido — a data — e o "para" que sobra no
 * meio ia junto, virando o título "Duplicidades para". Em `mover` isso é pior que
 * feio: o título é o critério que a busca do alvo usa para achar o post.
 */
function tirarConectoresFinais(valor) {
  let partes = String(valor).trim().split(/\s+/);
  while (partes.length > 1 && CONECTORES.has(normalizar(partes[partes.length - 1]))) partes.pop();
  return partes.join(' ');
}

/**
 * Extrai o título por MARCADOR EXPLÍCITO (confiança alta) ou, na ausência dele,
 * pelo RESÍDUO do comando (confiança baixa — o chip vem marcado como "conferir").
 * O caso das aspas é resolvido antes, no passo 0 (ver acharAspas).
 */
function acharTitulo(original, norm, mapa, spans) {
  // (b) marcador explícito -> vai até o próximo span consumido ou pontuação forte
  for (const re of MARCADORES_TITULO) {
    const rx = new RegExp(re.source, 'g');
    for (const m of norm.matchAll(rx)) {
      const fimAncora = m.index + m[0].length;
      if (spans.ocupado(m.index, fimAncora)) continue;
      let fim = fimAncora;
      while (fim < norm.length && !spans.ocupado(fim, fim + 1) && !/[.;]/.test(norm[fim])) fim++;
      const bruto = trechoOriginal(original, mapa, fimAncora, fim).replace(/[,;.]+$/, '').trim();
      const valor = tirarConectoresFinais(bruto);
      if (valor.length < 2) continue;
      spans.consumir(m.index, fimAncora, '_ancora_titulo');
      return { valor, inicio: fimAncora, fim, origem: 'marcador', confianca: 0.95 };
    }
  }

  // (c) resíduo: o maior trecho livre que sobrou, sem conectores nas bordas
  const livres = spans.livres(norm)
    .map(([i, j]) => {
      const limpo = limparBordas(norm.slice(i, j));
      return { i, j, limpo, tamanho: limpo.length };
    })
    // Enchimento sozinho não é título: "Mostre tudo" não busca o post "tudo".
    .filter((t) => t.tamanho >= 3 && !soEnchimento(t.limpo))
    .sort((a, b) => b.tamanho - a.tamanho);
  if (!livres.length) return null;

  const melhor = livres[0];
  // Reduz o intervalo para o miolo limpo (evita levar "do post" para o título).
  const bruto = norm.slice(melhor.i, melhor.j);
  const desloc = bruto.indexOf(melhor.limpo.split(' ')[0]);
  const inicio = melhor.i + (desloc >= 0 ? desloc : 0);
  const fim = Math.min(melhor.j, inicio + melhor.limpo.length);
  const valor = trechoOriginal(original, mapa, inicio, fim).replace(/[,;.]+$/, '').trim();
  if (valor.length < 2) return null;
  return { valor, inicio, fim, origem: 'residuo', confianca: 0.5 };
}

// ─────────────────────────────────────────────────────────────────────────────
// Montagem do plano
// ─────────────────────────────────────────────────────────────────────────────

/** O alvo (post existente) foi minimamente identificado? */
function temAlvo(campos) {
  return Boolean(campos.alvo_titulo || campos.alvo_data || campos.periodo);
}

/**
 * Obrigatórios da intenção que continuam ausentes nos campos dados.
 *
 * Exportada porque a rota de APLICAR (fase 2) precisa da mesma régua depois de
 * resolver as ambiguidades: se ela recalculasse "o que falta" com um critério
 * próprio, daria para gravar um post pela metade por divergência entre os dois.
 */
function faltantes(intencao, campos, mudancas) {
  const obrigatorios = OBRIGATORIOS[intencao] || [];
  const falta = [];
  for (const campo of obrigatorios) {
    if (campo === 'alvo') { if (!temAlvo(campos)) falta.push('alvo'); continue; }
    // Pseudo-campo da fase 4.2: "existe alguma alteração a fazer?".
    if (campo === 'mudanca') {
      if (!mudancas || !Object.keys(mudancas).length) falta.push('mudanca');
      continue;
    }
    if (!campos[campo]) falta.push(campo);
  }
  return falta;
}

function montarPlano({ original, norm, intencao, campos, mudancas, ambiguidades, avisos, spans, lex, ctx }) {
  const faltando = faltantes(intencao, campos, mudancas);

  // ── Confiança ────────────────────────────────────────────────────────────
  // Fórmula explícita de propósito (nada de "score mágico"): parte de ter
  // reconhecido a intenção, soma cobertura do texto e a qualidade média dos
  // campos, e desconta dúvida.
  const conf = Object.values(campos).map((c) => c.confianca);
  const mediaCampos = conf.length ? conf.reduce((a, b) => a + b, 0) / conf.length : 0;
  const cobertura = spans.cobertura(norm);
  let confianca = (intencao === 'desconhecida' ? 0.15 : 0.5)
    + 0.3 * cobertura
    + 0.2 * mediaCampos
    - Math.min(0.3, 0.15 * ambiguidades.length)
    - Math.min(0.3, 0.1 * faltando.length);
  confianca = Math.max(0, Math.min(1, confianca));

  // ── Resíduo não interpretado ──────────────────────────────────────────────
  // Só entra aqui o que é INFORMAÇÃO perdida. Sobra de conectivo ("de", "dia",
  // "publicação") não é falha de interpretação e polui a telemetria — que é
  // exatamente a medida de "em quantos comandos o parser não bastou?".
  const resto = spans.livres(norm)
    .map(([i, j]) => norm.slice(i, j).trim())
    .filter((s) => {
      const limpo = limparBordas(s);
      if (limpo.length < 2) return false;
      // Pontuação solta (o "." que sobra de "…Trabalho. Publicação") também
      // conta como enchimento — a normalização preserva . / : - por causa das
      // datas. Mesma régua do descarte de título (soEnchimento).
      return !soEnchimento(limpo);
    });

  // ── Consulta (executável desde a fase 1) ──────────────────────────────────
  // Consultar não escreve nada — o "efeito" é aplicar filtros na grade. É por
  // isso que é a PRIMEIRA intenção executável: um erro de consulta custa zero e
  // mede a precisão do parser com dado real antes de deixá-lo escrever.
  const filtros = intencao === 'consultar' ? filtrosDaConsulta(campos) : null;

  // ── Efeitos (DRY-RUN nas intenções de escrita) ────────────────────────────
  const efeitos = [];
  if (intencao === 'criar' && !faltando.length && !ambiguidades.length) {
    efeitos.push({ tipo: 'criar_post', body: corpoDoPost(campos) });
  }
  if (filtros) {
    efeitos.push({ tipo: 'filtrar_grade', filtros });
  }

  const fase = FASE_APLICACAO[intencao];
  if (intencao === 'desconhecida') {
    avisos.push('Não identifiquei o que fazer. Comece com um verbo: incluir, mover, remover, marcar ou mostrar.');
  }

  return {
    ok: true,
    versao: 1,
    texto: original,
    normalizado: norm,
    intencao,
    confianca: Number(confianca.toFixed(3)),
    campos,
    // Fase 4.2 — só em `alterar`: os VALORES NOVOS, separados dos critérios de
    // busca em `alvo.criterios`. Mesma forma de um chip de `campos`.
    mudancas: mudancas || {},
    alvo: ['mover', 'remover', 'alterar', 'status'].includes(intencao)
      ? {
        criterios: {
          cliente_id: campos.cliente ? campos.cliente.valor : null,
          titulo: campos.alvo_titulo ? campos.alvo_titulo.valor : null,
          data: campos.alvo_data ? campos.alvo_data.valor : null,
          periodo: campos.periodo ? campos.periodo.valor : null,
          formato: campos.formato ? campos.formato.valor : null,
        },
        // Daqui para baixo é a fase 3: quem preenche é `resolverAlvo` em
        // agenda-alvo.js, que consulta o D1 (o parser é puro e não pode). Os
        // campos nascem neutros para o contrato do plano ser o mesmo com ou sem
        // banco — é o que deixa o corpus testar o parser sozinho.
        candidatos: null,
        escolhido: null,
        estado: null,      // resolvido | perguntar | amplo | nenhum | null
        motivo: '',        // por que não resolveu (a UI e a rota usam a MESMA frase)
        impedimento: null, // resolveu, mas aplicar não mudaria nada
        ampliado: null,    // qual critério a busca teve de afrouxar
        total: 0,
      }
      : null,
    // Só em `consultar`. `vazia` = "mostre tudo": aplicar limpa os filtros.
    consulta: filtros
      ? { filtros, vazia: !Object.values(filtros).some((x) => x !== null) }
      : null,
    faltando,
    ambiguidades,
    avisos,
    resto,
    efeitos,
    // Metadados úteis para a UI e para a telemetria da "questão de pesquisa"
    // (em quantos comandos o parser não basta?).
    meta: {
      cobertura: Number(cobertura.toFixed(3)),
      aplicavel: efeitos.length > 0,
      fase_aplicacao: fase,
      contexto: { hoje: ctx.hoje, mes: ctx.mesRef ? `${ctx.mesRef.ano}-${String(ctx.mesRef.mes).padStart(2, '0')}` : null },
      tamanho_lexico: {
        clientes: (lex.clientes || []).length,
        opcoes: (lex.opcoes || []).length,
        literais: Object.values(lex.literais || {}).reduce((a, l) => a + l.length, 0),
      },
    },
  };
}

/** Traduz os chips para o corpo que POST /api/calendario/posts espera. */
function corpoDoPost(campos) {
  const v = (c) => (campos[c] ? campos[c].valor : null);
  return {
    cliente_id: v('cliente'),
    data_publicacao: v('data_publicacao'),
    assunto: v('assunto'),
    formato: v('formato'),
    horario: v('horario'),
    status: v('status') || 'Não iniciado',
    pilar_id: v('pilar'),
    publico_id: v('publico'),
    objetivo_id: v('objetivo'),
    impulsionar: campos.impulsionar ? campos.impulsionar.valor : false,
    conteudo: v('conteudo'),
    redes: v('redes') || [],
  };
}

/**
 * Traduz os chips de uma CONSULTA nos filtros que a grade aplica (fase 1).
 *
 * Mora no backend de propósito: decidir QUAIS campos filtram — e que "dia 15"
 * colapsa num intervalo de um dia — é regra de negócio, e aqui o corpus cobre.
 * A tela só desenha o que vem pronto (mesma divisão do resto da Agenda, §2).
 *
 * `null` significa "não filtrar por isto". Cuidado com `impulsionar`: tem TRÊS
 * estados (true, false e "não falou"), então não pode virar booleano cru.
 */
function filtrosDaConsulta(campos) {
  const v = (c) => (campos[c] ? campos[c].valor : null);
  const redes = v('redes');

  // Período explícito ("em julho", "semana que vem") ou dia único ("dia 15") —
  // que vira intervalo de um dia, para a grade ter um caso só a tratar.
  //
  // Em consulta o dia único cai em `alvo_data`, não em `data_publicacao`: só
  // criar e mover têm data de DESTINO (ver passo 2 do parser). O fallback existe
  // para a derivação não depender dessa escolha continuar igual.
  let de = null;
  let ate = null;
  const dia = campos.alvo_data || campos.data_publicacao;
  if (campos.periodo) {
    de = campos.periodo.valor.de;
    ate = campos.periodo.valor.ate;
  } else if (dia) {
    de = dia.valor;
    ate = de;
  }

  return {
    cliente_id: v('cliente'),
    formato: v('formato'),
    status: v('status'),
    redes: redes && redes.length ? redes : null,
    pilar_id: v('pilar'),
    publico_id: v('publico'),
    objetivo_id: v('objetivo'),
    impulsionar: campos.impulsionar ? campos.impulsionar.valor : null,
    // Em consulta o resíduo/aspas cai em alvo_titulo ("Mostre os posts de Natal"),
    // que aqui vale como busca por pedaço do título.
    titulo: v('alvo_titulo'),
    de,
    ate,
  };
}

/** Ordem em que os chips aparecem na interface (estável, previsível). */
const ORDEM_CHIPS = [
  // `alvo_post` primeiro nas intenções que mexem em post existente: a pergunta
  // que importa antes de gravar é "vai mexer em QUAL post?".
  'alvo_post',
  'cliente', 'formato', 'redes', 'data_publicacao', 'horario', 'status',
  'pilar', 'publico', 'objetivo', 'impulsionar', 'assunto', 'conteudo',
  'alvo_titulo', 'alvo_data', 'periodo',
];

/** Rótulo humano de cada campo (usado nos chips e nas mensagens). */
const ROTULO_CAMPO = {
  cliente: 'Cliente',
  formato: 'Formato',
  redes: 'Redes',
  data_publicacao: 'Publicação',
  data_original: 'Data original',
  horario: 'Horário',
  status: 'Status',
  pilar: 'Pilar',
  publico: 'Público',
  objetivo: 'Objetivo',
  impulsionar: 'Impulsionar',
  assunto: 'Título',
  conteudo: 'Conteúdo',
  alvo_titulo: 'Post (busca)',
  alvo_data: 'Data do post',
  periodo: 'Período',
  // Fase 3: o post que a busca no D1 encontrou, e o rótulo de "falta identificar
  // o post" (entra em `faltando` quando o comando não dá critério nenhum).
  alvo_post: 'Post encontrado',
  alvo: 'Post',
  // Fase 4.2: pseudo-campo de `faltando` — "não há valor novo a escrever".
  mudanca: 'Valor novo',
};

/** Rótulo humano de cada intenção. */
const ROTULO_INTENCAO = {
  criar: 'Incluir post',
  mover: 'Mudar data',
  remover: 'Remover post',
  alterar: 'Alterar post',
  status: 'Trocar status',
  consultar: 'Consultar',
  desconhecida: 'Não entendi',
};



/* ---------- agenda-alvo.js ---------- */
/**
 * ============================================================================
 *  AGENDA INTELIGENTE — RESOLUÇÃO DE ALVO (fase 3: mover / trocar status)
 * ============================================================================
 * Tudo que a fase 3 acrescenta ao plano depois que o parser terminou. É a peça
 * que faltava em `plano.alvo`: o parser sabe dizer QUE CRITÉRIOS a pessoa deu
 * ("o post Natal da P21"), mas só o D1 sabe QUAL post é.
 *
 * ► NÃO é um módulo puro (os quatro do parser são). Ele consulta o D1. A parte
 *   que decide — `classificarCandidatos` — é pura de propósito, para o teste
 *   exercitá-la sem banco.
 *
 * ► A REGRA QUE MANDA NA FASE: alvo ambíguo PERGUNTA, nunca escolhe o "mais
 *   provável". `criar` erra num post novo; `mover`/`status` erram em cima de
 *   dado que já vale — 456 posts de planejamento real. O custo de perguntar é
 *   um clique; o de adivinhar é mexer no post errado sem ninguém notar.
 *
 * Estados possíveis de `plano.alvo.estado`:
 *   resolvido  achou UM post — vira o chip `alvo_post` e o comando é aplicável
 *   perguntar  2..MAX_OFERTA candidatos — vira pergunta (a UI já sabe desenhar)
 *   amplo      candidatos demais — pede título/data em vez de listar 30 posts
 *   nenhum     não achou nada com esses critérios
 *   null       nem buscou (o plano já acusa `faltando: alvo`)
 *
 * Ver docs/calendario-editorial/agenda-inteligente.md (§6, §8.3).
 */


/** Quantos candidatos a pergunta oferece. Acima disso, pedir mais critério. */
const MAX_OFERTA = 6;

/**
 * Teto de linhas lidas do D1 numa busca de alvo. Hoje o calendário inteiro tem
 * 456 posts, então este teto nunca é alcançado na prática — ele existe para a
 * consulta continuar previsível quando o histórico crescer (e para o caso do
 * scan sem critério estrutural, ver `consultar`).
 */
const MAX_LINHAS = 500;

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Intenções que operam sobre um post EXISTENTE (as que têm `plano.alvo`). */
const INTENCOES_COM_ALVO = ['mover', 'remover', 'alterar', 'status'];

/**
 * Campos que participam do EFEITO de cada intenção. O que não está aqui é ruído
 * para aquele comando — ver `podarPerguntasSemEfeito`.
 */
const CAMPOS_DO_EFEITO = {
  mover: ['data_publicacao'],
  status: ['status'],
  // Em `alterar` o valor novo vive em `plano.mudancas`, não em `campos` — nenhum
  // chip de campo participa do efeito. As perguntas que importam ali vêm marcadas
  // com `destino: 'mudanca'` e são preservadas por `podarPerguntasSemEfeito`.
  alterar: [],
};

/** 'YYYY-MM-DD' -> 'DD/MM' (rótulo curto para chip e lista de candidatos). */
function diaMes(iso) {
  return DATE_RE.test(String(iso)) ? `${String(iso).slice(8, 10)}/${String(iso).slice(5, 7)}` : String(iso || '');
}

/** Escapa os curingas do LIKE para um título com % ou _ não virar coringa. */
function escaparLike(s) {
  return String(s).toLowerCase().replace(/[\\%_]/g, '\\$&');
}

/**
 * Lê candidatos do D1.
 *
 * `comCliente`/`comTitulo`/`permitirVarredura` existem porque a busca é feita em
 * camadas: primeiro com tudo, e só quando não acha é que se afrouxa (ver
 * `resolverAlvo`).
 *
 * ★ POR QUE O TÍTULO É RANQUEADO EM JS E NÃO FILTRADO EM SQL. `lower()` do
 * SQLite não remove acento: `LIKE '%beneficios%'` NÃO acha "5 Benefícios do
 * Uniplus". Como tolerância a acento/erro de digitação é o ponto inteiro da
 * Agenda, o casamento de título mora em `similaridade()` (que normaliza) e roda
 * sobre as linhas que os critérios ESTRUTURAIS (cliente, data, formato)
 * trouxeram — tipicamente as ~40 do cliente.
 *
 * O `LIKE` entra só quando NÃO há critério estrutural nenhum ("Marque o post
 * Suporte KSC como publicado"): sem ele esse caso viraria uma varredura da
 * tabela a cada tecla, que é justamente o padrão que está na fila de "Revisão
 * do Repositório" do hub. Quando o LIKE não acha por causa de acento, a camada 2
 * do `resolverAlvo` refaz a busca varrendo — aí é uma vez, não por tecla.
 */
async function consultar(env, criterios, {
  comCliente = true, comTitulo = true, permitirVarredura = false,
} = {}) {
  // Critérios ESTRUTURAIS — os que o SQL sabe filtrar sem ambiguidade. São eles
  // que decidem se o `LIKE` do título entra, então ficam contados à parte do
  // filtro de soft delete abaixo (que é sempre verdade e não restringe nada).
  const conds = [];
  const binds = [];

  if (comCliente && criterios.cliente_id) {
    conds.push('p.cliente_id = ?');
    binds.push(criterios.cliente_id);
  }
  if (criterios.data && DATE_RE.test(criterios.data)) {
    conds.push('p.data_publicacao = ?');
    binds.push(criterios.data);
  } else if (criterios.periodo && criterios.periodo.de && criterios.periodo.ate) {
    conds.push('p.data_publicacao BETWEEN ? AND ?');
    binds.push(criterios.periodo.de, criterios.periodo.ate);
  }
  if (criterios.formato) {
    conds.push('p.formato = ?');
    binds.push(criterios.formato);
  }
  const estruturais = conds.length;

  if (comTitulo && criterios.titulo && !estruturais) {
    conds.push("lower(p.assunto) LIKE ? ESCAPE '\\'");
    binds.push(`%${escaparLike(criterios.titulo)}%`);
  }

  // Sem critério nenhum, buscar alvo seria "qualquer post do calendário". Só as
  // camadas de fallback pedem varredura, e elas rodam uma vez, não por tecla.
  if (!conds.length && !permitirVarredura) return { linhas: [], estruturais };

  // Post excluído (soft delete, migration 0027) não é alvo de nada: oferecer
  // mover algo que a grade não mostra seria a pior forma de o soft delete
  // "não funcionar".
  const where = `WHERE ${[VIVO_SQL, ...conds].join(' AND ')}`;

  try {
    const { results } = await env.RELATORIOS_DB
      .prepare(
        `SELECT p.id, p.cliente_id, cli.nome AS cliente_nome, p.data_publicacao,
                p.assunto, p.formato, p.status
           FROM calendario_posts p
           LEFT JOIN calendario_clientes cli ON cli.id = p.cliente_id
          ${where}
          ORDER BY p.data_publicacao, p.id
          LIMIT ${MAX_LINHAS}`,
      )
      .bind(...binds)
      .all();
    return { linhas: results || [], estruturais };
  } catch {
    // Tabela ausente/erro de D1 não pode derrubar a interpretação: sem
    // candidatos o plano simplesmente não fica aplicável.
    return { linhas: [], estruturais };
  }
}

/**
 * PURO. Decide o que fazer com as linhas achadas.
 *
 * Quando há título, ele filtra por similaridade (é o que dá tolerância a acento
 * e digitação) e ordena. **Título idêntico desempata sozinho** — é o caso de
 * quem copiou o nome do card; sem essa regra, "Natal" com um post "Natal" e
 * outro "Natal 2026" perguntaria à toa.
 *
 * `exigirConfirmacao` = a busca abandonou um critério que a pessoa DEU, então
 * achar um só candidato não basta: ela precisa confirmar. Vale para o
 * afrouxamento de cliente (camada 3), não para o de título — lá o casamento por
 * similaridade é a regra pretendida, e o `LIKE` era só um atalho de consulta.
 * Exigir confirmação por acento tornaria a Agenda insuportável em português.
 */
function classificarCandidatos(titulo, linhas, { exigirConfirmacao = false } = {}) {
  const consulta = normalizar(titulo || '');
  let lista = (linhas || []).map((post) => ({
    post,
    score: consulta ? Number(similaridade(consulta, post.assunto).toFixed(3)) : null,
  }));

  if (consulta) {
    const exatos = lista.filter((c) => normalizar(c.post.assunto) === consulta);
    lista = exatos.length
      ? exatos
      : lista
        .filter((c) => c.score >= LIMIAR.PERGUNTAR)
        .sort((a, b) => b.score - a.score || String(a.post.data_publicacao).localeCompare(String(b.post.data_publicacao)));
  }

  const total = lista.length;
  if (!total) return { estado: 'nenhum', escolhido: null, candidatos: [], total };
  if (total > MAX_OFERTA) {
    return { estado: 'amplo', escolhido: null, candidatos: lista.slice(0, MAX_OFERTA), total };
  }
  if (total === 1 && !exigirConfirmacao) {
    return { estado: 'resolvido', escolhido: lista[0], candidatos: lista, total };
  }
  return { estado: 'perguntar', escolhido: null, candidatos: lista, total };
}

/** Rótulo humano de um candidato: "18/08 · Natal da P21 (Carrossel)". */
function rotuloPost(p) {
  const partes = [diaMes(p.data_publicacao), p.assunto];
  const extra = [p.formato, p.cliente_nome].filter(Boolean).join(' · ');
  return `${partes.join(' · ')}${extra ? ` (${extra})` : ''}`;
}

/**
 * Descrição dos critérios usados na busca — vira a explicação que a tela mostra
 * e a mensagem que a rota devolve, então tem de ser a MESMA frase nos dois.
 *
 * É uma LISTA ROTULADA, não prosa: "não achei post com entre 01/07 e 31/07" foi o
 * que saiu da primeira versão. Com rótulo antes de cada critério a frase fica
 * gramatical em qualquer combinação — e diz à pessoa exatamente por onde a busca
 * andou, que é o que ela precisa para corrigir o comando.
 */
function descreverCriterios(cri, clienteNome) {
  const partes = [];
  if (cri.titulo) partes.push(`título “${cri.titulo}”`);
  if (clienteNome) partes.push(`cliente ${clienteNome}`);
  if (cri.data) partes.push(`dia ${diaMes(cri.data)}`);
  else if (cri.periodo) partes.push(`período de ${diaMes(cri.periodo.de)} a ${diaMes(cri.periodo.ate)}`);
  if (cri.formato) partes.push(`formato ${cri.formato}`);
  return partes.join(' · ') || 'os critérios do comando';
}

/**
 * Remove as perguntas que não afetam ESTE comando.
 *
 * Em `mover`/`status` o efeito é uma data ou um status — pilar, público e
 * objetivo reconhecidos no meio da frase não vão a lugar nenhum. Deixar a
 * pergunta de pé seria pior que atrito: responder "cadastrar" criaria uma opção
 * nova na lista por causa de um comando que só queria mudar a data.
 * O que foi ignorado sai em aviso, para a pessoa não achar que foi aplicado.
 *
 * PURO. Muta o plano (é o mesmo objeto que segue para a UI e para o aplicar).
 */
function podarPerguntasSemEfeito(plano) {
  const usados = CAMPOS_DO_EFEITO[plano.intencao];
  if (!usados || !plano.ambiguidades.length) return plano;

  const ignoradas = plano.ambiguidades.filter((a) => (
    a.campo !== 'alvo' && a.destino !== 'mudanca' && !usados.includes(a.campo)
  ));
  if (!ignoradas.length) return plano;

  plano.ambiguidades = plano.ambiguidades.filter((a) => !ignoradas.includes(a));
  const ALVO_DO_COMANDO = { mover: 'na data', status: 'no status', alterar: 'no campo citado' };
  const lista = ignoradas.map((a) => `“${a.trecho}”`).join(', ');
  plano.avisos.push(
    `Ignorei ${lista}: este comando só mexe ${ALVO_DO_COMANDO[plano.intencao] || 'no post'}.`,
  );
  return plano;
}

/**
 * Enriquece o plano com o alvo resolvido. Muta e devolve o mesmo plano.
 *
 * Roda nas DUAS rotas de propósito: no `interpretar` (para a pessoa VER qual
 * post foi encontrado antes de apertar Enter — é a promessa dos chips desde a
 * fase 0) e no `aplicar` (que re-interpreta e não confia em nada do cliente).
 *
 * @param {object} env       bindings do Worker (usa RELATORIOS_DB)
 * @param {object} plano     saída de `interpretar()`
 * @param {object} resolucao resposta humana à pergunta de alvo:
 *                           { acao:'escolher', id:<um dos candidatos OFERECIDOS> }
 */
async function resolverAlvo(env, plano, resolucao) {
  if (!plano || !plano.alvo || !INTENCOES_COM_ALVO.includes(plano.intencao)) return plano;

  plano.alvo.estado = null;
  plano.alvo.motivo = '';
  plano.alvo.impedimento = null;
  plano.alvo.escolhido = null;
  plano.alvo.ampliado = null;
  plano.alvo.total = 0;

  // Sem critério suficiente o parser já acusou `faltando: alvo` — não há o que
  // buscar, e buscar assim varreria o calendário a cada tecla.
  if (plano.faltando.includes('alvo')) return plano;

  const cri = plano.alvo.criterios;
  // O cliente só é afrouxável quando veio do TEXTO: se veio do filtro da tela
  // ('contexto'), a pessoa escolheu aquela marca e sair dela seria mexer no
  // post de outro cliente.
  const clienteDoTexto = Boolean(
    cri.cliente_id && plano.campos.cliente && plano.campos.cliente.origem !== 'contexto',
  );

  const temEstrutural = Boolean(cri.cliente_id || cri.data || cri.periodo || cri.formato);

  // A busca é feita em CAMADAS, da mais fiel ao comando para a mais frouxa. Cada
  // camada é CLASSIFICADA antes de se decidir passar à seguinte — e não pelo
  // número de linhas cruas: com "5 Benefícios" + cliente Uniplus, o SELECT traz
  // os posts do Uniplus (linhas > 0) e é o filtro de similaridade que descobre
  // que nenhum serve. Decidir pelas linhas cruas fazia as camadas 2 e 3 nunca
  // rodarem — foi assim que este bug apareceu.
  const camadas = [
    // 1. Todos os critérios, como a pessoa disse.
    { opts: {}, ampliado: null },
    // 2. Sem o LIKE do título: ele é exato demais (acento/typo) e só foi usado
    //    quando não havia critério estrutural nenhum.
    ...(cri.titulo && !temEstrutural
      ? [{ opts: { comTitulo: false, permitirVarredura: true }, ampliado: 'titulo' }]
      : []),
    // 3. Sem o cliente — a §5 "Limitação conhecida": em "Troque a data do post 5
    //    Benefícios do Uniplus" o "do Uniplus" está ancorado mas é parte do
    //    TÍTULO. Só afrouxa havendo título para segurar a busca.
    ...(clienteDoTexto && cri.titulo
      ? [{ opts: { comCliente: false, comTitulo: false, permitirVarredura: true }, ampliado: 'cliente' }]
      : []),
  ];

  let r = { estado: 'nenhum', escolhido: null, candidatos: [], total: 0 };
  let ampliado = null;
  for (const camada of camadas) {
    const { linhas } = await consultar(env, cri, camada.opts);
    // Só o afrouxamento de CLIENTE exige confirmação: ali a busca saiu da marca
    // que a pessoa nomeou. O de título é o casamento tolerante de sempre.
    const c = classificarCandidatos(cri.titulo, linhas, { exigirConfirmacao: camada.ampliado === 'cliente' });
    if (c.estado !== 'nenhum') { r = c; ampliado = camada.ampliado; break; }
  }

  if (ampliado === 'cliente') {
    plano.avisos.push(
      `Não achei esse post em ${plano.campos.cliente.rotulo} — procurei em todas as marcas,`
      + ` porque "${plano.campos.cliente.trecho || plano.campos.cliente.rotulo}" pode fazer parte do título.`,
    );
  }
  plano.alvo.estado = r.estado;
  plano.alvo.ampliado = ampliado;
  plano.alvo.total = r.total;
  plano.alvo.candidatos = r.candidatos.map((c) => ({
    id: Number(c.post.id),
    nome: rotuloPost(c.post),
    data_publicacao: c.post.data_publicacao,
    assunto: c.post.assunto,
    formato: c.post.formato,
    status: c.post.status,
    cliente_id: c.post.cliente_id,
    cliente_nome: c.post.cliente_nome,
    score: c.score,
  }));

  // Escolha humana: validada contra os candidatos que ESTE servidor ofereceu —
  // mesmo princípio das opções (§6.1). O cliente não manda qual post alterar; ele
  // escolhe entre os que a busca do servidor achou. Um id fora dessa lista não é
  // "escolha inválida" que se corrige: a lista volta e a pergunta continua aberta.
  let escolhaInvalida = false;
  if (r.estado === 'perguntar' && resolucao && resolucao.acao === 'escolher') {
    const escolha = plano.alvo.candidatos.find((c) => Number(c.id) === Number(resolucao.id));
    if (escolha) {
      plano.alvo.estado = 'resolvido';
      r.escolhido = { post: escolha, score: escolha.score };
    } else {
      escolhaInvalida = true;
    }
  }

  // Uma descrição só, usada por todas as mensagens — inclui o cliente, para a
  // pessoa ver que a busca ficou restrita à marca (causa comum de "não achei").
  const desc = descreverCriterios(cri, ampliado === 'cliente' ? null
    : (plano.campos.cliente ? plano.campos.cliente.rotulo : null));

  if (plano.alvo.estado === 'resolvido') {
    const post = r.escolhido.post;
    plano.alvo.escolhido = plano.alvo.candidatos.find((c) => Number(c.id) === Number(post.id))
      || { id: Number(post.id), ...post };
    fixarChipDoAlvo(plano, plano.alvo.escolhido, r.escolhido.score);
    verificarImpedimento(plano, plano.alvo.escolhido);
  } else if (plano.alvo.estado === 'perguntar') {
    plano.alvo.motivo = escolhaInvalida
      ? `o post escolhido não está entre os que atendem ao comando (${desc}) — escolha um da lista.`
      : `mais de um post atende ao comando (${desc}) — escolha qual.`;
    plano.ambiguidades.push({
      campo: 'alvo',
      trecho: cri.titulo || desc,
      acao: 'escolher',
      // Alvo não tem saída "isso não era um post": o comando fala de um post
      // existente por definição. A UI respeita esta marca e some com o botão.
      sem_ignorar: true,
      opcoes: plano.alvo.candidatos.map((c) => ({ id: c.id, nome: c.nome, score: c.score })),
    });
  } else if (plano.alvo.estado === 'amplo') {
    // A sugestão pede o que FALTA — dizer "informe o título" a quem já informou o
    // título é a mensagem de erro que não ajuda ninguém.
    const sugestao = !cri.titulo ? 'diga o título do post'
      : (!cri.data ? 'diga o dia do post' : 'seja mais específico no título');
    plano.alvo.motivo = `${r.total} posts atendem ao comando (${desc}) — ${sugestao}.`;
    plano.avisos.push(plano.alvo.motivo);
  } else {
    plano.alvo.motivo = `não achei post com ${desc}.`;
    plano.avisos.push(plano.alvo.motivo);
  }

  atualizarEfeitos(plano);
  return plano;
}

/** Chip do post encontrado — é ele que responde "vai mexer em qual post?". */
function fixarChipDoAlvo(plano, post, score) {
  plano.campos.alvo_post = {
    valor: Number(post.id),
    rotulo: post.nome,
    trecho: plano.alvo.criterios.titulo || '',
    origem: plano.alvo.ampliado ? `busca (sem ${plano.alvo.ampliado})` : 'busca',
    // Confiança do chip = a do casamento de título. Sem título (achado por
    // cliente+data) o casamento é exato por construção.
    confianca: score == null ? 1 : score,
  };
}

/**
 * Recusa antecipada do que não muda nada. Mover para a data em que o post já
 * está, ou marcar com o status que ele já tem, é escrita sem efeito — e é
 * também como um comando mal interpretado aparece ("Adie o post da Sophos do
 * dia 12/08" lê 12/08 como DESTINO, porque só criar e mover têm destino).
 */
function verificarImpedimento(plano, post) {
  if (plano.intencao === 'mover') {
    const nova = plano.campos.data_publicacao ? plano.campos.data_publicacao.valor : null;
    if (nova && nova === post.data_publicacao) {
      plano.alvo.impedimento = `“${post.assunto}” já está em ${diaMes(nova)} — nada a mover.`
        + ' Se quis mover o post DESSE dia, diga a data de destino ("… para 18/08").';
    }
  }
  if (plano.intencao === 'status') {
    const novo = plano.campos.status ? plano.campos.status.valor : null;
    if (novo && novo === post.status) {
      plano.alvo.impedimento = `“${post.assunto}” já está como ${novo}.`;
    }
  }
  // Fase 4.2: o mesmo raciocínio para alterar, campo por campo. Só sabemos
  // comparar o que a busca do alvo trouxe (assunto, formato, status) — os demais
  // (pilar, público…) não vêm no candidato, e um SELECT extra por tecla não se
  // justifica para uma guarda de conveniência.
  if (plano.intencao === 'alterar') {
    const iguais = Object.entries(plano.mudancas || {})
      .filter(([campo, dados]) => {
        const atual = campo === 'assunto' ? post.assunto : post[campo];
        return atual !== undefined && atual !== null && String(atual) === String(dados.valor);
      })
      .map(([, dados]) => dados.rotulo);
    const total = Object.keys(plano.mudancas || {}).length;
    if (total && iguais.length === total) {
      plano.alvo.impedimento = `“${post.assunto}” já está com ${iguais.join(' e ')} — nada a alterar.`;
    }
  }
}

/**
 * Acrescenta o efeito de mover/trocar status quando o plano fecha. `efeitos` é
 * a leitura uniforme de "o que este comando faria", e `meta.aplicavel` é o que
 * a UI usa para saber se existe ação — os dois precisam refletir a fase 3.
 */
function atualizarEfeitos(plano) {
  const pronto = plano.alvo.estado === 'resolvido'
    && !plano.alvo.impedimento
    && !plano.faltando.length
    && !plano.ambiguidades.length;

  if (pronto && plano.intencao === 'mover') {
    plano.efeitos.push({
      tipo: 'mover_post',
      post_id: plano.alvo.escolhido.id,
      de: plano.alvo.escolhido.data_publicacao,
      para: plano.campos.data_publicacao.valor,
    });
  }
  if (pronto && plano.intencao === 'status') {
    plano.efeitos.push({
      tipo: 'trocar_status',
      post_id: plano.alvo.escolhido.id,
      de: plano.alvo.escolhido.status,
      para: plano.campos.status.valor,
    });
  }
  if (pronto && plano.intencao === 'alterar') {
    plano.efeitos.push({
      tipo: 'alterar_post',
      post_id: plano.alvo.escolhido.id,
      mudancas: Object.fromEntries(
        Object.entries(plano.mudancas).map(([campo, d]) => [campo, d.valor]),
      ),
    });
  }
  if (pronto && plano.intencao === 'remover') {
    plano.efeitos.push({ tipo: 'remover_post', post_id: plano.alvo.escolhido.id });
  }
  plano.meta.aplicavel = plano.efeitos.length > 0;
}

