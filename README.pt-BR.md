# legends-claude

[English](README.md) · **Português**

Uma barra acima do prompt do Claude Code que mostra o que importa enquanto você trabalha: **modelo e effort**, **custo da sessão e do turno**, **limites de uso**, **cada agente em execução** e um **palco** onde o mascote do Claude Code constrói, tijolo por tijolo, o que o turno está fazendo. O mascote muda com o **modelo** e com o **effort**: quanto mais forte o modelo e mais alto o effort, mais ele brilha. Não mostra barra de contexto.

![A barra durante um turno como Fable em max: o mascote voa com uma aura furta-cor, carrega tijolos, chama ajudantes e comemora com fogos](docs/demo.pt-BR.gif)

A barra ocupa a largura toda do terminal. Num terminal estreito, modelo, custo e limites empilham em linhas próprias.

## O que aparece

| Linha | O que mostra |
| --- | --- |
| Régua | A linha de cima. Com trabalho em curso, um pulso `━` nasce no centro e corre para as duas pontas: mais largo e mais rápido quanto maior o effort. |
| Cabeçalho | Modelo e effort do último pedido, **clicáveis** (veja Uso). A faísca é a da classe do modelo (`✢` Haiku, `✻` Sonnet, `❋` Opus, `❂` Fable; veja O poder): pulsa enquanto o turno roda e fica apagada quando está ocioso. Custo e limites encostam à direita na mesma linha quando cabem. |
| Custo | Total da sessão (o mesmo que `/cost` soma, subagentes incluídos) e quanto foi gasto desde o último prompt. Duas casas decimais (`$1.75`). O total acende com `▲` por um instante sempre que cresce. |
| Limites | Janelas de 5 horas e 7 dias, com quanto falta para zerar. Só aparece em contas que reportam limite. |
| Palco | Quatro linhas de cena, enquanto há um turno ou um agente rodando. Veja abaixo. |
| Trabalho | Com o palco desligado: um cometa de faíscas `✳✶✻·····`, tempo decorrido, quantas ferramentas foram chamadas e a última delas. Com o palco ligado, essas informações ficam no placar do canto dele. |
| Agentes | Uma linha por subagente, teammate ou agente de workflow: o nome surge de um punhado de faíscas que assentam letra a letra; depois, a faísca da classe do modelo dele pulsando (na cor do ajudante dele no palco), brilho no nome e um cometa próprio, cada um fora de fase do vizinho; tempo, ferramentas e a última chamada. Ao terminar vira `✓` com um estouro de faíscas que rareia, duração e tokens (ou `✗` se falhou) e some depois de 8 segundos. Por padrão no máximo 6 linhas (3, 6 ou 10 na aba de ajustes); o resto vira `+N agentes`. |

## O palco

O palco não é um desenho em loop: ele reage ao que está acontecendo de verdade.

- **O mascote** é o do logo do Claude Code (`▐▛███▜▌` / `▝▜█████▛▘` / `▘▘ ▝▝`), ponto a ponto. Ele entra pela esquerda quando o turno começa e espera no meio da pista.
- **Pensando ou esperando.** Enquanto o modelo pensa, a faísca da classe dele pulsa sobre a cabeça e os olhos vão de um lado para o outro. Enquanto uma ferramenta roda, aparece o nome dela (`Bash···`) e ele sobe e desce as garras.
- **Cada ferramenta é um tijolo.** Uma chamada de ferramenta vira um tijolo na pilha da esquerda, na cor da família dela. O mascote vai buscar, leva na cabeça (até seis por viagem; com a pilha grande ele aperta o passo), põe na esteira, e a esteira leva até a **parede** que cresce à direita, em fiadas alternadas. O tijolo recém-chegado acende. A parede fica de um turno para o outro: é o retrato do que a sessão fez.
- **Ajudantes.** Quando o Claude dispara um subagente, o mascote para, grita `!`, e um ajudante menor brota atrás dele numa nuvem de faíscas, na cor do agente (a mesma da faísca dele na lista). O ajudante carrega os tijolos das ferramentas do próprio agente. Agente à espera: o ajudante senta e dorme (`z`). Agente terminado: ele pula, ganha `✓` e some em faíscas; se falhou, apaga e leva `✗`. Até seis ajudantes em cena.
- **O fim.** Quando o turno termina com uma resposta, o mascote comemora: com três ferramentas ou mais, pulos e confete nas cores dos tijolos; num turno curto, só um pulinho. Um turno interrompido ou que acabou em erro não tem festa: a cena se recolhe.
- **O placar** no canto de cima à direita mostra o tempo do turno, quantas ferramentas ele chamou e a última delas.

As cores dos tijolos:

| Cor | Família | Exemplos |
| --- | --- | --- |
| azul | ler | `Read`, `NotebookRead` |
| lilás | buscar | `Grep`, `Glob`, `ToolSearch` |
| verde | editar e escrever | `Edit`, `Write`, `NotebookEdit` |
| âmbar | shell | `Bash`, `KillShell` |
| ciano | web | `WebFetch`, `WebSearch` |
| rosa | agentes | `Agent`, `Task`, `SendMessage` |
| laranja | ferramentas MCP | `mcp__servidor__ferramenta` |
| cinza | o resto | `TodoWrite`, `Skill`, `AskUserQuestion` |

Para ver o palco sem esperar um turno: `/legends-claude demo` (ou o botão **▶ demonstração** na aba de ajustes) roda um turno de mentira de uns 25 segundos, com ajudantes e confete.

## O poder: modelo e effort

O mascote não é sempre o mesmo. A **classe do modelo** decide quem ele é; o **effort** do pedido, quanta energia ele solta.

![O mascote em cada classe de modelo (linhas) e em cada nível de effort (colunas)](docs/power.gif)

| Classe | Faísca | Aura | O que mais |
| --- | --- | --- | --- |
| Haiku | `✢` | verde, a partir de `high` | o mascote de sempre |
| Sonnet | `✻`, a do Claude Code | azul, a partir de `medium` | uma faixa de luz atravessa o corpo de tempos em tempos |
| Opus | `❋` | roxa, a partir de `medium` | olhos acesos em ouro; faixa dourada, mais larga e mais frequente; raios em `max`; fogos de ouro na festa do fim |
| Fable | `❂` | furta-cor (do ciano ao rosa, correndo), já em `low` | olhos acesos em branco; brilho furta-cor que mal passa e já recomeça; **voa** em vez de andar (sem patas, com jatos por baixo); raios a partir de `xhigh`; fogos de todas as cores |

- **A faísca** de cada classe é a do cabeçalho, a das linhas de agente e a que pulsa sobre a cabeça de quem pensa: do pontinho de Haiku ao selo de Fable. Um modelo de família desconhecida fica com a de Sonnet.
- **O effort faz a aura crescer.** Em `low` não há nenhuma; em `medium`, um clarão baixo em volta do corpo; daí para cima, cada nível alarga o clarão e sobe as labaredas, que se mexem a cada quadro. De `high` para cima, quem corre risca o ar atrás de si (só de Sonnet para cima); de `xhigh` para cima, sobem fagulhas pelos lados. Em Fable tudo começa um nível antes; em Haiku, um depois. O pulso da régua acompanha: mais largo e mais rápido.
- **Os olhos** do mascote são dois vazios: com aura, ela aparece através deles. De Opus para cima eles têm luz própria.
- **Cada ajudante tem o poder do seu agente**: o modelo e o effort com que ele roda. A aura de um ajudante é menor que a do mascote; dormindo ou depois de falhar, ele fica sem nenhuma.
- **Fora de um turno**, quando só os ajudantes ainda trabalham, o mascote descansa: segue com os olhos e o brilho da classe, sem a energia do effort.
- **Num tema claro** a aura clareia em direção ao branco, em vez de escurecer; os raios têm a cor do texto do tema.
- O poder é só desenho: não muda o que o palco conta (cada ferramenta segue sendo um tijolo) nem a velocidade de ninguém.

Para ver uma combinação sem trocar de modelo: `/legends-claude demo opus max` roda a demonstração com essa aparência (um modelo, um effort, ou os dois; uma palavra que não é nem um nem outro é recusada com um aviso). Na demonstração, um ajudante é um Sonnet em `high` e o outro um Haiku em `max`.

Como é desenhado: cada célula do terminal vale 2×2 "subpixels", desenhados com os blocos de quadrante (`▘▝▖▗▀▄▌▐…`), e a cor de fundo permite duas cores na mesma célula. Por isso o mascote anda de meia em meia célula e pula de meia em meia linha. A cena é uma simulação pura, quadro a quadro, sem sorteio: o mesmo estado desenha sempre o mesmo quadro.

A animação só roda enquanto há o que mostrar (um turno, um agente, a demonstração, ou a cena terminando: um tijolo na esteira, o confete caindo). Parada, a barra não redesenha e não gasta nada.

## Instalação

No prompt de uma sessão do Claude Code no terminal:

```
/plugin install legends-claude --marketplace leolegends/legends-claude
```

Ou direto do shell:

```
claude plugin install legends-claude --marketplace leolegends/legends-claude
```

O Claude Code pergunta `Add marketplace?` (responda `y`) e depois o escopo: escolha **user** para a barra valer em todas as sessões. Ele passa a funcionar na hora, sem reiniciar.

No app desktop, onde `/plugin` não roda: clique em **+** ao lado do prompt, depois **Plugins**, **Add marketplace** com `leolegends/legends-claude` e **Add plugin**.

Para atualizar: `claude plugin update legends-claude` e depois `/reload-plugins`.
Para remover: `claude plugin uninstall legends-claude`.

## Uso

- **Clique no modelo** (`Fable 5.2`) abre um seletor na própria barra: `modelo  ● Fable  Opus  Sonnet  Haiku  ✕`. Clicar num deles roda `/model <nome>`, como se você tivesse digitado: a troca é a da sessão e, como todo `/model`, fica salva como padrão das próximas.
- **Clique no effort** (`high`) abre `effort  low  medium  ● high  xhigh  max  ✕` e roda `/effort <nível>`.
- No meio de um turno a troca entra na fila e vale quando o turno termina. `✕` (ou clicar de novo no modelo/effort) fecha o seletor sem trocar nada.
- `▾` no canto da barra esconde; `◂ status` traz de volta. `/legends-claude` alterna entre escondido e visível.
- `/legends-claude demo` mostra o palco em ação, com a sessão parada. `/legends-claude demo fable max` mostra com outro modelo e effort, sem trocar os da sessão.
- **`⚙` abre a aba de ajustes** na própria barra (ou `/legends-claude ajustes`; `settings` também serve). Cada mudança vale na hora e fica salva para as próximas sessões:

```
⚙ ajustes                                          ▶ demonstração   restaurar padrão   ✕
idioma       ● Português  English
cor          ● Claude  Azul  Verde  Roxo  Rosa  Ciano  Âmbar  Mono
animação     ● completa  suave  parada
velocidade   lenta  ● normal  rápida
mostrar      ☑ régua  ☑ palco  ☑ limites  ☑ custo do turno
agentes      3  ● 6  10
```

| Ajuste | O que faz |
| --- | --- |
| idioma | Português ou inglês: muda na hora todos os textos da barra, os avisos e a descrição do comando. Sem uma escolha salva, uma instalação nova segue o idioma do sistema (`LC_ALL`, `LC_MESSAGES`, `LANG`): português se ele disser `pt`, senão inglês. "Restaurar padrão" não mexe no idioma. |
| cor | A cor de destaque: o mascote, a faísca, o modelo, o cometa, o pulso da régua, o custo aceso. Cada opção já aparece na própria cor. `Claude` e `Mono` seguem o tema claro/escuro do Claude Code. |
| animação | `completa` é tudo, palco incluído; `suave` deixa só a faísca pulsando e o cometa (sem palco, pulso na régua, nome surgindo, brilho nem estouro); `parada` não mexe nada e só atualiza o tempo uma vez por segundo. |
| velocidade | A duração de um quadro: 200, 125 ou 80 ms. É também o ritmo do palco. Sem efeito com a animação parada. |
| mostrar | Liga e desliga a régua de cima, o palco, os limites de 5h/7d e o custo do turno. O palco só aparece com a animação `completa`. |
| agentes | Quantas linhas de agente aparecem antes do resumo `+N agentes`. |

## Requisitos e limites

- Claude Code com suporte a mods (function hooks). Escrito e testado na versão 2.1.322. Essa API está em acesso antecipado e pode mudar entre versões.
- A barra precisa de pelo menos 60 colunas de terminal; abaixo disso ela não desenha. Numa barra com mais de 120 colunas o palco não estica além disso.
- A faixa acima do prompt pode ocupar até metade da altura do terminal. Se o palco não couber (menos de 7 linhas livres) ele não entra e a linha de trabalho volta; se couber justo, é a lista de agentes que encolhe para `+N agentes`.
- O palco usa os blocos de quadrante e cor de fundo em 24 bits. Num terminal sem cor de 24 bits as cores dos tijolos e da aura são aproximadas; numa fonte sem esses blocos o desenho não fecha.
- A faísca de cada classe usa glifos do bloco Dingbats (`✢ ✣ ✤`, `✸ ✹ ✺ ❋`, `✧ ✦ ✪ ❂ ❉`), como a do próprio Claude Code; numa fonte sem algum deles o terminal mostra o substituto dele.
- A aura esmaece para o fundo do terminal, e o mod só sabe se o tema é claro ou escuro pelo nome dele (a linha `theme` do `/config`): um tema cujo nome não diz `light` vale como escuro.
- O custo por agente não aparece: o Claude Code só expõe o custo total da sessão. Por agente, a barra mostra os tokens do último turno.
- O effort aparece a partir do primeiro pedido ao modelo depois que o plugin carrega; antes disso a barra mostra `effort`, já clicável.
- O seletor de modelo usa os apelidos `fable`, `opus`, `sonnet` e `haiku`; um modelo que a sua conta não tem é recusado pelo próprio `/model`, e a barra avisa.
- O plugin não acessa rede nem arquivos. Ele lê o uso da sessão, a lista de agentes e o tema (a linha `theme` do `/config`, e a troca dela), guarda o estado na sessão e os ajustes no store do próprio plugin (um JSON na pasta de configuração do Claude Code), e lê três variáveis de ambiente (`LC_ALL`, `LC_MESSAGES`, `LANG`) para escolher o primeiro idioma. A cena do palco vive só na memória e recomeça a cada sessão ou `/reload-plugins`.
- O palco é enfeite: um erro nele vira uma cena vazia e uma linha de aviso, nunca atrapalha uma ferramenta nem derruba a barra.
- O ícone `⚙` é desenhado como texto na maioria dos terminais; num terminal que o mostre como emoji largo, a primeira linha pode perder uma coluna à direita.

## Desenvolvimento

```
claude plugin validate .
claude plugin test .
claude --plugin-dir .        # roda uma sessão com o plugin carregado desta pasta
```

O módulo de hooks e o que ele importa, em `hooks/`:

- `register.tsx`: os eventos, o estado, o relógio da animação e o desenho da barra.
- `lines.ts`: as linhas da barra (cabeçalho, custo, trabalho, limites, agentes), puras.
- `effects.ts`: as animações de texto (faísca, cometa, pulso da régua, nome surgindo, estouro, brilho).
- `format.ts`, `parts.ts`, `agents.ts`: formatos de texto, trechos de linha, e as linhas de agente conferidas com a lista do engine.
- `sim.ts`: a simulação do palco, pura: o estado e as funções que dão o estado seguinte.
- `scene.ts`: o desenho de um quadro da cena (posturas, balões, tijolos, esteira, estrelas).
- `power.ts`: o poder de quem trabalha: a classe do modelo, o degrau do effort, a força da aura e a faísca de cada classe.
- `aura.ts`: a aparência de um bicho com poder, pura: a aura, o brilho do corpo, os olhos, as fagulhas, os raios, os jatos e os fogos.
- `pixels.ts`, `sprites.ts`, `palette.ts`, `color.ts`: o desenhador de subpixels (com o clarão de fundo), os desenhos dos bichos, as cores e as contas de cor.
- `demo.ts`: o roteiro da demonstração.
- `i18n.ts`: os textos da barra em português e em inglês. Um texto novo entra no tipo `Strings` e o compilador cobra a tradução nos dois.
- `settings.ts`, `settings-panel.tsx`: os ajustes e a aba deles.
- `types/index.d.ts` (na raiz): o contrato do estado que o plugin guarda.

Os comentários do código e os nomes dos testes estão em português, a língua em que o projeto nasceu.

Os testes (`*.test.ts`, 259 ao todo) cobrem as funções puras, a simulação quadro a quadro, o desenho da cena, o poder de cada classe e a barra montada em cada superfície.

Os GIFs dos dois READMEs saem das mesmas funções que desenham a barra, fora do Claude Code (precisa de `bun` e de Pillow). O turno de mentira roda com o modelo e o effort pedidos (o padrão é `fable high`); a tabela de poderes é a mesma nos dois idiomas:

```
bun run scripts/demo-frames.ts 100 en fable max | python3 scripts/demo-gif.py docs/demo.gif
bun run scripts/demo-frames.ts 100 pt fable max | python3 scripts/demo-gif.py docs/demo.pt-BR.gif
bun run scripts/power-frames.ts | python3 scripts/demo-gif.py docs/power.gif
```

A documentação tem dois arquivos, que mudam juntos: `README.md` (inglês) e `README.pt-BR.md` (português).

## Créditos e licença

MIT. Algumas funções auxiliares foram adaptadas de [claude-statuspane](https://github.com/xuanji86/claude-statuspane) (MIT), de Anji Xu. As animações seguem técnicas da skill `ascii-animations` (grade de caracteres, máquina de estados, onda que se propaga, partículas), adaptadas para o terminal.
