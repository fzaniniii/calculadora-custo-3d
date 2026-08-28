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

Além do custo, o app sugere por quanto vender. A conta é:

1. **Custo da peça** = fabricação + seu tempo de acabamento (minutos × valor da sua hora)
2. **Preço-alvo** = custo × multiplicador
3. **Preço final** = preço-alvo ajustado para a taxa da plataforma

O passo 3 importa: sem ele, a comissão do Shopee ou do Mercado Livre sairia
do seu lucro em vez de entrar no preço. Com 20% de taxa, um alvo de R$ 36,21
vira R$ 45,26 no anúncio — e você continua recebendo os R$ 36,21.

**Multiplicador recomendado: 2,5× a 3×** para venda ao consumidor. Abaixo de
2× normalmente não cobre falhas de impressão, retrabalho e peça perdida.

O botão **Compartilhar** monta um orçamento pronto para mandar no WhatsApp.
