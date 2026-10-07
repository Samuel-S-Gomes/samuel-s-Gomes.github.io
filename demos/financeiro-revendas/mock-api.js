/* Demo estática do Financeiro Revendas.
   Substitui o backend (Worker + D1) por dois arrays em memória, respondendo
   ao mesmo contrato JSON que o app espera. Edições valem até recarregar. */
(function () {
  "use strict";
  const API = "/api/financeiro/contratos";
  const API_OS = "/api/financeiro/ordens";

  let contratos = [
    { id: 1,  revenda: "Vetta Sistemas",       plano: "Pro",                                   valor_mensal: 2200, inicio: "2025-01", fim: "2026-12", status: "ativo",   obs: "", cliente_externo: false },
    { id: 2,  revenda: "Vetta Sistemas",       plano: "Consultoria",                          valor_mensal: 900,  inicio: "2026-01", fim: "2026-06", status: "inativo", obs: "Consultoria pontual encerrada", cliente_externo: false },
    { id: 3,  revenda: "Praxis Contábil",      plano: "Redes Sociais",                        valor_mensal: 1350, inicio: "2025-06", fim: "2026-12", status: "ativo",   obs: "", cliente_externo: false },
    { id: 4,  revenda: "Praxis Contábil",      plano: "E-mail Marketing",                     valor_mensal: 800,  inicio: "2026-03", fim: "2026-12", status: "ativo",   obs: "", cliente_externo: false },
    { id: 5,  revenda: "Zelo Alimentos",       plano: "Geração de Leads + E-mail Marketing",  valor_mensal: 3100, inicio: "2025-01", fim: "2025-12", status: "inativo", obs: "Não renovado", cliente_externo: false },
    { id: 6,  revenda: "Zelo Alimentos",       plano: "Pro",                                   valor_mensal: 2500, inicio: "2026-01", fim: "2026-12", status: "ativo",   obs: "", cliente_externo: false },
    { id: 7,  revenda: "Configura Móveis",     plano: "Design",                                valor_mensal: 1600, inicio: "2025-09", fim: "2026-08", status: "ativo",   obs: "", cliente_externo: false },
    { id: 8,  revenda: "Configura Móveis",     plano: "Redes Sociais",                        valor_mensal: 1100, inicio: "2026-09", fim: "2027-02", status: "ativo",   obs: "Início junto com renovação do Design", cliente_externo: false },
    { id: 9,  revenda: "Bravo Fitness",        plano: "Geração de Leads",                     valor_mensal: 1950, inicio: "2025-11", fim: "2026-10", status: "ativo",   obs: "", cliente_externo: false },
    { id: 10, revenda: "Bravo Fitness",        plano: "Consultoria",                          valor_mensal: 1200, inicio: "2026-01", fim: "2026-04", status: "inativo", obs: "Projeto pontual de reposicionamento", cliente_externo: false },
    { id: 11, revenda: "On Ponto Logística",   plano: "Pro",                                   valor_mensal: 3500, inicio: "2026-02", fim: "2027-01", status: "ativo",   obs: "", cliente_externo: false },
    { id: 12, revenda: "On Ponto Logística",   plano: "E-mail Marketing",                     valor_mensal: 850,  inicio: "2025-05", fim: "2026-02", status: "inativo", obs: "", cliente_externo: false },
  ];

  let ordens = [
    { id: 1,  revenda: "Vetta Sistemas",     plano: "Pro",              valor: 2200, referente_mes: "2026-07", vigencia: "12 meses", parcela: 19, num_servico: "35201", ads: 1500, venc_boleto: "2026-07-10", feita_em: "2026-07-02", status: "ativa",   finalizado: true,  faturado: true,  obs: "" },
    { id: 2,  revenda: "Vetta Sistemas",     plano: "Pro",              valor: 2200, referente_mes: "2026-08", vigencia: "12 meses", parcela: 20, num_servico: "35244", ads: 1500, venc_boleto: "2026-08-10", feita_em: "2026-08-03", status: "ativa",   finalizado: true,  faturado: true,  obs: "" },
    { id: 3,  revenda: "Vetta Sistemas",     plano: "Pro",              valor: 2200, referente_mes: "2026-09", vigencia: "12 meses", parcela: 21, num_servico: "35310", ads: 1600, venc_boleto: "2026-09-10", feita_em: "2026-09-02", status: "ativa",   finalizado: true,  faturado: false, obs: "Aguardando confirmação de pagamento" },
    { id: 4,  revenda: "Praxis Contábil",    plano: "Redes Sociais",    valor: 1350, referente_mes: "2026-08", vigencia: "12 meses", parcela: 15, num_servico: "35198", ads: null, venc_boleto: "2026-08-05", feita_em: "2026-08-01", status: "ativa",   finalizado: true,  faturado: true,  obs: "" },
    { id: 5,  revenda: "Praxis Contábil",    plano: "Redes Sociais",    valor: 1350, referente_mes: "2026-09", vigencia: "12 meses", parcela: 16, num_servico: "35299", ads: null, venc_boleto: "2026-09-05", feita_em: "2026-09-01", status: "ativa",   finalizado: true,  faturado: true,  obs: "" },
    { id: 6,  revenda: "Praxis Contábil",    plano: "E-mail Marketing", valor: 800,  referente_mes: "2026-09", vigencia: "06 meses", parcela: 6,  num_servico: "35300", ads: null, venc_boleto: "2026-09-05", feita_em: "2026-09-01", status: "ativa",   finalizado: false, faturado: false, obs: "" },
    { id: 7,  revenda: "Zelo Alimentos",     plano: "Pro",              valor: 2500, referente_mes: "2026-08", vigencia: "12 meses", parcela: 8,  num_servico: "35180", ads: 2000, venc_boleto: "2026-08-12", feita_em: "2026-08-04", status: "ativa",   finalizado: true,  faturado: true,  obs: "" },
    { id: 8,  revenda: "Zelo Alimentos",     plano: "Pro",              valor: 2500, referente_mes: "2026-09", vigencia: "12 meses", parcela: 9,  num_servico: "35311", ads: 2000, venc_boleto: "2026-09-12", feita_em: "2026-09-05", status: "ativa",   finalizado: false, faturado: false, obs: "" },
    { id: 9,  revenda: "Configura Móveis",   plano: "Design",           valor: 1600, referente_mes: "2026-08", vigencia: "12 meses", parcela: 12, num_servico: "35205", ads: null, venc_boleto: "2026-08-08", feita_em: "2026-08-02", status: "ativa",   finalizado: true,  faturado: true,  obs: "" },
    { id: 10, revenda: "Configura Móveis",   plano: "Redes Sociais",    valor: 1100, referente_mes: "2026-09", vigencia: "06 meses", parcela: 1,  num_servico: "35312", ads: null, venc_boleto: "2026-09-15", feita_em: "2026-09-08", status: "ativa",   finalizado: false, faturado: false, obs: "Contrato novo, primeira parcela" },
    { id: 11, revenda: "Bravo Fitness",      plano: "Geração de Leads", valor: 1950, referente_mes: "2026-08", vigencia: "12 meses", parcela: 10, num_servico: "35210", ads: 2500, venc_boleto: "2026-08-09", feita_em: "2026-08-03", status: "ativa",   finalizado: true,  faturado: true,  obs: "" },
    { id: 12, revenda: "Bravo Fitness",      plano: "Geração de Leads", valor: 1950, referente_mes: "2026-09", vigencia: "12 meses", parcela: 11, num_servico: "35320", ads: 2500, venc_boleto: "2026-09-09", feita_em: "2026-09-03", status: "ativa",   finalizado: false, faturado: false, obs: "" },
    { id: 13, revenda: "On Ponto Logística", plano: "Pro",              valor: 3500, referente_mes: "2026-08", vigencia: "12 meses", parcela: 7,  num_servico: "35220", ads: 3000, venc_boleto: "2026-08-14", feita_em: "2026-08-05", status: "ativa",   finalizado: true,  faturado: true,  obs: "" },
    { id: 14, revenda: "On Ponto Logística", plano: "Pro",              valor: 3500, referente_mes: "2026-09", vigencia: "12 meses", parcela: 8,  num_servico: "35330", ads: 3000, venc_boleto: "2026-09-14", feita_em: "2026-09-06", status: "ativa",   finalizado: false, faturado: false, obs: "" },
    { id: 15, revenda: "Zelo Alimentos",     plano: "Geração de Leads + E-mail Marketing", valor: 3100, referente_mes: "2025-12", vigencia: "12 meses", parcela: 12, num_servico: "34120", ads: 2200, venc_boleto: "2025-12-10", feita_em: "2025-12-02", status: "inativa", finalizado: true, faturado: true, obs: "Última parcela antes do encerramento" },
  ];

  let nextContratoId = Math.max(0, ...contratos.map((c) => c.id)) + 1;
  let nextOrdemId = Math.max(0, ...ordens.map((o) => o.id)) + 1;

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
    const path = new URL(url, location.href).pathname;

    // ---- contratos ----
    if (path === API || path.startsWith(API + "/")) {
      if (method === "GET" && path === API) {
        return json({ ok: true, contratos });
      }
      if (method === "POST" && path === API) {
        const body = JSON.parse(init.body);
        const novo = {
          id: nextContratoId++,
          revenda: body.revenda,
          plano: body.plano,
          valor_mensal: Number(body.valor_mensal) || 0,
          inicio: body.inicio,
          fim: body.fim,
          status: body.status || "ativo",
          obs: body.obs || "",
          cliente_externo: !!body.cliente_externo,
        };
        contratos.push(novo);
        return json({ ok: true, id: novo.id });
      }
      const idPatch = parseId(url, "/api/financeiro/contratos");
      if (idPatch != null) {
        const c = contratos.find((x) => x.id === idPatch);
        if (!c) return json({ ok: false, error: "Contrato não encontrado" }, 404);
        if (method === "PATCH") {
          const body = JSON.parse(init.body);
          Object.assign(c, {
            revenda: body.revenda,
            plano: body.plano,
            valor_mensal: Number(body.valor_mensal) || 0,
            inicio: body.inicio,
            fim: body.fim,
            status: body.status || "ativo",
            obs: body.obs || "",
            cliente_externo: !!body.cliente_externo,
          });
          return json({ ok: true });
        }
        if (method === "DELETE") {
          contratos = contratos.filter((x) => x.id !== idPatch);
          return json({ ok: true });
        }
      }
    }

    // ---- ordens de serviço ----
    if (path === API_OS || path.startsWith(API_OS + "/")) {
      if (method === "GET" && path === API_OS) {
        return json({ ok: true, ordens });
      }
      if (method === "POST" && path === API_OS) {
        const body = JSON.parse(init.body);
        const nova = {
          id: nextOrdemId++,
          revenda: body.revenda,
          plano: body.plano,
          valor: Number(body.valor) || 0,
          referente_mes: body.referente_mes,
          vigencia: body.vigencia || "",
          parcela: body.parcela === "" ? null : Number(body.parcela),
          num_servico: body.num_servico || "",
          ads: body.ads === "" ? null : Number(body.ads),
          venc_boleto: body.venc_boleto || "",
          feita_em: body.feita_em || "",
          status: body.status || "ativa",
          finalizado: !!body.finalizado,
          faturado: !!body.faturado,
          obs: body.obs || "",
        };
        ordens.push(nova);
        return json({ ok: true, id: nova.id });
      }
      const idPatch = parseId(url, "/api/financeiro/ordens");
      if (idPatch != null) {
        const o = ordens.find((x) => x.id === idPatch);
        if (!o) return json({ ok: false, error: "Ordem de serviço não encontrada" }, 404);
        if (method === "PATCH") {
          const body = JSON.parse(init.body);
          Object.assign(o, {
            revenda: body.revenda,
            plano: body.plano,
            valor: Number(body.valor) || 0,
            referente_mes: body.referente_mes,
            vigencia: body.vigencia || "",
            parcela: body.parcela === "" ? null : Number(body.parcela),
            num_servico: body.num_servico || "",
            ads: body.ads === "" ? null : Number(body.ads),
            venc_boleto: body.venc_boleto || "",
            feita_em: body.feita_em || "",
            status: body.status || "ativa",
            finalizado: !!body.finalizado,
            faturado: !!body.faturado,
            obs: body.obs || "",
          });
          return json({ ok: true });
        }
        if (method === "DELETE") {
          ordens = ordens.filter((x) => x.id !== idPatch);
          return json({ ok: true });
        }
      }
    }

    return originalFetch(input, init);
  };
})();
