/* Gera os ícones do app. Rode com: node icones/gerar.js
 *
 * A marca é uma peça de três camadas em cima da mesa. Geometria pura,
 * sem arquivo de imagem no meio, para o ícone poder ser refeito em
 * qualquer tamanho sem perder nitidez.
 *
 * O PNG é escrito à mão porque o desenho não justifica uma dependência:
 * são quatro retângulos e um zlib que já vem no Node.
 */

const fs = require("fs");
const path = require("path");
const zlib = require("zlib");

const TINTA = [0x1a, 0x19, 0x17];
const PAPEL = [0xf4, 0xf3, 0xf0];

/* Retângulo de cantos arredondados, em distância com sinal. Negativo
   dentro, positivo fora, e a faixa entre -0.5 e 0.5 vira a borda suave. */
function distancia(x, y, cx, cy, hx, hy, r) {
  const qx = Math.abs(x - cx) - (hx - r);
  const qy = Math.abs(y - cy) - (hy - r);
  const fora = Math.hypot(Math.max(qx, 0), Math.max(qy, 0));
  return fora + Math.min(Math.max(qx, qy), 0) - r;
}

/* A marca em coordenadas de 0 a 1: a mesa embaixo e a peça de três
   camadas em cima dela.
 *
 * A largura anda em progressão (0.28, 0.56, 0.84, 1.00) para o olho ler
 * uma pilha e não quatro traços, e o vão até a mesa é maior que os vãos
 * entre camadas — é ele que separa a peça do móvel. */
const MARCA = [
  { x0: 0.36, x1: 0.64, y0: 0.000, y1: 0.173 },
  { x0: 0.22, x1: 0.78, y0: 0.272, y1: 0.445 },
  { x0: 0.08, x1: 0.92, y0: 0.543, y1: 0.717 },
  { x0: 0.00, x1: 1.00, y0: 0.861, y1: 1.000 }
];

function desenha(tamanho, { mascara }) {
  const px = Buffer.alloc(tamanho * tamanho * 4);
  const AMOSTRAS = 4;                       /* 4x4 por pixel */
  const escalaMarca = mascara ? 0.50 : 0.60;
  const lado = tamanho * escalaMarca;
  const esquerda = (tamanho - lado) / 2;
  const topo = (tamanho - lado) / 2;
  const raioFundo = mascara ? 0 : tamanho * 0.2237;   /* proporção do iOS */
  const raioBarra = tamanho * 0.012;

  for (let y = 0; y < tamanho; y++) {
    for (let x = 0; x < tamanho; x++) {
      let cobFundo = 0, cobMarca = 0;

      for (let sy = 0; sy < AMOSTRAS; sy++) {
        for (let sx = 0; sx < AMOSTRAS; sx++) {
          const px_ = x + (sx + 0.5) / AMOSTRAS;
          const py_ = y + (sy + 0.5) / AMOSTRAS;

          if (mascara) {
            cobFundo += 1;
          } else {
            const d = distancia(px_, py_, tamanho / 2, tamanho / 2,
                                tamanho / 2, tamanho / 2, raioFundo);
            if (d < 0) cobFundo += 1;
          }

          for (const b of MARCA) {
            const bx0 = esquerda + b.x0 * lado, bx1 = esquerda + b.x1 * lado;
            const by0 = topo + b.y0 * lado,     by1 = topo + b.y1 * lado;
            const d = distancia(px_, py_, (bx0 + bx1) / 2, (by0 + by1) / 2,
                                (bx1 - bx0) / 2, (by1 - by0) / 2, raioBarra);
            if (d < 0) { cobMarca += 1; break; }
          }
        }
      }

      const total = AMOSTRAS * AMOSTRAS;
      const aFundo = cobFundo / total;
      const aMarca = cobMarca / total;
      const i = (y * tamanho + x) * 4;

      /* A marca só existe onde o fundo existe. */
      const m = Math.min(aMarca, aFundo);
      for (let c = 0; c < 3; c++) {
        px[i + c] = Math.round(TINTA[c] * (1 - m / Math.max(aFundo, 1e-6)) +
                               PAPEL[c] * (m / Math.max(aFundo, 1e-6)));
      }
      px[i + 3] = Math.round(aFundo * 255);
    }
  }
  return px;
}

/* ---------------------------------------------------------------- PNG --- */

const TABELA = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = TABELA[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function bloco(tipo, dados) {
  const nome = Buffer.from(tipo, "ascii");
  const corpo = Buffer.concat([nome, dados]);
  const tam = Buffer.alloc(4);
  tam.writeUInt32BE(dados.length);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(corpo));
  return Buffer.concat([tam, corpo, crc]);
}

function png(px, tamanho) {
  const linhas = Buffer.alloc((tamanho * 4 + 1) * tamanho);
  for (let y = 0; y < tamanho; y++) {
    linhas[y * (tamanho * 4 + 1)] = 0;      /* filtro nenhum */
    px.copy(linhas, y * (tamanho * 4 + 1) + 1, y * tamanho * 4, (y + 1) * tamanho * 4);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(tamanho, 0);
  ihdr.writeUInt32BE(tamanho, 4);
  ihdr[8] = 8;      /* 8 bits por canal */
  ihdr[9] = 6;      /* RGBA */
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    bloco("IHDR", ihdr),
    bloco("IDAT", zlib.deflateSync(linhas, { level: 9 })),
    bloco("IEND", Buffer.alloc(0))
  ]);
}

/* --------------------------------------------------------------- saída --- */

const destino = __dirname;
const pedidos = [
  ["icone-180.png", 180, false],
  ["icone-192.png", 192, false],
  ["icone-512.png", 512, false],
  ["icone-192-mascara.png", 192, true],
  ["icone-512-mascara.png", 512, true]
];

for (const [nome, tamanho, mascara] of pedidos) {
  const arquivo = path.join(destino, nome);
  fs.writeFileSync(arquivo, png(desenha(tamanho, { mascara }), tamanho));
  console.log(nome, tamanho + "px", mascara ? "(máscara)" : "");
}
