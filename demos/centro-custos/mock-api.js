/* Demo estática do Centro de Custos do Marketing.
   Substitui o backend (Worker + D1) por um array em memória, respondendo ao
   mesmo contrato JSON que o app espera. Edições valem até recarregar.
   O reconhecimento de PDF/imagem (pdf.js + Tesseract.js) continua rodando de
   verdade no navegador — só a GRAVAÇÃO (POST/PATCH/DELETE) é interceptada
   aqui. Envie um recibo real de Meta, LinkedIn ou Google Ads para ver a
   leitura automática funcionando; o cliente é detectado pela conta só se ela
   bater com uma das contas fictícias abaixo (não há contas reais aqui). */
(function () {
  "use strict";
  const API = "/api/centro-custos/recibos";
  const API_CLIENTES = "/api/centro-custos/clientes";
  const API_MESES = "/api/centro-custos/meses";

  // Registro de clientes fictício — mesmas 4 contas usadas nas outras demos
  // (Prisma, Lumina, Fluxora, Zenith), mas com IDs de conta INVENTADOS:
  // nenhum bate com conta real, então o auto-match só funciona com recibos
  // gerados aqui mesmo (upload de um recibo real não casa cliente sozinho).
  const CLIENTES = [
    { key: "prisma", nome: "Prisma", metaAdAccountId: "111100002222",   linkedinAccountId: null,        googleBillingId: "0000-1111-2222" },
    { key: "lumina",    nome: "Lumina",    metaAdAccountId: "222200003333",   linkedinAccountId: "990011223",  googleBillingId: "1111-2222-3333" },
    { key: "fluxora",    nome: "Fluxora",    metaAdAccountId: "333300004444",   linkedinAccountId: null,        googleBillingId: null },
    { key: "zenith",   nome: "Zenith",  metaAdAccountId: "444400005555",   linkedinAccountId: null,        googleBillingId: "2222-3333-4444" },
  ];

  function clientePorConta(fornecedor, contaId) {
    if (!contaId) return null;
    const campo = { meta: "metaAdAccountId", linkedin: "linkedinAccountId", google: "googleBillingId" }[fornecedor];
    if (!campo) return null;
    const c = CLIENTES.find((x) => x[campo] && String(x[campo]) === String(contaId));
    return c ? c.key : null;
  }

  // Recibos fictícios cobrindo três meses, com um caso de "revisão" (cliente
  // não identificado) para mostrar o destaque na tabela.
  let recibos = [
    { id: 1,  fornecedor: "meta",     cliente: "lumina",    conta_id: "222200003333", conta_nome: "Lumina Mídia",       doc_id: "990011223344556-778899001122334", data_pagamento: "2026-07-05", mes_competencia: "2026-07", valor_pago: 4820.30, valor_anuncios: 4390.00, impostos: { COFINS: 158.6, PIS: 34.5, ISS: 60.2 },  competencia_inicio: "2026-06-05", competencia_fim: "2026-07-04", nota: "FBADS-2026-070501", status: "confirmado", problemas: null, arquivo_nome: "recibo-meta-julho.pdf", obs: "" },
    { id: 2,  fornecedor: "google",   cliente: "lumina",    conta_id: "1111-2222-3333", conta_nome: "Lumina",           doc_id: "AB12CD34EF56GH78", data_pagamento: "2026-07-08", mes_competencia: "2026-07", valor_pago: 3150.00, valor_anuncios: 3150.00, impostos: null,                                     competencia_inicio: null,        competencia_fim: null,        nota: null, status: "confirmado", problemas: null, arquivo_nome: "recibo-google-julho.png", obs: "" },
    { id: 3,  fornecedor: "linkedin", cliente: "fluxora",    conta_id: null,           conta_nome: "Fluxora Ads",        doc_id: "LI-2026070912", data_pagamento: "2026-07-09", mes_competencia: "2026-07", valor_pago: 1980.40, valor_anuncios: 1815.00, impostos: { IVA: 5 },                               competencia_inicio: "2026-06-09", competencia_fim: "2026-07-08", nota: null, status: "confirmado", problemas: null, arquivo_nome: "recibo-linkedin-julho.pdf", obs: "" },
    { id: 4,  fornecedor: "meta",     cliente: "fluxora",    conta_id: "333300004444", conta_nome: "Fluxora Marketing",  doc_id: "990011223344557-778899001122335", data_pagamento: "2026-07-14", mes_competencia: "2026-07", valor_pago: 6100.00, valor_anuncios: 5540.00, impostos: { COFINS: 200.1, PIS: 43.5, ISS: 76.4 },  competencia_inicio: "2026-06-14", competencia_fim: "2026-07-13", nota: "FBADS-2026-071401", status: "confirmado", problemas: null, arquivo_nome: "recibo-meta-fluxora-julho.pdf", obs: "" },
    { id: 5,  fornecedor: "meta",     cliente: "prisma", conta_id: "111100002222", conta_nome: "Prisma Institucional", doc_id: "990011223344558-778899001122336", data_pagamento: "2026-08-04", mes_competencia: "2026-08", valor_pago: 2340.90, valor_anuncios: 2130.00, impostos: { COFINS: 76.8, PIS: 16.7, ISS: 29.3 },  competencia_inicio: "2026-07-04", competencia_fim: "2026-08-03", nota: "FBADS-2026-080401", status: "confirmado", problemas: null, arquivo_nome: "recibo-meta-institucional-agosto.pdf", obs: "" },
    { id: 6,  fornecedor: "google",   cliente: "fluxora",    conta_id: null,           conta_nome: "Fluxora",            doc_id: "GH98IJ76KL54MN32", data_pagamento: "2026-08-06", mes_competencia: "2026-08", valor_pago: 4200.00, valor_anuncios: 4200.00, impostos: null,                                     competencia_inicio: null,        competencia_fim: null,        nota: null, status: "revisao",    problemas: ["Conta de anúncio não identificada."], arquivo_nome: "recibo-google-agosto.png", obs: "" },
    { id: 7,  fornecedor: "meta",     cliente: "lumina",    conta_id: "222200003333", conta_nome: "Lumina Mídia",       doc_id: "990011223344559-778899001122337", data_pagamento: "2026-08-10", mes_competencia: "2026-08", valor_pago: 5010.00, valor_anuncios: 4560.00, impostos: { COFINS: 164.4, PIS: 35.8, ISS: 62.5 }, competencia_inicio: "2026-07-10", competencia_fim: "2026-08-09", nota: "FBADS-2026-081001", status: "confirmado", problemas: null, arquivo_nome: "recibo-meta-lumina-agosto.pdf", obs: "" },
    { id: 8,  fornecedor: "linkedin", cliente: "lumina",    conta_id: "990011223",    conta_nome: "Lumina Ads",         doc_id: "LI-2026081512", data_pagamento: "2026-08-15", mes_competencia: "2026-08", valor_pago: 2225.60, valor_anuncios: 2040.00, impostos: { IVA: 5 },                               competencia_inicio: "2026-07-15", competencia_fim: "2026-08-14", nota: null, status: "confirmado", problemas: null, arquivo_nome: "recibo-linkedin-lumina-agosto.pdf", obs: "" },
    { id: 9,  fornecedor: "google",   cliente: "zenith",   conta_id: "2222-3333-4444", conta_nome: "Zenith",       doc_id: "OP65QR43ST21UV09", data_pagamento: "2026-08-18", mes_competencia: "2026-08", valor_pago: 1500.00, valor_anuncios: 1500.00, impostos: null,                                     competencia_inicio: null,        competencia_fim: null,        nota: null, status: "confirmado", problemas: null, arquivo_nome: "recibo-google-zenith-agosto.png", obs: "Campanha do evento" },
    { id: 10, fornecedor: "meta",     cliente: "fluxora",    conta_id: "333300004444", conta_nome: "Fluxora Marketing",  doc_id: "990011223344560-778899001122338", data_pagamento: "2026-09-03", mes_competencia: "2026-09", valor_pago: 6450.20, valor_anuncios: 5860.00, impostos: { COFINS: 212.4, PIS: 46.3, ISS: 81.1 },  competencia_inicio: "2026-08-03", competencia_fim: "2026-09-02", nota: "FBADS-2026-090301", status: "confirmado", problemas: null, arquivo_nome: "recibo-meta-fluxora-setembro.pdf", obs: "" },
    { id: 11, fornecedor: "meta",     cliente: "lumina",    conta_id: "222200003333", conta_nome: "Lumina Mídia",       doc_id: "990011223344561-778899001122339", data_pagamento: "2026-09-06", mes_competencia: "2026-09", valor_pago: 4780.00, valor_anuncios: 4350.00, impostos: { COFINS: 157.1, PIS: 34.2, ISS: 59.7 },  competencia_inicio: "2026-08-06", competencia_fim: "2026-09-05", nota: "FBADS-2026-090601", status: "confirmado", problemas: null, arquivo_nome: "recibo-meta-lumina-setembro.pdf", obs: "" },
    { id: 12, fornecedor: "google",   cliente: null,         conta_id: "9999-0000-1111", conta_nome: "Conta não cadastrada", doc_id: "WX87YZ65AB43CD21", data_pagamento: "2026-09-09", mes_competencia: "2026-09", valor_pago: 980.00,  valor_anuncios: 980.00,  impostos: null,                                     competencia_inicio: null,        competencia_fim: null,        nota: null, status: "revisao",    problemas: ["Conta de anúncio não identificada."], arquivo_nome: "recibo-google-setembro.png", obs: "" },
    { id: 13, fornecedor: "linkedin", cliente: "fluxora",    conta_id: null,           conta_nome: "Fluxora Ads",        doc_id: "LI-2026091210", data_pagamento: "2026-09-12", mes_competencia: "2026-09", valor_pago: 2010.90, valor_anuncios: 1845.00, impostos: { IVA: 5 },                               competencia_inicio: "2026-08-12", competencia_fim: "2026-09-11", nota: null, status: "confirmado", problemas: null, arquivo_nome: "recibo-linkedin-fluxora-setembro.pdf", obs: "" },
  ];

  let nextId = Math.max(0, ...recibos.map((r) => r.id)) + 1;

  function json(body, status) {
    return new Response(JSON.stringify(body), {
      status: status || 200,
      headers: { "Content-Type": "application/json" },
    });
  }
  function parseId(url, base) {
    const m = new URL(url, location.href).pathname.match(new RegExp(base + "/(\\d+)$"));
    return m ? Number(m[1]) : null;
  }

  const originalFetch = window.fetch.bind(window);

  window.fetch = async function (input, init) {
    const url = typeof input === "string" ? input : input.url;
    const method = (init && init.method ? init.method : "GET").toUpperCase();
    const fullUrl = new URL(url, location.href);
    const path = fullUrl.pathname;

    if (path === API_CLIENTES && method === "GET") {
      return json({ ok: true, clientes: CLIENTES.map((c) => ({ key: c.key, nome: c.nome })) });
    }

    if (path === API_MESES && method === "GET") {
      const meses = [...new Set(recibos.map((r) => r.mes_competencia))].sort().reverse();
      return json({ ok: true, meses });
    }

    if (path === API || path.startsWith(API + "/")) {
      if (method === "GET" && path === API) {
        const mes = fullUrl.searchParams.get("mes");
        const lista = mes ? recibos.filter((r) => r.mes_competencia === mes) : recibos.slice();
        return json({ ok: true, recibos: lista });
      }

      if (method === "POST" && path === API) {
        const body = JSON.parse(init.body);
        const fornecedor = String(body.fornecedor || "").trim().toLowerCase();
        const docId = String(body.doc_id || "").trim();
        const dup = recibos.find((r) => r.fornecedor === fornecedor && r.doc_id === docId);
        if (dup) {
          return json({ ok: false, error: `Este recibo já foi lançado (fornecedor "${fornecedor}", doc ${docId}).` }, 409);
        }
        const dataPagamento = String(body.data_pagamento || "").trim();
        const cliente = body.cliente || clientePorConta(fornecedor, body.conta_id) || null;
        const now = new Date().toISOString();
        const novo = {
          id: nextId++,
          fornecedor,
          cliente,
          conta_id: body.conta_id || null,
          conta_nome: body.conta_nome || null,
          doc_id: docId,
          data_pagamento: dataPagamento,
          mes_competencia: dataPagamento.slice(0, 7),
          valor_pago: Number(body.valor_pago) || 0,
          valor_anuncios: body.valor_anuncios == null || body.valor_anuncios === "" ? null : Number(body.valor_anuncios),
          impostos: body.impostos || null,
          competencia_inicio: body.competencia_inicio || null,
          competencia_fim: body.competencia_fim || null,
          nota: body.nota || null,
          status: body.status || "confirmado",
          problemas: body.problemas || null,
          arquivo_nome: body.arquivo_nome || null,
          obs: body.obs || "",
          criado_em: now,
          atualizado_em: now,
          atualizado_por: null,
        };
        recibos.push(novo);
        return json({ ok: true, id: novo.id, recibo: novo }, 201);
      }

      const idAlvo = parseId(url, "/api/centro-custos/recibos");
      if (idAlvo != null) {
        const r = recibos.find((x) => x.id === idAlvo);
        if (!r) return json({ ok: false, error: "recibo não encontrado" }, 404);

        if (method === "PATCH") {
          const body = JSON.parse(init.body);
          if (body.fornecedor !== undefined) r.fornecedor = String(body.fornecedor).trim().toLowerCase();
          if (body.cliente !== undefined) r.cliente = body.cliente || null;
          if (body.conta_nome !== undefined) r.conta_nome = body.conta_nome || null;
          if (body.doc_id !== undefined) r.doc_id = String(body.doc_id).trim();
          if (body.data_pagamento !== undefined) {
            r.data_pagamento = body.data_pagamento;
            r.mes_competencia = String(body.data_pagamento).slice(0, 7);
          }
          if (body.valor_pago !== undefined) r.valor_pago = Number(body.valor_pago) || 0;
          if (body.valor_anuncios !== undefined) r.valor_anuncios = body.valor_anuncios === "" || body.valor_anuncios == null ? null : Number(body.valor_anuncios);
          if (body.obs !== undefined) r.obs = body.obs || "";
          // Corrigir o cliente manualmente tira o recibo da revisão, como no original.
          if (body.cliente && !body.status && r.status === "revisao") r.status = "confirmado";
          if (body.status !== undefined) r.status = body.status;
          r.atualizado_em = new Date().toISOString();
          return json({ ok: true, id: r.id, recibo: r });
        }

        if (method === "DELETE") {
          recibos = recibos.filter((x) => x.id !== idAlvo);
          return json({ ok: true, id: idAlvo });
        }
      }
    }

    return originalFetch(input, init);
  };
})();
