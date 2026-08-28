# Custo de Impressão 3D

Calculadora do custo real de fabricar peças em PLA na Bambu Lab A1: material, energia, depreciação da impressora e manutenção.

Site estático, sem build — abre `index.html` direto ou publica em qualquer host estático (Vercel, GitHub Pages, etc).

## Instalar no iPhone (PWA)

1. Abra o link do site no Safari.
2. Toque no ícone de compartilhar (quadrado com seta para cima).
3. Toque em "Adicionar à Tela de Início".

O app funciona offline depois da primeira visita e guarda os valores digitados entre usos (localStorage).

## Cálculos salvos

Toque em **Salvar** no topo para guardar o cálculo atual com um nome e,
opcionalmente, o link do arquivo (MakerWorld, Printables etc). Os cálculos
salvos ficam listados no fim da tela: toque para carregar de volta, ou use
**Editar** para excluir.

Salvar de novo com o mesmo nome atualiza o cálculo existente; mudar o nome
cria um novo. Tudo fica só no seu aparelho (localStorage), sem servidor.

## Preço de venda

O preço é montado em partes, sem multiplicador mágico:

1. **Custo de fabricar** — filamento, energia, depreciação, manutenção
2. **+ Acabamento** — minutos por peça × valor da sua hora
3. **+ Reserva para falhas** — % sobre o que veio acima; a peça que deu
   errado foi paga com material e máquina, e quem cobre isso são as que
   deram certo
4. **+ Sua margem de lucro** — sobre o preço, não sobre o custo. Com 40%,
   de cada R$ 100 que entram, R$ 40 sobram
5. **+ Taxa da plataforma** — entra no preço em vez de sair do seu lucro

O relatório mostra cada linha, e o "N× o custo" aparece no fim como
consequência, não como entrada.

Fora da conta: embalagem, frete, impostos e o tempo de anunciar e atender.

O botão **Compartilhar** monta um orçamento pronto para o WhatsApp.
