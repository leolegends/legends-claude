# legends-claude

Um card acima do prompt do Claude Code que mostra o que importa enquanto você trabalha: **modelo e effort**, **custo da sessão e do turno**, **limites de uso** e **cada agente em execução**, com animação. Não mostra barra de contexto.

```
⠹ Fable 5.2 · high                                          ▾
$1.7500 ▲ sessão · turno +$0.2500
▱▰▰▱▱▱ 1m12s · 14 tools · Bash
5h ▰▰▱▱▱ 42% ↻2h10m · 7d ▰▱▱▱▱ 18%
⠋ Explore  buscar rotas HLS               12s · 4 tools · Grep
⠸ code-reviewer  revisar o diff           48s · 9 tools · Read
✓ planner  plano da feature                  1m02s · 12.4k tok
```

## O que aparece

| Linha | O que mostra |
| --- | --- |
| Cabeçalho | Modelo e effort do último pedido. Um giro enquanto o turno roda, `○` quando está ocioso. |
| Custo | Total da sessão (o mesmo que `/cost` soma, subagentes incluídos) e quanto foi gasto desde o último prompt. O total acende com `▲` por um instante sempre que cresce. |
| Trabalho | Só durante um turno: barra animada, tempo decorrido, quantas ferramentas foram chamadas e a última delas. |
| Limites | Janelas de 5 horas e 7 dias, com quanto falta para zerar. Só aparece em contas que reportam limite. |
| Agentes | Uma linha por subagente, teammate ou agente de workflow: giro e brilho no nome enquanto roda, tempo, ferramentas e a última chamada. Ao terminar vira `✓` com duração e tokens (ou `✗` se falhou) e some depois de 8 segundos. No máximo 6 linhas; o resto vira `+N agentes`. |

A animação só roda enquanto há trabalho em curso (um turno ou um agente). Parado, o card não redesenha.

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

- `▾` no canto do card esconde; `◂ status` traz de volta.
- `/legends-claude` alterna entre escondido e visível.
- O card precisa de pelo menos 60 colunas de terminal. Abaixo disso ele não desenha.

## Requisitos e limites

- Claude Code com suporte a mods (function hooks). Escrito e testado na versão 2.1.322. Essa API está em acesso antecipado e pode mudar entre versões.
- O custo por agente não aparece: o Claude Code só expõe o custo total da sessão. Por agente, o card mostra os tokens do último turno.
- O effort aparece a partir do primeiro pedido ao modelo depois que o plugin carrega.
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
