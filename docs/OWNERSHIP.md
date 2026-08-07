# OWNERSHIP — ProofMatch

Quién puede tocar cada zona. Un agente no toca la superficie de otro.

## Personas y agentes

| Responsable | Superficie | Archivos / tareas |
|---|---|---|
| **Franco + Claude Code** | Contrato y privacidad | `*.compact`, tests contractuales, disclosures, casos negativos, replay |
| **Coqui + su Codex** | Integración Midnight | Midnight.js, providers, witnesses TypeScript, private state, Lace, deploy/join, indexer |
| **Ponti + su Codex** | Frontend y demo | React, CSS, estados de UX, loading, copy, narrativa, pantallas, video |
| **Franco + su Codex** | QA y coordinación | Docs, revisión de diffs, Git, contingencias, README técnico |
| **Franco (humano)** | Release | `main`, merges, alcance, freeze de features, demo final |

## Worktrees en la notebook de Franco

| Directorio | Rama | Uso |
|---|---|---|
| `/home/franco/proofmatch-release` | `main` | Integración, QA final, demo, último estado verde. **Release-only.** |
| `/home/franco/proofmatch-claude` | `contract/skeleton` | Claude Code: Compact, tests contractuales, privacidad |
| `/home/franco/proofmatch-codex` | `franco/qa-docs` | Codex de Franco: QA, docs, coordinación |

Coqui y Ponti trabajan en **su propia notebook, su propio clon y su propia cuenta**.
Nadie comparte sesiones, tokens ni credenciales.

## Ramas iniciales

| Rama | Owner |
|---|---|
| `main` | Franco (release-only, protegida) |
| `contract/skeleton` | Franco + Claude |
| `franco/qa-docs` | Franco + su Codex |
| `integration/provider-foundation` | Coqui + su Codex |
| `ui/product-shell` | Ponti + su Codex |

## Reglas de zona

- Un agente no toca la superficie de otro "porque es más rápido".
- Si una tarea cruza zonas, **primero** se define una interfaz o contrato de integración.
- Bindings y archivos generados se regeneran con el compilador; no se editan a mano.
- Cambios de dependencias: aprobación de Franco y coordinación con todos.
- Cada PR declara los archivos modificados y las validaciones ejecutadas.

## Archivos compartidos

`AGENTS.md`, `CLAUDE.md` y `docs/*` son de todos pero los edita **Franco + su Codex**.
Si otro agente necesita cambiarlos, lo propone; no los edita por su cuenta.

**Si dos agentes necesitan el mismo archivo: PARAR y coordinar con Franco.**
Se define un owner temporal, el otro trabaja sobre una interfaz o test independiente,
se mergea el primer cambio y recién después se actualiza la segunda rama.
