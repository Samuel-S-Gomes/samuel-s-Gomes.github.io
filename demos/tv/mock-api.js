/* Demo estática do Dashboard TV.
   Substitui o backend (Worker + KV + repo privado Midia-TV + Graph API) por
   dados fictícios em memória: faturamento, seguidores, visualizações,
   engajamento e os posts em destaque são inventados. O editor funciona
   normalmente (criar slide de texto, subir imagem/vídeo, reordenar, ocultar,
   salvar) — a mídia enviada fica em memória do navegador (Blob URL); tudo
   some ao recarregar. `canEdit` vem sempre `true`: na demo não há login nem
   perfil `tv`/admin, qualquer visitante edita. */
(function () {
  const MARCAS = {
    prisma: { nome: 'Prisma', cor: '#0072ce' },
    fluxora: { nome: 'Fluxora', cor: '#e23945' },
    lumina: { nome: 'Lumina', cor: '#6F57E6' },
    zenith: { nome: 'Zenith', cor: '#22D3EE' },
  };
  const MESES = [
    'janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho',
    'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro',
  ];
  const MES_ABREV = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

  const hoje = new Date();
  const ANO = hoje.getFullYear();
  const MES_ATUAL = hoje.getMonth(); // 0-11

  /* ---------- Deck em memória (seed fictício) ----------
     A primeira posição é o gráfico permanente de faturamento
     (chartId 'financeiro-ytd'): listá-lo aqui, e não deixar só para o
     garantirGraficosPermanentes do front injetar no fim, é o que fixa
     ele como a página 1 do loop. */
  let slides = [
    {
      id: 'grafico-financeiro-ytd', kind: 'chart', title: '', body: '',
      mediaKey: null, mediaType: null, chartId: 'financeiro-ytd', durationMs: 20000, enabled: true,
    },
    {
      id: 'meta-seguidores-batida', kind: 'text', title: 'Meta de Seguidores batida!',
      body: 'Uma das marcas passou da meta do trimestre antes do prazo — parabéns ao time de social!',
      mediaKey: null, mediaType: null, chartId: null, durationMs: 9000, enabled: true,
    },
    {
      id: 'boasvindas', kind: 'text', title: 'Bem-vindo ao setor de Marketing',
      body: 'Painel em loop exibido na TV da sala — avisos e indicadores, sem operador.',
      mediaKey: null, mediaType: null, chartId: null, durationMs: 9000, enabled: true,
    },
    {
      id: 'aviso-reuniao', kind: 'text', title: 'Reunião semanal · quinta-feira, 10h',
      body: 'Sala de vidro — pauta: resultados do mês e cronograma da semana.',
      mediaKey: null, mediaType: null, chartId: null, durationMs: 9000, enabled: true,
    },
  ];
  // Os gráficos permanentes (financeiro, seguidores, visualizações, engajamento
  // por marca) são injetados pelo PRÓPRIO front (garantirGraficosPermanentes),
  // então o deck da demo não precisa listá-los — mesmo comportamento do original.

  const media = new Map(); // mediaKey -> { base64, mediaType }

  /* ---------- Seed fictício: faturamento ---------- */
  function financeiroFicticio() {
    const base = 28000 + Math.random() * 4000;
    const mensal = Array.from({ length: 12 }, (_, i) => Math.round(base + i * 900 + (Math.random() * 1500 - 750)));
    let acc = 0;
    const acumulado = mensal.map((v) => (acc += v));
    const previsto = Math.round(mensal.reduce((s, v) => s + v, 0) * 1.08);
    const adquirido = acumulado[MES_ATUAL];
    return {
      ok: true,
      ano: ANO,
      refIdx: MES_ATUAL,
      rotulos: MESES.map((m) => `${m} de ${ANO}`),
      mensal,
      acumulado,
      adquirido,
      previsto,
      restante: previsto - adquirido,
      clientesAtivos: 14,
      revendasAtivas: 11,
      clientesExternosAtivos: 3,
    };
  }

  /* ---------- Seed fictício: seguidores (últimos 6 meses) ---------- */
  function seguidoresFicticio(marcaKey) {
    const marca = MARCAS[marcaKey];
    if (!marca) return { ok: false, error: 'Marca desconhecida.' };
    const partida = { prisma: 9200, fluxora: 15400, lumina: 4100, zenith: 2600 }[marcaKey] || 3000;
    const serie = [];
    let v = partida;
    for (let i = 5; i >= 0; i--) {
      const mIdx = ((MES_ATUAL - i) % 12 + 12) % 12;
      const ano = MES_ATUAL - i < 0 ? ANO - 1 : ANO;
      v = Math.round(v + partida * (0.015 + Math.random() * 0.02));
      serie.push({ m: `${ano}-${String(mIdx + 1).padStart(2, '0')}`, v });
    }
    return {
      ok: true,
      updated: new Date().toISOString(),
      marca: { key: marcaKey, nome: marca.nome, cor: marca.cor, atual: serie[serie.length - 1].v, serie },
    };
  }

  /* ---------- Seed fictício: posts em destaque (thumbnails) ----------
     Fotos "de mentirinha" via Picsum (picsum.photos/seed/…): banco de fotos
     de banco de imagens de verdade, só que sem nenhuma relação com as marcas
     — servem pra simular a miniatura de um post real (em vez de um
     quadradinho colorido com o nome escrito, que denunciava na hora que era
     mock). Seed fixa por marca+campo+índice pra não trocar de foto a cada
     refetch do slide. */
  function postsFicticios(marcaKey, campo, totalPorPost) {
    const marca = MARCAS[marcaKey];
    return Array.from({ length: 4 }, (_, i) => {
      const valor = Math.round(totalPorPost * (1 - i * 0.18) * (0.9 + Math.random() * 0.2));
      const org = Math.round(valor * (0.15 + Math.random() * 0.1));
      const paid = valor - org;
      return {
        id: `${marcaKey}-post-${i}`,
        thumb: `https://picsum.photos/seed/${encodeURIComponent(marcaKey + '-' + campo + '-' + i)}/300/300`,
        permalink: '#',
        formato: ['Post Único', 'Carrossel', 'Reels'][i % 3],
        [campo]: valor,
        [campo + 'Org']: org,
        [campo + 'Paid']: paid,
        impulsionado: paid > 0,
      };
    });
  }

  /* ---------- Seed fictício: visualizações do ano ---------- */
  function visualizacoesFicticio(marcaKey) {
    const marca = MARCAS[marcaKey];
    if (!marca) return { ok: false, error: 'Marca desconhecida.' };
    const totalBase = { prisma: 1450000, fluxora: 1900000, lumina: 620000, zenith: 340000 }[marcaKey] || 500000;
    const org = Math.round(totalBase * 0.12);
    const paid = totalBase - org;
    return {
      ok: true,
      updated: new Date().toISOString(),
      ano: ANO,
      marca: {
        key: marcaKey, nome: marca.nome, cor: marca.cor,
        total: totalBase, org, paid,
        porFormato: { 'Post Único': Math.round(totalBase * 0.2), 'Carrossel': Math.round(totalBase * 0.3), 'Reels': Math.round(totalBase * 0.5) },
        // 0.1336 * soma dos fatores de postsFicticios (2.92) ≈ 39% do total somado nos 4 posts.
        topPosts: postsFicticios(marcaKey, 'visualizacoes', totalBase * 0.1336),
      },
    };
  }

  /* ---------- Seed fictício: engajamento do ano ---------- */
  function engajamentoFicticio(marcaKey) {
    const marca = MARCAS[marcaKey];
    if (!marca) return { ok: false, error: 'Marca desconhecida.' };
    const totalBase = { prisma: 145000, fluxora: 190000, lumina: 62000, zenith: 34000 }[marcaKey] || 40000;
    const org = Math.round(totalBase * 0.7);
    const paid = totalBase - org;
    return {
      ok: true,
      updated: new Date().toISOString(),
      ano: ANO,
      marca: {
        key: marcaKey, nome: marca.nome, cor: marca.cor,
        total: totalBase, org, paid,
        // mesma proporção da página de visualizações: os 4 posts em destaque somam ~39% do total.
        topPosts: postsFicticios(marcaKey, 'engajamento', totalBase * 0.1336),
      },
    };
  }

  /* ---------- Deck: validação equivalente ao sanitizeDeck do backend ---------- */
  const LIMITS = {
    maxSlides: 60, maxTitle: 200, maxBody: 2000,
    minDurationMs: 3000, maxDurationMs: 5 * 60 * 1000, defaultDurationMs: 15000,
  };
  const CHART_IDS = new Set([
    'financeiro-ytd',
    'seguidores-crescimento-prisma', 'seguidores-crescimento-fluxora', 'seguidores-crescimento-lumina', 'seguidores-crescimento-zenith',
    'visualizacoes-ano-prisma', 'visualizacoes-ano-fluxora', 'visualizacoes-ano-lumina', 'visualizacoes-ano-zenith',
    'engajamento-ano-prisma', 'engajamento-ano-fluxora', 'engajamento-ano-lumina', 'engajamento-ano-zenith',
  ]);

  function sanitizeDeck(input) {
    if (!Array.isArray(input)) return { ok: false, error: 'Formato inválido.' };
    if (input.length > LIMITS.maxSlides) return { ok: false, error: `Máximo de ${LIMITS.maxSlides} slides.` };
    const out = [];
    for (const item of input) {
      if (!item || typeof item !== 'object') continue;
      const kind = item.kind === 'media' ? 'media' : item.kind === 'chart' ? 'chart' : 'text';
      const id = String(item.id || '').slice(0, 64) || ('s' + out.length + '-' + Math.random().toString(36).slice(2, 8));
      const title = String(item.title || '').slice(0, LIMITS.maxTitle);
      const body = String(item.body || '').slice(0, LIMITS.maxBody);
      let mediaKey = null, mediaType = null;
      if (kind === 'media') {
        mediaKey = String(item.mediaKey || '');
        if (!media.has(mediaKey)) return { ok: false, error: 'Slide de mídia sem arquivo válido.' };
        mediaType = String(item.mediaType || '').slice(0, 100);
      }
      let chartId = null;
      if (kind === 'chart') {
        chartId = String(item.chartId || '');
        if (!CHART_IDS.has(chartId)) continue;
      }
      if (kind === 'text' && !title && !body) continue;
      let durationMs = Number(item.durationMs);
      if (!Number.isFinite(durationMs)) durationMs = LIMITS.defaultDurationMs;
      durationMs = Math.min(LIMITS.maxDurationMs, Math.max(LIMITS.minDurationMs, Math.round(durationMs)));
      out.push({ id, kind, title, body, mediaKey, mediaType, chartId, durationMs, enabled: item.enabled !== false });
    }
    return { ok: true, slides: out };
  }

  /* ---------- Media (upload/serviço) ---------- */
  function base64ParaBytes(base64) {
    const bin = atob(base64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return bytes;
  }
  function extPorTipo(tipo) {
    return { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif', 'video/mp4': 'mp4', 'video/webm': 'webm' }[tipo] || 'bin';
  }

  /* ---------- Roteador ---------- */
  const reply = (obj, status = 200) => new Promise((resolve) => setTimeout(() => resolve(new Response(JSON.stringify(obj), {
    status, headers: { 'Content-Type': 'application/json; charset=utf-8' },
  })), 120));

  const realFetch = window.fetch.bind(window);
  window.fetch = async function (input, init) {
    const opts = init || {};
    const url = new URL(typeof input === 'string' ? input : input.url, location.href);
    const path = url.pathname;
    const method = (opts.method || 'GET').toUpperCase();

    if (!path.startsWith('/api/tv')) return realFetch(input, init);

    try {
      if (path === '/api/tv/deck') {
        if (method === 'GET') return reply({ ok: true, slides, limits: LIMITS, canEdit: true });
        if (method === 'PUT') {
          let body;
          try { body = JSON.parse(opts.body || '{}'); } catch { return reply({ ok: false, error: 'JSON inválido.' }, 400); }
          const res = sanitizeDeck(body && body.slides);
          if (!res.ok) return reply(res, 400);
          const vivos = new Set(res.slides.map((s) => s.mediaKey).filter(Boolean));
          for (const chave of [...media.keys()]) if (!vivos.has(chave)) media.delete(chave);
          slides = res.slides;
          return reply({ ok: true, slides });
        }
        return reply({ ok: false, error: 'Método não permitido.' }, 405);
      }

      if (path === '/api/tv/financeiro-ytd' && method === 'GET') return reply(financeiroFicticio());

      let m = /^\/api\/tv\/seguidores-(prisma|fluxora|lumina|zenith)$/.exec(path);
      if (m && method === 'GET') return reply(seguidoresFicticio(m[1]));

      m = /^\/api\/tv\/visualizacoes-ano-(prisma|fluxora|lumina|zenith)$/.exec(path);
      if (m && method === 'GET') return reply(visualizacoesFicticio(m[1]));

      m = /^\/api\/tv\/engajamento-ano-(prisma|fluxora|lumina|zenith)$/.exec(path);
      if (m && method === 'GET') return reply(engajamentoFicticio(m[1]));

      if (path === '/api/tv/media' && method === 'POST') {
        const tipo = String(url.searchParams.get('tipo') || '').toLowerCase();
        const bytes = Number(url.searchParams.get('bytes') || 0);
        const base64 = typeof opts.body === 'string' ? opts.body : await new Response(opts.body).text();
        const chave = `${crypto.randomUUID()}.${extPorTipo(tipo)}`;
        media.set(chave, { base64, mediaType: tipo });
        return reply({ ok: true, mediaKey: chave, mediaType: tipo, size: bytes });
      }

      if (path.startsWith('/api/tv/media/') && method === 'GET') {
        const chave = decodeURIComponent(path.slice('/api/tv/media/'.length));
        const item = media.get(chave);
        if (!item) return reply({ ok: false, error: 'Mídia não encontrada.' }, 404);
        const bytesArr = base64ParaBytes(item.base64);
        return new Promise((resolve) => setTimeout(() => resolve(new Response(bytesArr, {
          status: 200,
          headers: { 'Content-Type': item.mediaType || 'application/octet-stream', 'Cache-Control': 'private, max-age=604800, immutable' },
        })), 80));
      }

      return reply({ ok: false, error: 'Rota não encontrada.' }, 404);
    } catch (e) {
      return reply({ ok: false, error: e.message || String(e) }, 500);
    }
  };
})();
