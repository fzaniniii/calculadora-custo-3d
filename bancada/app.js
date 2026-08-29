/* ==========================================================================
   Bancada — o custo real de fabricar uma peça, e o preço que ela precisa ter.

   Sem framework, sem build. O arquivo se lê de cima para baixo:
   formato, estado, conta, desenho, gestos, ajustes.
   ========================================================================== */

(function () {
  "use strict";

  /* ------------------------------------------------------------ formato -- */

  var fmtBRL = new Intl.NumberFormat("pt-BR", {
    style: "currency", currency: "BRL", minimumFractionDigits: 2
  });

  function brl(v) { return fmtBRL.format(isFinite(v) ? v : 0); }

  function nf(v, casas) {
    return new Intl.NumberFormat("pt-BR", {
      minimumFractionDigits: casas, maximumFractionDigits: casas
    }).format(isFinite(v) ? v : 0);
  }

  /* Casas decimais só quando elas dizem alguma coisa: "45 g" e não
     "45,0 g", mas "45,5 g" quando for o caso. */
  function nfEnxuto(v, casas) {
    return nf(v, casas).replace(/,0+$/, "");
  }

  function tempoTexto(horas) {
    var h = Math.floor(horas);
    var m = Math.round((horas - h) * 60);
    if (m === 60) { h += 1; m = 0; }
    if (h === 0) return m + "min";
    if (m === 0) return h + "h";
    return h + "h" + (m < 10 ? "0" : "") + m;
  }

  var $ = function (s) { return document.querySelector(s); };
  var $$ = function (s) { return Array.prototype.slice.call(document.querySelectorAll(s)); };

  function limita(v, min, max) { return Math.min(Math.max(v, min), max); }

  /* Tique curto. O iOS não expõe a API de vibração ao Safari, então isso é
     um presente para quem abrir no Android; em iPhone simplesmente não faz
     nada, e nada é melhor do que fingir que faz.
     O navegador recusa vibrar antes do primeiro toque e reclama no console
     a cada tentativa, então só perguntamos depois que houve um. */
  var houveToque = false;
  document.addEventListener("pointerdown", function () { houveToque = true; },
                            { once: true, capture: true });

  function tique(ms) {
    if (!houveToque || !navigator.vibrate) return;
    try { navigator.vibrate(ms || 8); } catch (err) {}
  }

  /* ------------------------------------------------------------- estado -- */

  var CHAVE = "bancada.v1";
  var VERSAO = "1.0.0";

  var PADRAO = {
    /* a placa */
    gramas: 45, horas: 3, minutos: 30, naMesa: 1, pedido: 1, filamento: "pla",
    /* o preço */
    margem: 40, desconto: 0,
    /* impressora */
    potencia: 130, deprecHora: 1.20, manutHora: 0.20,
    valorImpressora: 6000, vidaUtil: 5000,
    /* energia */
    tarifa: 0.92214,
    /* trabalho */
    acabamento: 10, valorHora: 30, falhas: 10,
    /* vender */
    embalagem: 0, frete: 0, taxaVenda: 0, imposto: 0,
    /* materiais */
    filamentos: [
      { id: "pla",  nome: "PLA",      precoKg: 92.5, cor: "#c9c4bb" },
      { id: "petg", nome: "PETG",     precoKg: 110,  cor: "#7fa8b8" },
      { id: "silk", nome: "PLA Silk", precoKg: 118,  cor: "#d3a24a" },
      { id: "tpu",  nome: "TPU",      precoKg: 165,  cor: "#6f8f74" }
    ]
  };

  var e = {};

  function carrega() {
    var bruto = null;
    try { bruto = JSON.parse(localStorage.getItem(CHAVE) || "null"); } catch (err) {}
    e = {};
    Object.keys(PADRAO).forEach(function (k) {
      e[k] = PADRAO[k] && PADRAO[k].slice ? PADRAO[k].slice() : PADRAO[k];
    });
    if (bruto && typeof bruto === "object") {
      Object.keys(PADRAO).forEach(function (k) {
        if (bruto[k] !== undefined && bruto[k] !== null) e[k] = bruto[k];
      });
    }
    if (!Array.isArray(e.filamentos) || !e.filamentos.length) {
      e.filamentos = PADRAO.filamentos.slice();
    }
    if (!filamentoAtual()) e.filamento = e.filamentos[0].id;
  }

  var gravaAgendada = null;
  function grava() {
    if (gravaAgendada) return;
    gravaAgendada = setTimeout(function () {
      gravaAgendada = null;
      try { localStorage.setItem(CHAVE, JSON.stringify(e)); } catch (err) {}
    }, 220);
  }

  function filamentoAtual() {
    for (var i = 0; i < e.filamentos.length; i++) {
      if (e.filamentos[i].id === e.filamento) return e.filamentos[i];
    }
    return null;
  }

  /* O estado precisa existir antes de qualquer campo se ligar a ele: quem
     lê `e` na hora de montar o formulário leria vazio. */
  carrega();

  /* --------------------------------------------------------------- conta --
     O preço se monta em partes verificáveis, sem multiplicador mágico.

     Custo de fabricar é da placa inteira e se divide pelas peças que cabem
     na mesa. Acabamento, embalagem e frete são de cada peça.

     Margem, taxa da plataforma e imposto saem todos da mesma receita, então
     entram juntos num único divisor: quem paga os três é o preço, não o
     custo. Com 40% de margem, 12% de taxa e 6% de imposto, o preço precisa
     ser o custo dividido por 0,42.

     O desconto sai do preço anunciado e quem o absorve é o lucro: a taxa e
     o imposto continuam incidindo sobre o que o cliente de fato paga. */

  function conta() {
    var horas = e.horas + e.minutos / 60;
    var naMesa = Math.max(Math.floor(e.naMesa) || 1, 1);
    var pedido = Math.max(Math.floor(e.pedido) || 1, 1);
    var fil = filamentoAtual() || { precoKg: 0, nome: "" };

    /* --- fabricar, da placa inteira --- */
    var material = (e.gramas / 1000) * fil.precoKg;
    var kwh      = (e.potencia / 1000) * horas;
    var energia  = kwh * e.tarifa;
    var deprec   = e.deprecHora * horas;
    var manut    = e.manutHora * horas;
    var placa    = material + energia + deprec + manut;

    /* --- por peça --- */
    var fab      = placa / naMesa;
    var acab     = (e.acabamento / 60) * e.valorHora;
    var falhas   = limita(e.falhas, 0, 90) / 100;
    var reserva  = (fab + acab) * falhas;
    var embalagem = Math.max(e.embalagem, 0);
    var frete     = Math.max(e.frete, 0);
    var custo    = fab + acab + reserva + embalagem + frete;

    /* --- preço --- */
    var margem = limita(e.margem, 0, 90) / 100;
    var taxa   = limita(e.taxaVenda, 0, 60) / 100;
    var imposto = limita(e.imposto, 0, 40) / 100;

    /* Os três saem da mesma receita. Se somarem quase 100%, não existe
       preço que feche: o teto de 95% mantém a conta finita e o aviso
       explica o que aconteceu. */
    var somaSaidas = Math.min(margem + taxa + imposto, 0.95);
    var estourou = margem + taxa + imposto > 0.95;
    var precoCheio = custo / (1 - somaSaidas);

    var desc = limita(e.desconto, 0, 60) / 100;
    var preco = precoCheio * (1 - desc);

    var vTaxa    = preco * taxa;
    var vImposto = preco * imposto;
    var lucro    = preco - vTaxa - vImposto - custo;
    var margemReal = preco > 0 ? lucro / preco : 0;

    /* --- pedido --- */
    var placas = Math.ceil(pedido / naMesa);
    var horasTotais = placas * horas;
    var totalPedido = preco * pedido;
    var lucroTotal = lucro * pedido;
    var porHora = horasTotais > 0 ? lucroTotal / horasTotais : 0;
    var vagas = placas * naMesa - pedido;

    return {
      horas: horas, naMesa: naMesa, pedido: pedido, fil: fil,
      material: material / naMesa, energia: energia / naMesa,
      maquina: (deprec + manut) / naMesa, kwh: kwh / naMesa,
      fab: fab, acab: acab, reserva: reserva, falhas: falhas,
      embalagem: embalagem, frete: frete, custo: custo,
      taxa: taxa, imposto: imposto, vTaxa: vTaxa, vImposto: vImposto,
      margem: margem, desc: desc, precoCheio: precoCheio, preco: preco,
      lucro: lucro, margemReal: margemReal, estourou: estourou,
      placas: placas, horasTotais: horasTotais, totalPedido: totalPedido,
      lucroTotal: lucroTotal, porHora: porHora, vagas: vagas
    };
  }

  /* ---------------------------------------------------------------- cor --
     Saúde por faixa, não por posição na régua. Margem de 40% é saudável
     mesmo estando no meio de um curso que vai até 90: quem decide a cor é
     o número, não onde o pino parou. */

  function corMargem(v) {
    if (v < 12) return "var(--rampa-0)";
    if (v < 22) return "var(--rampa-1)";
    if (v < 32) return "var(--rampa-2)";
    return "var(--rampa-3)";
  }

  /* Desconto zero é o estado normal, não uma conquista: fica neutro. */
  function corDesconto(v) {
    if (v <= 0) return "var(--tinta-3)";
    if (v < 10) return "var(--rampa-3)";
    if (v < 20) return "var(--rampa-2)";
    if (v < 35) return "var(--rampa-1)";
    return "var(--rampa-0)";
  }

  /* -------------------------------------------------------------- desenho -- */

  var el = {};
  ["preco", "precoNota", "cimeira", "trilho", "gramas", "tempo", "naMesa", "pedido",
   "dicaGramas", "dicaPedido", "pedTotal", "pedPlacas", "pedHora", "avisoPedido",
   "barra", "extrato", "avisoMargem", "multiplicador", "notaSoma", "subDeprec",
   "subVida", "subCalculo", "subFalhas", "notaVersao", "listaFilamentos"
  ].forEach(function (id) { el[id] = document.getElementById(id); });

  var FAIXAS = [
    { chave: "material",  nome: "Filamento",      cor: "--f-filamento" },
    { chave: "energia",   nome: "Energia",        cor: "--f-energia" },
    { chave: "maquina",   nome: "Máquina",        cor: "--f-maquina" },
    { chave: "acab",      nome: "Acabamento",     cor: "--f-acabamento" },
    { chave: "reserva",   nome: "Risco",          cor: "--f-risco" },
    { chave: "venda",     nome: "Custos de venda",cor: "--f-taxa" },
    { chave: "lucro",     nome: "Lucro",          cor: "--f-lucro" }
  ];

  function desenhaBarra(d) {
    var venda = d.embalagem + d.frete + d.vTaxa + d.vImposto;
    var valores = {
      material: d.material, energia: d.energia, maquina: d.maquina,
      acab: d.acab, reserva: d.reserva, venda: venda,
      lucro: Math.max(d.lucro, 0)
    };
    var soma = 0;
    FAIXAS.forEach(function (f) { soma += valores[f.chave]; });
    if (soma <= 0) soma = 1;

    var html = "";
    FAIXAS.forEach(function (f) {
      var pc = (valores[f.chave] / soma) * 100;
      if (pc < 0.4) return;
      html += '<span class="barra-parte" style="flex:0 0 ' + pc.toFixed(2) +
              '%;background:var(' + f.cor + ')" title="' + f.nome + '"></span>';
    });
    el.barra.innerHTML = html;
  }

  function linha(o) {
    var tinta = o.cor ? '<span class="linha-tinta" style="background:var(' + o.cor + ')"></span>'
                      : '<span></span>';
    return '<div class="linha"' + (o.peso ? ' data-peso="' + o.peso + '"' : "") +
           (o.sinal ? ' data-sinal="' + o.sinal + '"' : "") + '>' + tinta +
           '<span class="linha-nome">' + o.nome +
           (o.sub ? '<span class="linha-sub">' + o.sub + "</span>" : "") + "</span>" +
           '<span class="linha-valor num">' + o.valor + "</span></div>";
  }

  function desenhaExtrato(d) {
    var h = "";

    h += linha({ cor: "--f-filamento", nome: "Filamento",
                 sub: nfEnxuto(e.gramas / d.naMesa, 1) + " g de " + d.fil.nome,
                 valor: brl(d.material) });
    h += linha({ cor: "--f-energia", nome: "Energia",
                 sub: nf(d.kwh, 2) + " kWh", valor: brl(d.energia) });
    h += linha({ cor: "--f-maquina", nome: "Máquina",
                 sub: "depreciação e manutenção", valor: brl(d.maquina) });
    h += linha({ nome: "Custo de imprimir", peso: "soma",
                 sub: d.naMesa > 1 ? "a placa dividida por " + d.naMesa + " peças" : null,
                 valor: brl(d.fab) });

    if (d.acab > 0) {
      h += linha({ cor: "--f-acabamento", nome: "Acabamento",
                   sub: nf(e.acabamento, 0) + " min a " + brl(e.valorHora) + " a hora",
                   valor: brl(d.acab) });
    }
    if (d.reserva > 0) {
      h += linha({ cor: "--f-risco", nome: "Reserva para falhas",
                   sub: nf(d.falhas * 100, 0) + "% do que veio acima",
                   valor: brl(d.reserva) });
    }
    if (d.embalagem > 0) {
      h += linha({ cor: "--f-taxa", nome: "Embalagem", valor: brl(d.embalagem) });
    }
    if (d.frete > 0) {
      h += linha({ cor: "--f-taxa", nome: "Frete", sub: "que sai do seu bolso",
                   valor: brl(d.frete) });
    }

    h += linha({ nome: "Seu custo", peso: "soma", valor: brl(d.custo) });

    if (d.vTaxa > 0) {
      h += linha({ cor: "--f-taxa", nome: "Taxa da plataforma",
                   sub: nf(d.taxa * 100, 0) + "% do preço", valor: brl(d.vTaxa) });
    }
    if (d.vImposto > 0) {
      h += linha({ cor: "--f-taxa", nome: "Imposto",
                   sub: nf(d.imposto * 100, 1) + "% do preço", valor: brl(d.vImposto) });
    }

    h += linha({ cor: "--f-lucro", nome: "Seu lucro",
                 sub: "margem de " + nf(d.margemReal * 100, 0) + "%",
                 valor: brl(d.lucro) });

    if (d.desc > 0) {
      h += linha({ nome: "Desconto", sinal: "menos",
                   sub: nf(d.desc * 100, 0) + "% sobre " + brl(d.precoCheio),
                   valor: "− " + brl(d.precoCheio - d.preco) });
    }

    h += linha({ nome: "Preço por peça", peso: "total", valor: brl(d.preco) });

    el.extrato.innerHTML = h;
  }

  function desenhaAvisos(d) {
    /* Margem */
    var texto = null, tom = "";
    if (d.estourou) {
      texto = "Margem, taxa e imposto somam mais de 95% do preço. Não existe " +
              "preço que cubra isso: <b>baixe a margem</b> ou saia dessa plataforma.";
      tom = "alerta";
    } else if (d.lucro <= 0) {
      texto = "Nesse preço você <b>paga para trabalhar</b>. " +
              (d.desc > 0 ? "O desconto comeu o lucro inteiro."
                          : "Aumente a margem ou corte custo.");
      tom = "alerta";
    } else if (d.desc > 0 && d.margemReal < d.margem * 0.55) {
      texto = "O desconto derrubou sua margem de <b>" + nf(d.margem * 100, 0) +
              "% para " + nf(d.margemReal * 100, 0) + "%</b>.";
      tom = "alerta";
    } else if (d.preco > 0 && d.margemReal < 0.15) {
      texto = "Margem de " + nf(d.margemReal * 100, 0) + "% deixa pouca folga para " +
              "erro de orçamento.";
    }
    el.avisoMargem.hidden = !texto;
    if (texto) { el.avisoMargem.innerHTML = texto; el.avisoMargem.dataset.tom = tom; }

    /* Pedido */
    var p = null;
    if (d.vagas > 0 && d.placas > 0) {
      p = "A última placa vai com <b>" + d.vagas + " " +
          (d.vagas === 1 ? "vaga" : "vagas") + " sobrando</b>. " +
          "Encaixando mais " + d.vagas + ", o tempo de máquina é o mesmo.";
    }
    el.avisoPedido.hidden = !p;
    if (p) el.avisoPedido.innerHTML = p;
  }

  function desenha() {
    var d = conta();

    /* Cimeira */
    el.preco.innerHTML = '<span class="preco-cifra">R$</span>' +
                         nf(d.preco, 2);
    el.precoNota.innerHTML = d.pedido > 1
      ? "<b>" + d.pedido + " peças</b> por " + brl(d.totalPedido) + " · " +
        tempoTexto(d.horasTotais)
      : "uma peça · " + tempoTexto(d.horas) + " de impressão";

    /* Dicas nas células */
    el.dicaGramas.textContent = brl(d.material * d.naMesa) + " de " + d.fil.nome;
    el.dicaPedido.textContent = d.placas === 1 ? "uma placa"
                                               : d.placas + " placas";

    /* Pedido */
    el.pedTotal.textContent = brl(d.totalPedido);
    el.pedPlacas.innerHTML = d.placas + '<small> × ' + tempoTexto(d.horas) + "</small>";
    el.pedHora.textContent = brl(d.porHora);
    el.pedHora.style.color = d.porHora <= 0 ? "var(--rampa-0)" : "";

    /* Multiplicador: consequência, nunca entrada. */
    el.multiplicador.textContent = d.custo > 0
      ? nf(d.preco / d.custo, 2).replace(",00", "") + "× o custo" : "";

    desenhaBarra(d);
    desenhaExtrato(d);
    desenhaAvisos(d);

    /* Ajustes que exibem uma conta derivada */
    if (el.subDeprec) {
      el.subDeprec.textContent = brl(d.maquina * d.naMesa - e.manutHora * d.horas) +
                                 " nesta placa";
    }
    if (el.subVida) el.subVida.textContent = "horas até valer a troca";
    if (el.subCalculo) {
      var ph = e.vidaUtil > 0 ? e.valorImpressora / e.vidaUtil : 0;
      el.subCalculo.textContent = brl(e.valorImpressora) + " ÷ " + nf(e.vidaUtil, 0) +
                                  " h = " + brl(ph) + " por hora";
    }
    if (el.subFalhas) {
      el.subFalhas.textContent = e.falhas > 0
        ? "1 em cada " + nf(100 / Math.max(e.falhas, 1), 0) + " impressões dá errado"
        : "sem reserva: a peça perdida sai do lucro";
    }
    if (el.notaSoma) {
      var soma = e.margem + e.taxaVenda + e.imposto;
      el.notaSoma.textContent = "Margem, taxa e imposto somam " + nf(soma, 0) +
        "% do preço. O que sobra, " + nf(100 - soma, 0) + "%, é o que paga o custo.";
    }

    grava();
    return d;
  }

  /* --------------------------------------------------------------- mola --
     Integrador de mola criticamente amortecida. Anima a partir do valor que
     está na tela, com a velocidade que o dedo tinha ao soltar, para não
     existir emenda entre arrastar e assentar. */

  function mola(de, para, v0, aoQuadro, aoFim) {
    var w = 2 * Math.PI / 0.34;   /* resposta de 340ms */
    var x = de - para, v = v0 || 0;
    var t0 = performance.now(), id;
    function passo(t) {
      var dt = Math.min((t - t0) / 1000, 1 / 30);
      t0 = t;
      v += (-w * w * x - 2 * w * v) * dt;
      x += v * dt;
      if (Math.abs(x) < 0.002 && Math.abs(v) < 0.01) {
        aoQuadro(para);
        if (aoFim) aoFim();
        return;
      }
      aoQuadro(para + x);
      id = requestAnimationFrame(passo);
    }
    id = requestAnimationFrame(passo);
    return function () { cancelAnimationFrame(id); };
  }

  /* Resistência progressiva na borda. Coisa de verdade desacelera antes de
     parar; parede invisível parece travamento. */
  function elastico(passou, largura) {
    var c = 0.55;
    return (passou * largura * c) / (largura + c * Math.abs(passou));
  }

  /* -------------------------------------------------------------- régua --
     Arrasto 1:1 respeitando onde o dedo pegou, elástico fora dos limites,
     assentamento por mola com a velocidade da soltura. */

  function montaRegua(raiz, opcoes) {
    var pista = raiz.querySelector(".regua-pista");
    var cheio = raiz.querySelector("[data-cheio]");
    var pino = raiz.querySelector("[data-pino]");
    var texto = raiz.querySelector("[data-valor]");
    var min = opcoes.min, max = opcoes.max;
    var valor = opcoes.valor();
    var arrastando = false, cancelaMola = null, ultimoTique = null;
    var historico = [];

    var RAIO = 14;   /* metade do pino: o curso é encurtado nos dois lados
                        para o pino nunca vazar da pista */

    function pinta(v) {
      var limpo = limita(v, min, max);
      var t = (limpo - min) / (max - min);
      var curso = Math.max(pista.clientWidth - RAIO * 2, 1);
      var x = RAIO + t * curso;

      cheio.style.width = x + "px";
      pino.style.transform = "translate3d(" + x + "px,0,0)";

      var cor = opcoes.cor(limpo);
      cheio.style.background = cor;
      texto.style.color = cor;
      texto.textContent = Math.round(limpo) + "%";
      pista.setAttribute("aria-valuenow", String(Math.round(limpo)));
      pista.setAttribute("aria-valuetext", Math.round(limpo) + " por cento");
    }

    /* Durante o arrasto a posição pode passar do limite; o valor entregue à
       conta, nunca. */
    function mostra(bruto) {
      valor = bruto;
      pinta(bruto);
    }

    function aplica(bruto) {
      var v = Math.round(limita(bruto, min, max));
      if (v !== ultimoTique) { tique(6); ultimoTique = v; }
      opcoes.aplica(v);
    }

    function curso() {
      return Math.max(pista.getBoundingClientRect().width - RAIO * 2, 1);
    }

    function deX(clientX) {
      var r = pista.getBoundingClientRect();
      return min + ((clientX - r.left - RAIO) / curso()) * (max - min);
    }

    pista.addEventListener("pointerdown", function (ev) {
      if (cancelaMola) { cancelaMola(); cancelaMola = null; }
      pista.setPointerCapture(ev.pointerId);
      pista.dataset.arrastando = "sim";
      arrastando = true;
      historico = [{ x: ev.clientX, t: performance.now() }];

      /* Pegou no pino: respeita o deslocamento. Tocou na pista: o pino vem
         até o dedo, porque o toque direto na pista é uma ordem, não um
         arrasto. */
      var r = pista.getBoundingClientRect();
      var posPino = r.left + RAIO +
                    (limita(valor, min, max) - min) / (max - min) * curso();
      pista._delta = Math.abs(ev.clientX - posPino) < 22 ? ev.clientX - posPino : 0;

      var alvo = deX(ev.clientX - pista._delta);
      mostra(limita(alvo, min, max));
      aplica(alvo);
      ev.preventDefault();
    });

    pista.addEventListener("pointermove", function (ev) {
      if (!arrastando) return;
      historico.push({ x: ev.clientX, t: performance.now() });
      if (historico.length > 5) historico.shift();

      var bruto = deX(ev.clientX - pista._delta);
      var largura = max - min;
      if (bruto > max) bruto = max + elastico(bruto - max, largura * 0.35);
      else if (bruto < min) bruto = min - elastico(min - bruto, largura * 0.35);

      mostra(bruto);
      aplica(bruto);
    });

    function solta(ev) {
      if (!arrastando) return;
      arrastando = false;
      delete pista.dataset.arrastando;
      ultimoTique = null;

      /* Velocidade em unidades por segundo, tirada do histórico curto. */
      var vel = 0;
      if (historico.length > 1) {
        var a = historico[0], b = historico[historico.length - 1];
        var dt = (b.t - a.t) / 1000;
        if (dt > 0) vel = ((b.x - a.x) / curso()) * (max - min) / dt;
      }

      var destino = Math.round(limita(valor, min, max));
      cancelaMola = mola(valor, destino, vel, function (v) {
        mostra(v);
      }, function () {
        cancelaMola = null;
        opcoes.aplica(destino);
      });
      opcoes.aplica(destino);
      if (ev) ev.preventDefault();
    }

    pista.addEventListener("pointerup", solta);
    pista.addEventListener("pointercancel", solta);

    pista.addEventListener("keydown", function (ev) {
      var passo = ev.shiftKey ? 10 : 1, v = Math.round(limita(valor, min, max));
      if (ev.key === "ArrowRight" || ev.key === "ArrowUp") v += passo;
      else if (ev.key === "ArrowLeft" || ev.key === "ArrowDown") v -= passo;
      else if (ev.key === "Home") v = min;
      else if (ev.key === "End") v = max;
      else return;
      ev.preventDefault();
      v = limita(v, min, max);
      mostra(v);
      opcoes.aplica(v);
    });

    return {
      sincroniza: function () {
        if (arrastando) return;
        valor = opcoes.valor();
        pinta(valor);
      }
    };
  }

  /* ------------------------------------------------------------- gavetas --
     Entram e saem pelo mesmo caminho. Arrastar para baixo fecha, e a
     decisão é por velocidade, não por distância: um peteleco basta. */

  var gavetaAberta = null;

  function abreGaveta(nome) {
    var g = document.querySelector('[data-gaveta="' + nome + '"]');
    var c = document.querySelector('[data-cortina="' + nome + '"]');
    if (!g) return;
    gavetaAberta = nome;
    c.dataset.aberta = "sim";
    g.dataset.aberta = "sim";
    g.style.transform = "";
    document.body.style.overflow = "hidden";
    var foco = g.querySelector("input, button");
    if (foco && !("ontouchstart" in window)) foco.focus({ preventScroll: true });
  }

  function fechaGaveta(nome) {
    nome = nome || gavetaAberta;
    var g = document.querySelector('[data-gaveta="' + nome + '"]');
    var c = document.querySelector('[data-cortina="' + nome + '"]');
    if (!g) return;
    delete g.dataset.aberta;
    delete c.dataset.aberta;
    g.style.transform = "";
    document.body.style.overflow = "";
    if (gavetaAberta === nome) gavetaAberta = null;
  }

  $$("[data-gaveta]").forEach(function (g) {
    var nome = g.dataset.gaveta;
    var alca = g.querySelector("[data-alca]");
    var corpo = g.querySelector(".gaveta-corpo");
    var y = 0, arrastando = false, historico = [], inicio = null;
    var LIMIAR = 10;   /* px antes de chamar o gesto de arrasto */

    function comeca(ev) {
      /* Botão, campo e roleta cuidam dos próprios gestos: se a gaveta
         capturar o ponteiro aqui, o clique é entregue a ela e nunca chega
         ao botão que o usuário apertou. */
      if (ev.target.closest("button, input, a, label, .roleta")) return;

      /* Só arrasta pela alça, ou pelo corpo quando ele já está no topo. */
      if (!alca.contains(ev.target) && corpo.scrollTop > 0) return;

      inicio = { y: ev.clientY, id: ev.pointerId };
      historico = [{ y: ev.clientY, t: performance.now() }];
      y = 0;
      /* Repare que nada é capturado ainda. A captura só acontece quando o
         dedo anda o bastante para a intenção ser inequívoca. */
    }

    function move(ev) {
      if (!inicio || ev.pointerId !== inicio.id) return;
      historico.push({ y: ev.clientY, t: performance.now() });
      if (historico.length > 5) historico.shift();

      var d = ev.clientY - inicio.y;
      if (!arrastando) {
        if (Math.abs(d) < LIMIAR) return;
        arrastando = true;
        g.dataset.arrastando = "sim";
        g.setPointerCapture(inicio.id);
      }

      /* Para cima resiste em vez de travar. */
      y = d < 0 ? -elastico(-d, g.clientHeight * 0.4) : d;
      g.style.transform = "translate3d(0," + y + "px,0)";
    }

    function solta() {
      if (!inicio) return;
      var eraArrasto = arrastando;
      inicio = null;
      arrastando = false;
      if (!eraArrasto) return;   /* foi um toque: deixa o clique seguir */

      delete g.dataset.arrastando;

      var vel = 0;
      if (historico.length > 1) {
        var a = historico[0], b = historico[historico.length - 1];
        var dt = b.t - a.t;
        if (dt > 0) vel = (b.y - a.y) / dt;   /* px por ms */
      }
      g.style.transform = "";
      /* Decide por velocidade antes de decidir por distância: um peteleco
         curto e rápido também quer dizer "fecha". */
      if (vel > 0.45 || y > g.clientHeight * 0.32) fechaGaveta(nome);
    }

    g.addEventListener("pointerdown", comeca);
    g.addEventListener("pointermove", move);
    g.addEventListener("pointerup", solta);
    g.addEventListener("pointercancel", solta);

    g.querySelectorAll("[data-fechar]").forEach(function (b) {
      b.addEventListener("click", function () { fechaGaveta(nome); });
    });
  });

  $$("[data-cortina]").forEach(function (c) {
    c.addEventListener("click", function () { fechaGaveta(c.dataset.cortina); });
  });

  document.addEventListener("keydown", function (ev) {
    if (ev.key === "Escape" && gavetaAberta) fechaGaveta();
  });

  /* -------------------------------------------------------------- roleta --
     Encaixe nativo. A rolagem do iOS já tem inércia, borracha na ponta e
     desaceleração afinada por gente que faz isso há quinze anos; escrever
     a minha só pioraria. */

  function montaRoleta(elem, quantos, formata, aoMudar) {
    var ul = document.createElement("ul");
    for (var i = 0; i < quantos; i++) {
      var li = document.createElement("li");
      li.textContent = formata(i);
      li.dataset.v = i;
      li.setAttribute("role", "option");
      ul.appendChild(li);
    }
    elem.innerHTML = "";
    elem.appendChild(ul);

    var itens = Array.prototype.slice.call(ul.children);
    var ALTURA = 44;
    var atual = 0, quadro = null, fim = null;
    /* Enquanto uma rolagem nossa está a caminho, os eventos de rolagem são
       ignorados: o valor já é conhecido, e ler posições intermediárias faria
       o preço piscar valores errados no meio do trajeto. */
    var travadoAte = 0;

    function marca(v) {
      itens.forEach(function (li, i) {
        li.setAttribute("aria-selected", i === v ? "true" : "false");
      });
    }

    function lê() {
      return limita(Math.round(elem.scrollTop / ALTURA), 0, quantos - 1);
    }

    function vaiPara(v, suave) {
      atual = limita(v, 0, quantos - 1);
      marca(atual);
      travadoAte = performance.now() + (suave ? 520 : 120);
      if (suave && elem.scrollTo) {
        elem.scrollTo({ top: atual * ALTURA, behavior: "smooth" });
      } else {
        elem.scrollTop = atual * ALTURA;
      }
    }

    /* Clicar no número é a forma de escolher que funciona igual no dedo e no
       mouse. Rolagem com encaixe é boa no toque e sofrível na roda, então
       ela deixa de ser o único caminho. */
    ul.addEventListener("click", function (ev) {
      var li = ev.target.closest("li");
      if (!li) return;
      var v = +li.dataset.v;
      vaiPara(v, true);
      aoMudar(v);
      tique(8);
    });

    elem.addEventListener("keydown", function (ev) {
      var v = atual;
      if (ev.key === "ArrowDown") v += 1;
      else if (ev.key === "ArrowUp") v -= 1;
      else if (ev.key === "PageDown") v += 5;
      else if (ev.key === "PageUp") v -= 5;
      else if (ev.key === "Home") v = 0;
      else if (ev.key === "End") v = quantos - 1;
      else return;
      ev.preventDefault();
      v = limita(v, 0, quantos - 1);
      vaiPara(v, false);
      aoMudar(v);
    });

    elem.addEventListener("scroll", function () {
      if (performance.now() < travadoAte) return;
      if (!quadro) {
        quadro = requestAnimationFrame(function () {
          quadro = null;
          var v = lê();
          if (v !== atual) { atual = v; marca(v); tique(5); }
        });
      }
      clearTimeout(fim);
      fim = setTimeout(function () {
        var v = lê();
        atual = v;
        marca(v);
        aoMudar(v);
      }, 130);
    }, { passive: true });

    return {
      põe: function (v) { vaiPara(v, false); }
    };
  }

  /* ---------------------------------------------------------- filamentos -- */

  function desenhaTrilho() {
    var h = "";
    e.filamentos.forEach(function (f) {
      h += '<button class="fita" role="option" data-id="' + f.id + '" type="button"' +
           ' aria-selected="' + (f.id === e.filamento) + '">' +
           '<span class="fita-gota" style="background:' + f.cor + '"></span>' +
           '<span class="fita-texto"><span class="fita-nome">' + f.nome + "</span>" +
           '<span class="fita-preco">' + brl(f.precoKg) + "/kg</span></span></button>";
    });
    h += '<button class="fita fita-mais" id="maisFilamento" type="button" aria-label="Editar filamentos">' +
         '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" ' +
         'stroke-linecap="round" width="19" height="19" aria-hidden="true">' +
         '<path d="M12 6v12M6 12h12"/></svg></button>';
    el.trilho.innerHTML = h;

    el.trilho.querySelectorAll(".fita[data-id]").forEach(function (b) {
      b.addEventListener("click", function () {
        e.filamento = b.dataset.id;
        desenhaTrilho();
        desenha();
        tique(8);
      });
    });
    document.getElementById("maisFilamento")
      .addEventListener("click", function () { desenhaLista(); abreGaveta("filamentos"); });
  }

  function desenhaLista() {
    if (!e.filamentos.length) {
      el.listaFilamentos.innerHTML =
        '<div class="vazio"><b>Nenhum filamento</b>Adicione o que você tem na prateleira ' +
        "e o preço do quilo que pagou por ele.</div>";
      return;
    }
    var h = "";
    e.filamentos.forEach(function (f, i) {
      h += '<div class="item">' +
           '<span class="fita-gota" style="background:' + f.cor + '"></span>' +
           '<span class="item-texto">' +
           '<input type="text" data-campo="nome" data-i="' + i + '" value="' +
           f.nome.replace(/"/g, "&quot;") + '" maxlength="24" ' +
           'style="width:100%;text-align:left;font-size:15px;font-weight:400" ' +
           'aria-label="Nome do filamento"></span>' +
           '<input type="number" data-campo="precoKg" data-i="' + i + '" value="' +
           f.precoKg + '" min="0" step="0.5" inputmode="decimal" aria-label="Preço por quilo">' +
           '<span class="item-un">/kg</span>' +
           '<button class="btn btn-icone" data-remove="' + i + '" type="button" ' +
           'aria-label="Remover ' + f.nome + '">' +
           '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" ' +
           'stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>' +
           "</button></div>";
    });
    el.listaFilamentos.innerHTML = h;

    el.listaFilamentos.querySelectorAll("[data-campo]").forEach(function (inp) {
      inp.addEventListener("input", function () {
        var f = e.filamentos[+inp.dataset.i];
        if (!f) return;
        if (inp.dataset.campo === "nome") f.nome = inp.value;
        else f.precoKg = parseFloat(inp.value.replace(",", ".")) || 0;
        desenhaTrilho();
        desenha();
      });
    });

    el.listaFilamentos.querySelectorAll("[data-remove]").forEach(function (b) {
      b.addEventListener("click", function () {
        if (e.filamentos.length <= 1) return;
        var i = +b.dataset.remove;
        var removido = e.filamentos[i];
        e.filamentos.splice(i, 1);
        if (e.filamento === removido.id) e.filamento = e.filamentos[0].id;
        desenhaLista();
        desenhaTrilho();
        desenha();
      });
    });
  }

  var CORES_NOVAS = ["#c9c4bb", "#7fa8b8", "#d3a24a", "#6f8f74", "#b5787f", "#8d86b0"];

  document.getElementById("novoFilamento").addEventListener("click", function () {
    e.filamentos.push({
      id: "f" + Date.now().toString(36),
      nome: "Novo filamento",
      precoKg: 100,
      cor: CORES_NOVAS[e.filamentos.length % CORES_NOVAS.length]
    });
    desenhaLista();
    desenhaTrilho();
    desenha();
    var ultimo = el.listaFilamentos.querySelector(".item:last-child input");
    if (ultimo) { ultimo.focus(); ultimo.select(); }
  });

  document.getElementById("editarFilamentos").addEventListener("click", function () {
    desenhaLista();
    abreGaveta("filamentos");
  });

  /* -------------------------------------------------------------- campos -- */

  function ligaCampo(id, chave, minimo) {
    var inp = document.getElementById(id);
    if (!inp) return;
    inp.value = e[chave];
    inp.addEventListener("input", function () {
      var v = parseFloat(String(inp.value).replace(",", "."));
      e[chave] = isFinite(v) ? Math.max(v, minimo === undefined ? 0 : minimo) : (minimo || 0);
      desenha();
    });
    /* Campo vazio ao sair volta ao mínimo, para a conta nunca ver NaN. */
    inp.addEventListener("blur", function () { inp.value = e[chave]; });
  }

  ["gramas:gramas:0", "naMesa:naMesa:1", "pedido:pedido:1",
   "potencia:potencia:0", "deprecHora:deprecHora:0", "manutHora:manutHora:0",
   "valorImpressora:valorImpressora:0", "vidaUtil:vidaUtil:1",
   "tarifa:tarifa:0", "acabamento:acabamento:0", "valorHora:valorHora:0",
   "falhas:falhas:0", "embalagem:embalagem:0", "frete:frete:0",
   "taxaVenda:taxaVenda:0", "imposto:imposto:0"
  ].forEach(function (spec) {
    var p = spec.split(":");
    ligaCampo(p[0], p[1], +p[2]);
  });

  document.getElementById("aplicarDeprec").addEventListener("click", function () {
    if (e.vidaUtil <= 0) return;
    e.deprecHora = Math.round((e.valorImpressora / e.vidaUtil) * 100) / 100;
    document.getElementById("deprecHora").value = e.deprecHora;
    desenha();
    tique(10);
  });

  document.getElementById("restaurar").addEventListener("click", function () {
    if (!confirm("Restaurar todos os ajustes ao padrão?\n\nO preço do filamento, a " +
                 "depreciação, a margem e o resto voltam ao valor de fábrica.")) return;
    try { localStorage.removeItem(CHAVE); } catch (err) {}
    location.reload();
  });

  /* --------------------------------------------------------------- tempo -- */

  var roletaH = null, roletaM = null;

  function textoTempo() {
    return e.horas + "<small>h</small> " +
           (e.minutos < 10 ? "0" : "") + e.minutos + "<small>min</small>";
  }

  el.tempo.addEventListener("click", function () {
    abreGaveta("tempo");
    /* Direto, sem esperar quadro: a roleta tem altura fixa, então já dá
       para posicioná-la, e quadro é coisa que o navegador suspende quando
       a aba está em segundo plano. */
    roletaH.põe(e.horas);
    roletaM.põe(e.minutos);
  });

  /* ---------------------------------------------------------- orçamento -- */

  document.getElementById("compartilhar").addEventListener("click", function () {
    var d = conta();
    var linhas = [
      "Orçamento de impressão 3D",
      "",
      d.pedido + (d.pedido === 1 ? " peça" : " peças") + " · " + brl(d.preco) + " cada",
      "Total: " + brl(d.totalPedido),
      "",
      d.fil.nome + " · " + nf(e.gramas / d.naMesa, 0) + " g por peça",
      "Produção: " + tempoTexto(d.horasTotais) +
        (d.placas > 1 ? " em " + d.placas + " impressões" : "")
    ];
    if (d.desc > 0) linhas.push("Já com " + nf(d.desc * 100, 0) + "% de desconto");

    var texto = linhas.join("\n");
    if (navigator.share) {
      navigator.share({ text: texto }).catch(function () {});
    } else if (navigator.clipboard) {
      navigator.clipboard.writeText(texto).then(function () {
        var b = document.getElementById("compartilhar");
        var antes = b.textContent;
        b.textContent = "Copiado";
        setTimeout(function () { b.textContent = antes; }, 1600);
      });
    }
  });

  /* ================= Cálculos salvos e sincronização =================
     Local-first: o localStorage é a base, então o app abre, calcula, salva
     e apaga offline. A nuvem é uma cópia que se reconcilia quando dá.

     A reconciliação é "quem escreveu por último ganha", comparando
     atualizado_em. Exclusão viaja como marca (excluido: true) em vez de
     sumiço, senão o item apagado no celular voltaria do computador. */

  var CHAVE_SALVOS = "bancada.salvos";
  var CHAVE_SESSAO = "bancada.sessao";
  var cfg = window.BANCADA_CONFIG || {};
  var temNuvem = !!(cfg.url && cfg.chave);

  var salvos = [];
  var sessao = null;
  var editando = null;   /* id do cálculo aberto, para Salvar sobrescrever */

  function lêLocal(chave, reserva) {
    try {
      var v = JSON.parse(localStorage.getItem(chave) || "null");
      return v === null ? reserva : v;
    } catch (err) { return reserva; }
  }

  function gravaLocal(chave, valor) {
    try { localStorage.setItem(chave, JSON.stringify(valor)); } catch (err) {}
  }

  function gravaSalvos() { gravaLocal(CHAVE_SALVOS, salvos); }

  function visíveis() {
    return salvos.filter(function (s) { return !s.excluido; })
                 .sort(function (a, b) {
                   return String(b.atualizado_em).localeCompare(String(a.atualizado_em));
                 });
  }

  /* ---------------------------------------------------------- rede -------- */

  function api(caminho, opcoes) {
    opcoes = opcoes || {};
    var cab = {
      "apikey": cfg.chave,
      "Content-Type": "application/json"
    };
    Object.keys(opcoes.headers || {}).forEach(function (k) {
      cab[k] = opcoes.headers[k];
    });
    return fetch(cfg.url + caminho, {
      method: opcoes.method || "GET",
      headers: cab,
      body: opcoes.body ? JSON.stringify(opcoes.body) : undefined
    }).then(function (r) {
      return r.text().then(function (t) {
        var corpo = null;
        try { corpo = t ? JSON.parse(t) : null; } catch (err) { corpo = t; }
        if (!r.ok) {
          var e2 = new Error((corpo && (corpo.msg || corpo.message ||
                              corpo.error_description || corpo.error)) ||
                             ("Erro " + r.status));
          e2.status = r.status;
          throw e2;
        }
        return corpo;
      });
    });
  }

  function guardaSessao(d) {
    if (!d || !d.access_token) return null;
    sessao = {
      token: d.access_token,
      refresh: d.refresh_token,
      expira: Date.now() + (d.expires_in || 3600) * 1000,
      user_id: d.user && d.user.id,
      email: d.user && d.user.email
    };
    gravaLocal(CHAVE_SESSAO, sessao);
    return sessao;
  }

  /* O token vale uma hora. Renova sozinho um minuto antes de vencer, para a
     sincronização não falhar bem na hora em que o usuário salva algo. */
  function token() {
    if (!sessao) return Promise.resolve(null);
    if (Date.now() < sessao.expira - 60000) return Promise.resolve(sessao.token);
    return api("/auth/v1/token?grant_type=refresh_token", {
      method: "POST", body: { refresh_token: sessao.refresh }
    }).then(function (d) {
      return guardaSessao(d) ? sessao.token : null;
    }).catch(function () {
      sessao = null;
      try { localStorage.removeItem(CHAVE_SESSAO); } catch (err) {}
      desenhaConta();
      return null;
    });
  }

  function paraNuvem(s) {
    return {
      user_id: sessao.user_id, id: s.id, nome: s.nome, valores: s.valores,
      preco: s.preco, total: s.total, pedido: s.pedido, placas: s.placas,
      tempo: s.tempo, data: s.data, atualizado_em: s.atualizado_em,
      excluido: !!s.excluido
    };
  }

  function daNuvem(r) {
    return {
      id: r.id, nome: r.nome, valores: r.valores, preco: r.preco,
      total: r.total, pedido: r.pedido, placas: r.placas, tempo: r.tempo,
      data: r.data, atualizado_em: r.atualizado_em, excluido: !!r.excluido
    };
  }

  var sincronizando = false;

  function sincroniza() {
    if (!temNuvem || !sessao || sincronizando || !navigator.onLine) {
      return Promise.resolve();
    }
    sincronizando = true;

    return token().then(function (tk) {
      if (!tk) return;
      var cab = { Authorization: "Bearer " + tk };

      return api("/rest/v1/bancada?select=*", { headers: cab })
        .then(function (linhas) {
          var mapa = {};
          salvos.forEach(function (s) { mapa[s.id] = s; });

          var mandarPraCima = [];
          (linhas || []).forEach(function (r) {
            var remoto = daNuvem(r);
            var local = mapa[remoto.id];
            if (!local) { mapa[remoto.id] = remoto; return; }
            /* Quem tem o carimbo mais novo ganha, dos dois lados. */
            if (String(remoto.atualizado_em) > String(local.atualizado_em)) {
              mapa[remoto.id] = remoto;
            } else if (String(local.atualizado_em) > String(remoto.atualizado_em)) {
              mandarPraCima.push(local);
            }
          });

          var idsRemotos = {};
          (linhas || []).forEach(function (r) { idsRemotos[r.id] = true; });
          salvos.forEach(function (s) {
            if (!idsRemotos[s.id]) mandarPraCima.push(s);
          });

          salvos = Object.keys(mapa).map(function (k) { return mapa[k]; });
          gravaSalvos();
          desenhaSalvos();

          if (!mandarPraCima.length) return;
          return api("/rest/v1/bancada", {
            method: "POST",
            headers: { Authorization: "Bearer " + tk,
                       Prefer: "resolution=merge-duplicates,return=minimal" },
            body: mandarPraCima.map(paraNuvem)
          });
        });
    }).catch(function () {
      /* Sem internet ou banco fora do ar: o app segue local, e a próxima
         oportunidade tenta de novo. Não vale interromper o usuário. */
    }).then(function () {
      sincronizando = false;
    });
  }

  /* ------------------------------------------------------- salvar --------- */

  function salvaAtual(nome) {
    var d = conta();
    var agora = new Date().toISOString();
    var fil = filamentoAtual() || { id: "", nome: "" };

    /* Só o painel é guardado. Os ajustes ficam de fora de propósito: abrir
       um cálculo de três meses atrás deve mostrar o que aquela peça custa
       hoje, e não ressuscitar a tarifa de energia daquela época. */
    var registro = {
      id: (editando && acha(editando)) ? editando
        : String(Date.now()).slice(-8) + Math.random().toString(36).slice(2, 6),
      nome: nome,
      valores: {
        gramas: e.gramas, horas: e.horas, minutos: e.minutos,
        naMesa: e.naMesa, pedido: e.pedido,
        filamento: fil.id, filamentoNome: fil.nome,
        margem: e.margem, desconto: e.desconto
      },
      preco: +d.preco.toFixed(2), total: +d.totalPedido.toFixed(2),
      pedido: d.pedido, placas: d.placas, tempo: +d.horas.toFixed(3),
      data: (acha(editando) || {}).data || agora,
      atualizado_em: agora,
      excluido: false
    };

    var antigo = acha(registro.id);
    if (antigo) salvos[salvos.indexOf(antigo)] = registro;
    else salvos.unshift(registro);

    editando = registro.id;
    gravaSalvos();
    desenhaSalvos();
    sincroniza();
  }

  function acha(id) {
    if (!id) return null;
    for (var i = 0; i < salvos.length; i++) if (salvos[i].id === id) return salvos[i];
    return null;
  }

  function abre(id) {
    var s = acha(id);
    if (!s || !s.valores) return;
    var v = s.valores;
    ["gramas", "horas", "minutos", "naMesa", "pedido", "margem", "desconto"]
      .forEach(function (k) { if (v[k] !== undefined) e[k] = v[k]; });
    /* Se o filamento foi removido da lista, mantém o que está em uso em vez
       de escolher um por conta própria. */
    if (v.filamento && e.filamentos.some(function (f) { return f.id === v.filamento; })) {
      e.filamento = v.filamento;
    }
    editando = id;

    ["gramas", "naMesa", "pedido"].forEach(function (k) {
      var inp = document.getElementById(k);
      if (inp) inp.value = e[k];
    });
    el.tempo.innerHTML = textoTempo();
    desenhaTrilho();
    reguaMargem.sincroniza();
    reguaDesconto.sincroniza();
    desenha();
    fechaGaveta("salvos");
  }

  function apaga(id) {
    var s = acha(id);
    if (!s) return;
    s.excluido = true;
    s.atualizado_em = new Date().toISOString();
    if (editando === id) editando = null;
    gravaSalvos();
    desenhaSalvos();
    sincroniza();
  }

  /* -------------------------------------------------------- desenho ------- */

  function desenhaSalvos() {
    var lista = document.getElementById("listaSalvos");
    if (!lista) return;
    var itens = visíveis();

    if (!itens.length) {
      lista.innerHTML = '<div class="vazio"><b>Nada salvo ainda</b>' +
        "Monte um cálculo e toque em Salvar. Ele fica aqui com o nome e o " +
        "preço do dia.</div>";
      return;
    }

    lista.innerHTML = itens.map(function (s) {
      var quando = new Date(s.atualizado_em);
      var data = isNaN(quando) ? "" :
        quando.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
      return '<div class="item">' +
        '<button class="item-texto item-botao" data-abre="' + s.id + '" type="button" ' +
        'style="padding:0">' +
        '<span class="item-nome">' + escapa(s.nome) + "</span>" +
        '<span class="item-sub">' + brl(s.preco || 0) + " cada · " +
        (s.pedido || 1) + (s.pedido === 1 ? " peça" : " peças") +
        (data ? " · " + data : "") + "</span></button>" +
        '<button class="btn btn-icone" data-apaga="' + s.id + '" type="button" ' +
        'aria-label="Apagar ' + escapa(s.nome) + '">' +
        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" ' +
        'stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>' +
        "</button></div>";
    }).join("");

    lista.querySelectorAll("[data-abre]").forEach(function (b) {
      b.addEventListener("click", function () { abre(b.dataset.abre); });
    });
    lista.querySelectorAll("[data-apaga]").forEach(function (b) {
      b.addEventListener("click", function () {
        var s = acha(b.dataset.apaga);
        if (s && confirm("Apagar “" + s.nome + "”?")) apaga(b.dataset.apaga);
      });
    });
  }

  function escapa(t) {
    return String(t == null ? "" : t)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function desenhaConta() {
    var nome = document.getElementById("contaNome");
    var sub = document.getElementById("contaSub");
    if (!nome) return;
    if (!temNuvem) {
      nome.textContent = "Só neste aparelho";
      sub.textContent = "Sincronização não configurada";
    } else if (sessao) {
      nome.textContent = sessao.email || "Conta conectada";
      sub.textContent = "Sincronizando · toque para sair";
    } else {
      nome.textContent = "Só neste aparelho";
      sub.textContent = "Entre para sincronizar com o celular";
    }
  }

  /* ---------------------------------------------------------- ligações ---- */

  salvos = lêLocal(CHAVE_SALVOS, []);
  sessao = lêLocal(CHAVE_SESSAO, null);

  document.getElementById("abrirSalvos").addEventListener("click", function () {
    desenhaSalvos();
    desenhaConta();
    abreGaveta("salvos");
    sincroniza();
  });

  document.getElementById("salvar").addEventListener("click", function () {
    var d = conta();
    var campo = document.getElementById("nomeSalvar");
    var atual = acha(editando);
    campo.value = atual ? atual.nome : "";
    document.getElementById("resumoSalvar").textContent =
      brl(d.preco) + " cada · " + d.pedido + (d.pedido === 1 ? " peça" : " peças") +
      " · " + tempoTexto(d.horas) + " por placa";
    abreGaveta("salvar");
    setTimeout(function () { campo.focus(); }, 120);
  });

  document.getElementById("confirmaSalvar").addEventListener("click", function () {
    var campo = document.getElementById("nomeSalvar");
    var nome = campo.value.trim();
    if (!nome) { campo.focus(); return; }
    salvaAtual(nome);
    fechaGaveta("salvar");
  });

  document.getElementById("nomeSalvar").addEventListener("keydown", function (ev) {
    if (ev.key === "Enter") document.getElementById("confirmaSalvar").click();
  });

  document.getElementById("linhaConta").addEventListener("click", function () {
    if (!temNuvem) return;
    if (sessao) {
      if (!confirm("Sair da conta?\n\nOs cálculos continuam neste aparelho.")) return;
      sessao = null;
      try { localStorage.removeItem(CHAVE_SESSAO); } catch (err) {}
      desenhaConta();
      return;
    }
    document.getElementById("contaAviso").textContent = "";
    abreGaveta("conta");
  });

  function autentica(caminho) {
    var email = document.getElementById("cEmail").value.trim();
    var senha = document.getElementById("cSenha").value;
    var aviso = document.getElementById("contaAviso");
    if (!email || senha.length < 8) {
      aviso.textContent = "E-mail e uma senha de pelo menos 8 letras.";
      return;
    }
    aviso.textContent = "Um instante…";
    api(caminho, { method: "POST", body: { email: email, password: senha } })
      .then(function (d) {
        if (!guardaSessao(d)) {
          /* Conta criada mas sem sessão: o projeto exige confirmar e-mail. */
          aviso.textContent = "Conta criada. Confirme o e-mail e depois entre.";
          return;
        }
        document.getElementById("cSenha").value = "";
        desenhaConta();
        fechaGaveta("conta");
        return sincroniza();
      })
      .catch(function (err) {
        aviso.textContent = err && err.message ? err.message : "Não deu certo.";
      });
  }

  document.getElementById("fazEntrar").addEventListener("click", function () {
    autentica("/auth/v1/token?grant_type=password");
  });
  document.getElementById("fazCriar").addEventListener("click", function () {
    autentica("/auth/v1/signup");
  });

  /* Momentos em que vale tentar de novo: a internet voltou, ou o app veio
     para a frente depois de o outro aparelho ter mexido em algo. */
  window.addEventListener("online", sincroniza);
  document.addEventListener("visibilitychange", function () {
    if (document.visibilityState === "visible") sincroniza();
  });

  desenhaConta();
  if (sessao) sincroniza();

  /* -------------------------------------------------------------- cimeira --
     Sombra na barra só quando existe conteúdo passando por baixo dela. */

  var sentinela = document.createElement("div");
  sentinela.style.cssText = "position:absolute;top:0;height:1px;width:1px";
  document.body.appendChild(sentinela);

  new IntersectionObserver(function (entradas) {
    el.cimeira.dataset.rolado = entradas[0].isIntersecting ? "não" : "sim";
  }).observe(sentinela);

  /* ------------------------------------------------------------- partida -- */

  document.getElementById("abrirAjustes")
    .addEventListener("click", function () { abreGaveta("ajustes"); });

  var reguaMargem = montaRegua($("#reguaMargem"), {
    min: 0, max: 90, cor: corMargem,
    valor: function () { return e.margem; },
    aplica: function (v) { e.margem = v; desenha(); }
  });

  var reguaDesconto = montaRegua($("#reguaDesconto"), {
    min: 0, max: 60, cor: corDesconto,
    valor: function () { return e.desconto; },
    aplica: function (v) { e.desconto = v; desenha(); }
  });

  roletaH = montaRoleta(document.getElementById("roletaH"), 49,
    function (i) { return i; },
    function (v) { e.horas = v; el.tempo.innerHTML = textoTempo(); desenha(); });

  roletaM = montaRoleta(document.getElementById("roletaM"), 60,
    function (i) { return (i < 10 ? "0" : "") + i; },
    function (v) { e.minutos = v; el.tempo.innerHTML = textoTempo(); desenha(); });

  el.tempo.innerHTML = textoTempo();
  desenhaTrilho();
  reguaMargem.sincroniza();
  reguaDesconto.sincroniza();
  desenha();

  /* A régua vive numa largura que só existe depois do primeiro desenho. */
  window.addEventListener("resize", function () {
    reguaMargem.sincroniza();
    reguaDesconto.sincroniza();
  });

  if (el.notaVersao) el.notaVersao.textContent = "Bancada " + VERSAO;

  /* ------------------------------------------------------ service worker -- */

  /* Em localhost o service worker sai do caminho: ele guarda os arquivos em
     cache e serve a versão velha, então cada alteração exigiria trocar o
     nome do cache para aparecer. Em produção ele entra normalmente, que é
     onde ele importa. */
  var emDesenvolvimento = /^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname);

  if (emDesenvolvimento && "serviceWorker" in navigator) {
    navigator.serviceWorker.getRegistrations().then(function (regs) {
      regs.forEach(function (r) { r.unregister(); });
    });
    if (window.caches) {
      caches.keys().then(function (ks) { ks.forEach(function (k) { caches.delete(k); }); });
    }
  }

  if (!emDesenvolvimento && "serviceWorker" in navigator) {
    window.addEventListener("load", function () {
      navigator.serviceWorker.register("sw.js").then(function (reg) {
        reg.addEventListener("updatefound", function () {
          var novo = reg.installing;
          if (!novo) return;
          novo.addEventListener("statechange", function () {
            if (novo.state === "installed" && navigator.serviceWorker.controller) {
              document.getElementById("tarja").dataset.aberta = "sim";
            }
          });
        });
      }).catch(function () {});
    });

    document.getElementById("recarregar").addEventListener("click", function () {
      navigator.serviceWorker.getRegistration().then(function (reg) {
        if (reg && reg.waiting) reg.waiting.postMessage({ tipo: "assumir" });
        setTimeout(function () { location.reload(); }, 120);
      });
    });

    navigator.serviceWorker.addEventListener("controllerchange", function () {
      location.reload();
    });
  }
})();
