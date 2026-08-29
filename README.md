# Custo de Impressão 3D

Calculadora de custo e preço de venda de peças impressas em 3D. Site estático,
sem build: HTML, CSS e JavaScript puros, instalável como app no iPhone e
funcionando offline.

- **Produção:** https://calculadora-custo-3d-nine.vercel.app
- **Teste:** https://calc3d-teste.vercel.app (apelido fixo, aponta para a branch em avaliação)

## Como o preço é formado

Sem multiplicador mágico — o preço se monta em partes verificáveis:

1. **Custo de fabricar** — filamento, energia, depreciação e manutenção
2. **+ Acabamento** — minutos por peça × valor da sua hora
3. **+ Reserva para falhas** — % sobre o que veio acima; a peça que deu errado
   consumiu material e máquina, e quem cobre isso são as que deram certo
4. **+ Margem de lucro** — sobre o preço, não sobre o custo. Com 40%, de cada
   R$ 100 que entram, R$ 40 sobram
5. **+ Taxa da plataforma** — entra no preço em vez de sair do lucro
6. **− Desconto** — sai inteiro do lucro; o relatório avisa quando derruba pela
   metade ou zera

O "N× o custo" aparece no fim como consequência, não como entrada. Margem e
multiplicador são dois caminhos para a mesma coisa e se atualizam juntos.

Fora da conta: embalagem, frete, impostos e o tempo de anunciar e atender.

## Funcionalidades

- **Roleta de horas e minutos** para o tempo, no lugar de horas decimais —
  ler 3,5 como "três e meia" era erro fácil
- **Réguas horizontais** para margem e desconto, com cor indo de vermelho a verde
- **Link do modelo** — cola o endereço do MakerWorld e o nome sai do próprio
  link (`models/1234-suporte-de-fone` → "Suporte de fone"), sem rede
- **Relatório** com cada linha somando na de baixo
- **Cálculos salvos** com nome e link, sincronizados entre aparelhos
- **Compartilhar** monta um orçamento pronto para o WhatsApp

## Sincronização

Login por e-mail e senha, dados no Postgres do Supabase com Row Level Security:
cada conta só enxerga as próprias linhas. O site continua estático — o navegador
fala direto com o banco.

Desenho local-first: o `localStorage` é a base, então o app abre e calcula
offline. Sincroniza ao salvar, ao excluir, quando a internet volta e ao trazer o
app para o primeiro plano. Exclusões viajam como marcas (`excluido: true`) — sem
isso o item voltaria do outro aparelho.

Credenciais em `config.js`. A chave `anon` é pública por desenho; quem protege os
dados é o RLS.

### Função `titulo`

Edge Function no Supabase que lê o nome de um modelo a partir do link, usada só
quando o endereço não traz o nome. Tem lista de sites permitidos para não virar
proxy aberto. MakerWorld e Printables respondem 403 a acesso automático, então na
prática o caminho que funciona é o nome vindo do próprio endereço.

## Instalar no iPhone

1. Abra o link no **Safari**
2. Toque em compartilhar (quadrado com seta para cima)
3. **Adicionar à Tela de Início**

Quando sai uma versão nova, aparece uma tarja com **Atualizar**.

## Publicar

Push na `main` publica na produção. Para avaliar antes:

```
git checkout -b nome-do-teste
git push -u origin nome-do-teste
vercel ls calculadora-custo-3d
vercel alias set <url-do-deploy> calc3d-teste.vercel.app
```

A tag `v1-ios` marca a última versão com a aparência iOS original.

Ao mexer em `index.html` ou `sw.js`, incremente o `CACHE_NAME` do service worker
— sem isso o app instalado continua servindo a versão antiga.
