// ============================================================================
// mock-api.js — Demo de portfólio (dados 100% fictícios).
// Intercepta window.fetch para as rotas /api/relatorios/social e
// /api/relatorios/stories que o dashboard real
// (Paginas-MKT/public/dashboard/analise-redes-sociais-api/) consulta, e
// responde com posts e stories gerados na hora — nenhum backend, nenhuma
// credencial, nenhuma chamada real à API do Instagram. Mesmo padrão das
// outras demos deste portfólio (ver demos/relatorios-revenda,
// demos/financeiro-revendas): shim de fetch + gerador determinístico.
// ============================================================================
(function () {
  "use strict";

  // ---- PRNG determinístico (mesma seed = mesmos números sempre) ------------
  function hashSeed(str) {
    let h = 1779033703 ^ str.length;
    for (let i = 0; i < str.length; i++) {
      h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
      h = (h << 13) | (h >>> 19);
    }
    return () => {
      h = Math.imul(h ^ (h >>> 16), 2246822507);
      h = Math.imul(h ^ (h >>> 13), 3266489909);
      h ^= h >>> 16;
      return h >>> 0;
    };
  }
  function rngFor(seedStr) {
    const seedFn = hashSeed(seedStr);
    let a = seedFn();
    return function () {
      a |= 0;
      a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  const pick = (rng, arr) => arr[Math.floor(rng() * arr.length)];
  const int = (rng, lo, hi) => Math.round(lo + rng() * (hi - lo));

  // ---- As revendas fictícias -------------------------------------------------
  // Mesmo elenco de empresas fictícias das outras demos do portfólio (ver
  // demos/relatorios-revenda/mock-api.js) — só as que têm conta de Instagram.
  const REVENDAS = [
    { key: "vetta", nome: "Vetta Sistemas", username: "vettasistemas", avgViews: 9000, followers: 2600 },
    { key: "praxis", nome: "Praxis Contábil", username: "praxiscontabil", avgViews: 5000, followers: 1350 },
    { key: "zelo", nome: "Zelo Alimentos", username: "zeloalimentos", avgViews: 14000, followers: 4800 },
    { key: "configura", nome: "Configura Móveis", username: "configuramoveis", avgViews: 7000, followers: 2100 },
    { key: "bravo", nome: "Bravo Fitness", username: "bravofitness", avgViews: 16000, followers: 6200 },
  ];
  const revByKey = (k) => REVENDAS.find((r) => r.key === k) || REVENDAS[0];

  // ---- Conteúdo dos posts, por formato ---------------------------------------
  const REELS_ASSUNTOS = [
    "Bastidores da equipe em ação",
    "Dica rápida para o seu negócio",
    "Como funciona na prática: mostramos o processo",
    "Spoiler do que vem por aí",
    "Um dia na rotina do time",
    "3 erros comuns (e como evitar)",
    "Reagindo aos comentários dos seguidores",
    "Transformação em poucos passos",
  ];
  const CARROSSEL_ASSUNTOS = [
    "Checklist: o que avaliar antes de decidir",
    "Antes e depois: resultado real de cliente",
    "Guia rápido do mês",
    "5 sinais de que está na hora de mudar",
    "Case de sucesso: como ajudamos um cliente",
    "Novidades e lançamentos do período",
    "Perguntas frequentes, respondidas",
    "Passo a passo para começar hoje",
  ];
  const POST_UNICO_ASSUNTOS = [
    "Aniversário da empresa 🎉",
    "Depoimento de cliente",
    "Convite para o webinar gratuito",
    "Conquista do time",
    "Promoção especial do mês",
    "Bem-vindo(a) ao time!",
    "Agradecimento aos parceiros",
    "Comunicado importante",
  ];

  // ---- Legenda curta por assunto, usada na miniatura (thumb) do post --------
  // A demo não tem imagens reais de post (não há Instagram por trás) — a
  // miniatura é um placeholder colorido por formato (mesmo esquema de cores
  // de FORMAT_COLORS no index.html) com um rótulo curto que remete ao
  // assunto, só para o hover no título não abrir vazio.
  const ASSUNTO_THUMB_LABEL = {
    "Bastidores da equipe em ação": "🎬 Bastidores",
    "Dica rápida para o seu negócio": "💡 Dica rápida",
    "Como funciona na prática: mostramos o processo": "⚙️ Na prática",
    "Spoiler do que vem por aí": "👀 Spoiler",
    "Um dia na rotina do time": "📅 Rotina do time",
    "3 erros comuns (e como evitar)": "🚫 3 erros comuns",
    "Reagindo aos comentários dos seguidores": "💬 Reagindo",
    "Transformação em poucos passos": "✨ Transformação",
    "Checklist: o que avaliar antes de decidir": "✅ Checklist",
    "Antes e depois: resultado real de cliente": "🔄 Antes e depois",
    "Guia rápido do mês": "📘 Guia do mês",
    "5 sinais de que está na hora de mudar": "🚦 5 sinais",
    "Case de sucesso: como ajudamos um cliente": "🏆 Case de sucesso",
    "Novidades e lançamentos do período": "🚀 Novidades",
    "Perguntas frequentes, respondidas": "❓ FAQ",
    "Passo a passo para começar hoje": "🪜 Passo a passo",
    "Aniversário da empresa 🎉": "🎂 Aniversário",
    "Depoimento de cliente": "🗣️ Depoimento",
    "Convite para o webinar gratuito": "🎤 Webinar grátis",
    "Conquista do time": "🏅 Conquista",
    "Promoção especial do mês": "🏷️ Promoção",
    "Bem-vindo(a) ao time!": "👋 Bem-vindo(a)",
    "Agradecimento aos parceiros": "🤝 Obrigado",
    "Comunicado importante": "📢 Comunicado",
  };
  // Mesmas cores de FORMAT_COLORS (index.html), sem o "#" (placehold.co).
  const FORMAT_THUMB_HEX = {
    "Reels": "0072ce",
    "Carrossel": "de8d13",
    "Post Único": "1a8d5f",
  };
  function thumbFor(formatoNome, assunto) {
    const hex = FORMAT_THUMB_HEX[formatoNome] || "6b7280";
    const label = ASSUNTO_THUMB_LABEL[assunto] || assunto;
    return `https://placehold.co/300x300/${hex}/ffffff?text=${encodeURIComponent(label)}`;
  }
  const FORMATOS = [
    { nome: "Reels", peso: 3, assuntos: REELS_ASSUNTOS, viewsMul: 1.3, engRate: [0.035, 0.075], savesRate: [0.006, 0.02] },
    { nome: "Carrossel", peso: 3, assuntos: CARROSSEL_ASSUNTOS, viewsMul: 0.6, engRate: [0.05, 0.09], savesRate: [0.015, 0.045] },
    { nome: "Post Único", peso: 2, assuntos: POST_UNICO_ASSUNTOS, viewsMul: 0.25, engRate: [0.04, 0.08], savesRate: [0.005, 0.015] },
  ];
  function pickFormato(rng, evitar) {
    const pool = evitar ? FORMATOS.filter((f) => f.nome !== evitar) : FORMATOS;
    const total = pool.reduce((s, f) => s + f.peso, 0);
    let r = rng() * total;
    for (const f of pool) {
      if ((r -= f.peso) <= 0) return f;
    }
    return pool[0];
  }
  function pickAssunto(rng, formato, evitar) {
    const pool = evitar ? formato.assuntos.filter((a) => a !== evitar) : formato.assuntos;
    return pick(rng, pool);
  }

  // ---- Geração de posts por revenda (determinística) --------------------------
  const NOWD = new Date();
  function genPosts(rev) {
    const rng = rngFor(rev.key + "|posts");
    const posts = [];
    // Um post a cada 4-9 dias, olhando ~16 semanas para trás.
    let cursor = new Date(NOWD.getTime() - 2 * 86400000); // último post há uns 2 dias
    let n = 0;
    let lastFormatoNome = null;
    let lastAssunto = null;
    // Evita repetir o mesmo formato/assunto duas vezes seguidas — só cosmético,
    // deixa a distribuição visualmente mais rica quando o filtro isola um mês.
    while (cursor.getTime() > NOWD.getTime() - 112 * 86400000) {
      const formato = pickFormato(rng, lastFormatoNome);
      const assunto = pickAssunto(rng, formato, lastAssunto);
      lastFormatoNome = formato.nome;
      lastAssunto = assunto;
      const trend = 1 + n * 0.01; // leve crescimento ao longo do histórico
      const noise = 0.75 + rng() * 0.5;
      const views = Math.max(300, Math.round(rev.avgViews * formato.viewsMul * trend * noise));
      const [engLo, engHi] = formato.engRate;
      const engRate = engLo + rng() * (engHi - engLo);
      const curtidas = Math.round(views * engRate * (0.75 + rng() * 0.2));
      const comentarios = Math.round(curtidas * (0.04 + rng() * 0.08));
      const envios = Math.round(views * (0.004 + rng() * 0.014));
      const republicar = Math.round(views * (0.001 + rng() * 0.004));
      const [savLo, savHi] = formato.savesRate;
      const salvos = Math.round(views * (savLo + rng() * (savHi - savLo)));
      const mencoes = rng() < 0.3 ? int(rng, 1, 4) : 0;
      const visitasPerfil = Math.round(views * (0.01 + rng() * 0.03));
      const toques = Math.round(visitasPerfil * (0.3 + rng() * 0.4));
      const seguidoresGanhos = int(rng, 2, Math.max(3, Math.round(views * 0.006)));
      const seguidoresPerdidos = int(rng, 0, Math.max(1, Math.round(seguidoresGanhos * 0.35)));

      const impulsionado = rng() < 0.25;
      const post = {
        date: cursor.toISOString(),
        assunto,
        formato: formato.nome,
        rede: "Instagram",
        thumb: thumbFor(formato.nome, assunto),
        impulsionado,
        mencoes,
        republicar,
        visitasPerfil,
        toques,
        seguidoresGanhos,
        seguidoresPerdidos,
      };
      if (impulsionado) {
        // Quebra orgânico/patrocinado: o pago soma de 20% a 45% do total.
        const paidShare = 0.2 + rng() * 0.25;
        const split = (total) => {
          const paid = Math.round(total * paidShare);
          return { total, org: total - paid, paid };
        };
        const v = split(views), c = split(curtidas), co = split(comentarios), s = split(salvos), e = split(envios);
        Object.assign(post, {
          visualizacoes: v.total, visualizacoesOrg: v.org, visualizacoesPaid: v.paid,
          curtidas: c.total, curtidasOrg: c.org, curtidasPaid: c.paid,
          comentarios: co.total, comentariosOrg: co.org, comentariosPaid: co.paid,
          salvos: s.total, salvosOrg: s.org, salvosPaid: s.paid,
          envios: e.total, enviosOrg: e.org, enviosPaid: e.paid,
        });
      } else {
        Object.assign(post, { visualizacoes: views, curtidas, comentarios, salvos, envios });
      }
      posts.push(post);
      n++;
      cursor = new Date(cursor.getTime() - int(rng, 4, 9) * 86400000);
    }
    return posts;
  }
  const POSTS_CACHE = {};
  function postsFor(revKey) {
    if (!POSTS_CACHE[revKey]) POSTS_CACHE[revKey] = genPosts(revByKey(revKey));
    return POSTS_CACHE[revKey];
  }

  // ---- Geração de stories por revenda (determinística) -------------------------
  // ★ Réplica do "piso de privacidade" real da Meta: contagens muito baixas
  // voltam como -1 em vez do valor cru (ver clampMetrica/fmtMetrica no
  // dashboard) — mantido aqui para a tela de Stories se comportar como a real.
  function genStories(rev) {
    const rng = rngFor(rev.key + "|stories");
    const rows = [];
    let cursor = new Date(NOWD.getTime() - int(rng, 3, 20) * 3600000); // horas atrás
    let n = 0;
    while (cursor.getTime() > NOWD.getTime() - 30 * 86400000) {
      const noise = 0.7 + rng() * 0.6;
      const impressions = Math.round(rev.followers * (0.12 + rng() * 0.18) * noise);
      const reach = Math.round(impressions * (0.75 + rng() * 0.18));
      const nav = Math.round(reach * (0.35 + rng() * 0.35));
      const forward = Math.round(nav * (0.55 + rng() * 0.25));
      const back = Math.round(nav * (0.08 + rng() * 0.12));
      const exits = Math.max(0, nav - forward - back);
      const repliesRaw = int(rng, 0, 9);
      rows.push({
        revenda: rev.key,
        expirado_em: cursor.toISOString(),
        impressions,
        reach,
        taps_forward: forward,
        taps_back: back,
        exits,
        replies: repliesRaw < 5 && rng() < 0.5 ? -1 : repliesRaw,
      });
      n++;
      cursor = new Date(cursor.getTime() - int(rng, 20, 44) * 3600000);
    }
    return rows;
  }
  const STORIES_CACHE = {};
  function storiesFor(revKey) {
    if (!STORIES_CACHE[revKey]) STORIES_CACHE[revKey] = genStories(revByKey(revKey));
    return STORIES_CACHE[revKey];
  }

  function json(body, status) {
    return new Response(JSON.stringify(body), {
      status: status || 200,
      headers: { "Content-Type": "application/json" },
    });
  }

  const originalFetch = window.fetch.bind(window);

  window.fetch = async function (input, init) {
    const url = typeof input === "string" ? input : input.url;
    const parsed = new URL(url, location.href);
    const path = parsed.pathname;
    const method = (init && init.method ? init.method : "GET").toUpperCase();

    if (path === "/api/relatorios/social" && method === "GET") {
      const revKey = parsed.searchParams.get("revenda") || REVENDAS[0].key;
      const fresh = parsed.searchParams.get("fresh") === "1";
      const rev = revByKey(revKey);
      return json({
        ok: true,
        revenda: rev.key,
        revendaNome: rev.nome,
        revendas: REVENDAS.map((r) => ({ key: r.key, nome: r.nome, username: r.username })),
        updated: new Date().toISOString(),
        cached: !fresh,
        notes: ["Demonstração de portfólio — posts e métricas 100% fictícios, sem conexão real com o Instagram."],
        posts: postsFor(rev.key),
      });
    }

    if (path === "/api/relatorios/stories" && method === "GET") {
      const revKey = parsed.searchParams.get("revenda") || REVENDAS[0].key;
      return json({ ok: true, rows: storiesFor(revKey) });
    }

    return originalFetch(input, init);
  };
})();
