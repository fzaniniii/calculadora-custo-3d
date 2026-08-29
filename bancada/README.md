# Bancada

O custo real de fabricar uma peça impressa, e o preço que ela precisa ter.

Site estático, sem build: HTML, CSS e JavaScript puros. Instalável como app no
iPhone e funcionando offline. Projeto separado da calculadora da raiz do
repositório, que continua no ar sem ser tocada.

## As duas camadas

O app se divide em duas, e essa divisão é a razão de ele existir.

**O painel** é o que muda a cada peça, e cabe numa tela sem rolar: qual
filamento, quantas gramas, quanto tempo, quantas cabem na mesa, quantas o
cliente quer, margem e desconto.

**Os ajustes** ficam atrás de um botão e você abre uma vez por mês, se tanto:
potência, tarifa de energia, depreciação, manutenção, o valor da sua hora, a
reserva para falhas, embalagem, frete, taxa da plataforma e imposto.

## Como o preço se forma

Sem multiplicador mágico. Cada linha soma na de baixo e o extrato mostra todas.

1. **Custo de imprimir** é da placa inteira e se divide pelas peças que cabem
   na mesa: filamento, energia, depreciação e manutenção
2. **+ Acabamento** — minutos por peça × o valor da sua hora
3. **+ Reserva para falhas** — % sobre o que veio acima; a impressão que deu
   errado consumiu material e máquina, e quem cobre isso são as que deram certo
4. **+ Embalagem e frete** — por peça, e o frete só entra se sai do seu bolso
5. **= Seu custo**

Daí para o preço, margem, taxa da plataforma e imposto saem todos da mesma
receita, então entram juntos num divisor só:

```
preço = custo ÷ (1 − margem − taxa − imposto)
```

Com 40% de margem, 12% de taxa e 6% de imposto, o preço é o custo dividido por
0,42. É por isso que os ajustes mostram quanto os três somam: o que sobra é o
que de fato paga o custo.

O **desconto** sai do preço anunciado e quem o absorve é o lucro — a taxa e o
imposto continuam incidindo sobre o que o cliente paga. Quando ele derruba a
margem pela metade ou zera o lucro, o app avisa.

O `N× o custo` aparece no canto do extrato como consequência, nunca como
entrada.

## O pedido

O app separa duas coisas que costumam virar uma só:

- **quantas cabem na mesa** divide o custo fixo da placa
- **quantas o cliente quer** define quantas placas rodam

Se cabem 4 e ele quer 10, são 3 placas, e a terceira vai com 2 vagas sobrando.
O app diz isso, porque encaixar mais 2 sai pelo mesmo tempo de máquina.

O **lucro por hora** é a medida que decide se vale pegar o trabalho: uma peça
que dá R$ 20 em 2 h vale mais que uma que dá R$ 30 em 8 h.

## Filamentos

Material é decisão de peça, não de configuração. A lista fica no painel como
um trilho de toque, e cada filamento guarda o preço do quilo fechado, como
você compra. Editar um preço atualiza tudo na hora.

## Instalar no iPhone

1. Abra o link no **Safari**
2. Toque em compartilhar (o quadrado com a seta para cima)
3. **Adicionar à Tela de Início**

Quando sai uma versão nova, aparece uma tarja com **Atualizar**.

## Desenvolver

```bash
npx serve -l 4321 .
```

E abra `http://localhost:4321/bancada/`.

Em `localhost` o service worker se desregistra sozinho e limpa o cache. Sem
isso, cada alteração exigiria trocar o nome do cache para aparecer, que é o
tipo de armadilha que faz a gente depurar um problema que não existe.

**Em produção, ao mexer em qualquer arquivo, incremente o `CACHE` do
`sw.js`** — sem isso o app já instalado continua servindo a versão antiga.

### Ícones

```bash
node icones/gerar.js
```

A marca é geometria pura (a mesa e a peça de três camadas), desenhada e
rasterizada pelo próprio script, sem dependência nem arquivo de imagem no
meio. Mexer nas proporções é mexer na constante `MARCA`.

## Cálculos salvos e sincronização

Salvar guarda o painel com um nome. Abrir de volta restaura gramas, tempo,
peças, filamento, margem e desconto — mas **não** os ajustes: um cálculo de
três meses atrás deve mostrar o que aquela peça custa hoje, e não ressuscitar
a tarifa de energia da época.

O desenho é local-first. O `localStorage` é a base, então o app salva, abre e
apaga offline. A nuvem é uma cópia que se reconcilia quando dá: ao salvar, ao
apagar, ao entrar, quando a internet volta e quando o app vem para a frente.

Reconciliação é "quem escreveu por último ganha", comparando `atualizado_em`.
Exclusão viaja como marca (`excluido: true`) em vez de sumiço — sem isso, o
item apagado no celular voltaria do computador na sincronização seguinte.

### O banco

Tabela `bancada` no Supabase, separada da `calculos` que a calculadora da raiz
usa: as duas guardam campos diferentes e misturá-las estragaria a leitura das
duas. Chave primária `(user_id, id)`, com o id gerado no aparelho.

Duas coisas precisam estar certas, e é fácil lembrar só da primeira:

1. **RLS ligado** com a política `auth.uid() = user_id`, que decide *quais*
   linhas cada conta enxerga
2. **`grant select, insert, update, delete ... to authenticated`**, que decide
   se a conta pode tocar na tabela *de todo*

Sem o grant, o Postgres recusa antes de o RLS ser consultado e a resposta é
`42501, permission denied`. O papel `anon` fica de fora dos dois de propósito.

A chave em `config.js` é a publishable e é pública por desenho. Quem protege
os dados é o RLS.
