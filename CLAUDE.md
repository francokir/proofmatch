# CLAUDE.md — ProofMatch

Claude Code opera bajo `AGENTS.md`. Este archivo agrega lo específico de Claude.
Ante conflicto, `AGENTS.md` manda.

## Dónde trabaja Claude

**Worktree principal: `/home/franco/proofmatch-claude` — rama `contract/skeleton`**
(y ramas `contract/<tarea>` derivadas).

Claude **no** trabaja en `/home/franco/proofmatch-release` (es `main`, release-only)
ni en `/home/franco/proofmatch-codex` (superficie de Codex/QA).

Una sola sesión escritora por worktree: no usar Claude Code CLI y Claude Desktop
escribiendo a la vez sobre `proofmatch-claude`.

## Ownership de Claude

Claude es owner de:

- Contratos Compact (`*.compact`)
- Tests contractuales: caso positivo, caso negativo, replay
- Privacidad: `disclose()`, witnesses, commitments, nullifiers
- Documentación de privacidad e interfaces del contrato

Claude **no** implementa: frontend/React (Ponti), integración Midnight.js /
providers / Lace / indexer (Coqui), ni configuración de repo/CI (Franco).

## Verificación de hechos de Midnight — no negociable

**El conocimiento de entrenamiento sobre Midnight y Compact no es confiable.**
Sintaxis, tipos, stdlib, firmas del SDK, paths de import, flags del CLI y reglas
de disclosure pueden estar desactualizados o directamente mal.

Antes de presentar **cualquier** código Compact, uso del SDK o afirmación sobre Midnight:

1. Verificar con **Kapa MCP** (`/mcp`) y/o los plugins **Midnight Expert**
   (`/midnight-verify:verify`, `/compact-core:*`).
2. Contrastar con la documentación oficial vigente y el README del starter.
3. **Compilar no alcanza como prueba de corrección**: hay que compilar *y ejecutar*.
4. Si algo no se puede confirmar: decirlo explícitamente y parar. No adivinar,
   no completar con memoria, no cambiar versiones "para que funcione".

## Workflow requerido

1. Leer `AGENTS.md` y `docs/STATUS.md`.
2. Confirmar `pwd`, `git branch --show-current`, `git status`.
3. Verificar contra fuente oficial todo lo incierto de Midnight.
4. Hacer un diff chico.
5. Revisar `git diff`.
6. Compilar y correr los tests positivos y negativos relevantes.
7. Reportar cada archivo modificado y cada comando que falló.
8. Rama + PR. Nunca commitear directo a `main`.

## Recordatorio

`CLAUDE.md` es contexto persistente, **no una barrera de seguridad**.
Las acciones peligrosas siguen requiriendo aprobación humana explícita.
Mantener modo Manual / Ask for approval. No usar `--dangerously-skip-permissions`.
