# OWNERSHIP — worktrees y ramas

**La tabla de ownership vive en `AGENTS.md`.** Este archivo cubre solo lo
operativo: dónde trabaja cada uno y qué ramas están activas.

## Worktrees en la notebook de Franco

| Directorio | Rama | Uso |
|---|---|---|
| `/home/franco/proofmatch-release` | `main` | Integración, QA final, demo, último estado verde. **Release-only.** |
| `/home/franco/proofmatch-claude` | rama de la tarea en curso | Claude Code: Compact, tests contractuales, privacidad |
| `/home/franco/proofmatch-codex` | `franco/qa-docs` | Codex de Franco: QA, docs, coordinación |

`proofmatch-claude` **no tiene rama fija**: cada tarea parte de `origin/main` en
una rama nueva. Las ramas de etapas cerradas no se reutilizan.

Coqui y Ponti trabajan en **su propia notebook, su propio clon y su propia
cuenta**. Nadie comparte sesiones, tokens ni credenciales.

## Ramas

| Rama | Owner | Estado |
|---|---|---|
| `main` | Franco (release-only, protegida) | `a4e115b` |
| `integration/provider-foundation` | Coqui | activa, sin mergear |
| `ui/product-shell` | Ponti | creada, sin commits propios |
| `franco/qa-docs` | Franco + su Codex | sin commits propios |
| `contract/skeleton`, `contract/private-compatibility`, `contract/job-nullifier` | Franco + Claude | **cerradas**, mergeadas. No reutilizar. |

Convención de nombres: `contract/<tarea>`, `integration/<tarea>`, `ui/<tarea>`,
`qa/<tarea>`, `docs/<tarea>`, `fix/<tarea>`.

## Reglas de zona

- Un agente no toca la superficie de otro "porque es más rápido".
- Si una tarea cruza zonas, **primero** se define la interfaz. Ver `docs/HANDOFFS.md`.
- Bindings y archivos generados se regeneran con el compilador; no se editan a mano.
- Cambios de dependencias: aprobación de Franco, sin importar de quién sea la superficie.
- Cada PR declara los archivos modificados y las validaciones ejecutadas.

## Archivos compartidos

`AGENTS.md`, `CLAUDE.md` y `docs/*` los mantiene **Franco + su Codex**, con dos
excepciones registradas:

- `docs/CONTRACT_INTERFACE.md` lo mantiene **Claude**: describe la interfaz real
  del contrato y se actualiza junto con él.
- `CLAUDE.md` lo puede actualizar **Claude** cuando cambia su propio rol o
  workflow.

Cualquier otro agente que necesite cambiar un archivo compartido lo propone; no
lo edita por su cuenta.

**Si dos agentes necesitan el mismo archivo: PARAR y coordinar con Franco.**
