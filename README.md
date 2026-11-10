# legends-claude

Uma barra acima do prompt do Claude Code que mostra o que importa enquanto você trabalha: **modelo e effort**, **custo da sessão e do turno**, **limites de uso** e **cada agente em execução**, com animação. Não mostra barra de contexto.

```
──────────────────────────────────────────━━━─────────────────────────────━━━──────────────────
✶ Fable 5.2 · high                      $1.75 ▲ sessão · turno +$0.25  ·  5h ▰▰▱▱▱ 42% · 7d ▰▱▱▱▱ 18%  ▾
✳✶✻····· 1m12s · 14 tools · Bash
✻ Explore ✶✻···  buscar rotas HLS                                              12s · 4 tools · Grep
✢ ✳✶de-✻e✢ie·er ·✢✳✶✻  revisar o diff                                           0s
✓ planner ✶✳✢  plano da feature                                                  1m02s · 12.4k tok
```

A barra ocupa a largura toda do terminal. Num terminal estreito, modelo, custo e limites empilham em linhas próprias.

## O que aparece

| Linha | O que mostra |
| --- | --- |
| Régua | A linha de cima. Com trabalho em curso, um pulso `━` nasce no centro e corre para as duas pontas. |
| Cabeçalho | Modelo e effort do último pedido, **clicáveis** (veja Uso). A faísca do Claude (`· ✢ ✳ ✶ ✻ ✽`) pulsa enquanto o turno roda e fica apagada quando está ocioso. Custo e limites encostam à direita na mesma linha quando cabem. |
| Custo | Total da sessão (o mesmo que `/cost` soma, subagentes incluídos) e quanto foi gasto desde o último prompt. Duas casas decimais (`$1.75`). O total acende com `▲` por um instante sempre que cresce. |
| Trabalho | Só durante um turno: um cometa de faíscas `✳✶✻·····` correndo, tempo decorrido, quantas ferramentas foram chamadas e a última delas. |
| Limites | Janelas de 5 horas e 7 dias, com quanto falta para zerar. Só aparece em contas que reportam limite. |
| Agentes | Uma linha por subagente, teammate ou agente de workflow: o nome surge de um punhado de faíscas que assentam letra a letra; depois, faísca pulsando, brilho no nome e um cometa próprio, cada um fora de fase do vizinho; tempo, ferramentas e a última chamada. Ao terminar vira `✓` com um estouro de faíscas que rareia, duração e tokens (ou `✗` se falhou) e some depois de 8 segundos. No máximo 6 linhas; o resto vira `+N agentes`. |

A animação só roda enquanto há trabalho em curso (um turno, um agente, ou o estouro de quem acabou de terminar). Parada, a barra não redesenha.

As animações seguem as técnicas da skill `ascii-animations` (onda que se propaga, máquina de estados por caractere com atraso irregular, partículas que rareiam com a idade), adaptadas para o terminal: tudo é função do quadro, sem sorteio, então cada redesenho mostra a mesma coisa.

## Instalação

No prompt de uma sessão do Claude Code no terminal:

```
/plugin install legends-claude --marketplace leolegends/legends-claude
```

Ou direto do shell:

```
claude plugin install legends-claude --marketplace leolegends/legends-claude
```

O Claude Code pergunta `Add marketplace?` (responda `y`) e depois o escopo: escolha **user** para o card valer em todas as sessões. Ele passa a funcionar na hora, sem reiniciar.

No app desktop, onde `/plugin` não roda: clique em **+** ao lado do prompt, depois **Plugins**, **Add marketplace** com `leolegends/legends-claude` e **Add plugin**.

Para atualizar: `claude plugin update legends-claude` e depois `/reload-plugins`.
Para remover: `claude plugin uninstall legends-claude`.

## Uso

- **Clique no modelo** (`Fable 5.2`) abre um seletor na própria barra: `modelo  ● Fable  Opus  Sonnet  Haiku  ✕`. Clicar num deles roda `/model <nome>`, como se você tivesse digitado: a troca é a da sessão e, como todo `/model`, fica salva como padrão das próximas.
- **Clique no effort** (`high`) abre `effort  low  medium  ● high  xhigh  max  ✕` e roda `/effort <nível>`.
- No meio de um turno a troca entra na fila e vale quando o turno termina. `✕` (ou clicar de novo no modelo/effort) fecha o seletor sem trocar nada.
- `▾` no canto do card esconde; `◂ status` traz de volta.
- `/legends-claude` alterna entre escondido e visível.
- O card precisa de pelo menos 60 colunas de terminal. Abaixo disso ele não desenha.

## Requisitos e limites

- Claude Code com suporte a mods (function hooks). Escrito e testado na versão 2.1.322. Essa API está em acesso antecipado e pode mudar entre versões.
- O custo por agente não aparece: o Claude Code só expõe o custo total da sessão. Por agente, o card mostra os tokens do último turno.
- O effort aparece a partir do primeiro pedido ao modelo depois que o plugin carrega; antes disso a barra mostra `effort`, já clicável.
- O seletor de modelo usa os apelidos `fable`, `opus`, `sonnet` e `haiku`; um modelo que a sua conta não tem é recusado pelo próprio `/model`, e a barra avisa.
- O plugin não acessa rede nem arquivos. Ele lê o uso da sessão e a lista de agentes, e guarda o próprio estado na sessão.

## Desenvolvimento

```
claude plugin validate .
claude plugin test .
claude --plugin-dir .        # roda uma sessão com o plugin carregado desta pasta
```

- `hooks/register.tsx`: o módulo de hooks (eventos, estado e desenho).
- `types/index.d.ts`: o contrato do estado que o plugin guarda.
- `hooks/lines.test.ts`: funções puras (formatos, animações, linhas do card, conferência de agentes).
- `hooks/card.test.tsx`: o card montado em cada superfície e o ciclo de vida de um agente.

## Créditos e licença

MIT. Algumas funções auxiliares foram adaptadas de [claude-statuspane](https://github.com/xuanji86/claude-statuspane) (MIT), de Anji Xu.
