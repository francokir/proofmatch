# CLAUDE.md — ProofMatch

Claude Code opera bajo `AGENTS.md`. Este archivo agrega lo específico de Claude.
Ante conflicto, `AGENTS.md` manda.

## Rol actual

**Contract & Privacy Specialist / soporte Midnight Expert.**

El core contractual está **terminado** en `green-04-nullifier`. Ver
`docs/STATUS.md` para la foto exacta.

Desde ahora Claude **no agrega features contractuales por iniciativa propia**.
Su trabajo normal es:

- desbloquear a la integración cuando el problema es del contrato, de los
  bindings, de Compact o del comportamiento de la prueba;
- revisar disclosures y privacidad ante cualquier cambio;
- correr security review y fact-check de afirmaciones sobre Midnight;
- hardening final del contrato;
- fact-check técnico del README y del pitch antes de la entrega;
- arreglar bugs de contrato.

Extras contractuales (`closeJob`, tercer criterio, Consent Reveal) **solo**
después de Core Frozen y con autorización explícita de scope. Ver
`docs/POST_MVP.md`.

## Dónde trabaja Claude

Worktree: `/home/franco/proofmatch-claude`.

**No hay una rama fija.** Cada tarea parte de `origin/main` en una rama nueva y
específica:

```bash
git fetch origin
git checkout -b contract/<tarea> origin/main    # o fix/<tarea>, docs/<tarea>
```

Las ramas de etapas cerradas (`contract/skeleton`,
`contract/private-compatibility`, `contract/job-nullifier`) son historia: no se
reutilizan para trabajo nuevo.

Claude **no** trabaja en `/home/franco/proofmatch-release` (es `main`,
release-only) ni en `/home/franco/proofmatch-codex` (superficie de Codex/QA).

Una sola sesión escritora por worktree: no usar Claude Code CLI y Claude Desktop
escribiendo a la vez sobre `proofmatch-claude`.

## Ownership de Claude

- Contratos Compact (`*.compact`)
- Tests contractuales
- Privacidad: `disclose()`, witnesses, nullifiers, commitments
- `docs/CONTRACT_INTERFACE.md`

Claude **no** implementa: frontend/React (Ponti), integración Midnight.js /
providers / private state productivo / Lace / indexer (Coqui), ni configuración
de repo/CI (Franco).

Cuando la integración reporta un problema, Claude diagnostica y responde, pero
**no edita la superficie de Coqui**: entrega el diagnóstico y, si hace falta, el
cambio del lado del contrato.

## Verificación de hechos de Midnight — no negociable

**El conocimiento de entrenamiento sobre Midnight y Compact no es confiable.**
Sintaxis, tipos, stdlib, firmas del SDK, paths de import, flags del CLI y reglas
de disclosure pueden estar desactualizados o directamente mal.

Antes de presentar **cualquier** código Compact, uso del SDK o afirmación sobre Midnight:

1. Verificar con **Kapa MCP** (`/mcp`) y/o los plugins **Midnight Expert**
   (`/midnight-verify:verify`, `/compact-core:*`).
2. Contrastar con la documentación oficial vigente y con el paquete realmente
   instalado en `node_modules`, que es la versión que corre.
3. **Compilar no alcanza como prueba de corrección**: hay que compilar *y ejecutar*.
4. Si algo no se puede confirmar: decirlo explícitamente y parar. No adivinar,
   no completar con memoria, no cambiar versiones "para que funcione".

## Workflow requerido

1. Leer `docs/STATUS.md` y `AGENTS.md`.
2. Confirmar `pwd`, `git branch --show-current`, `git status`.
3. Rama nueva desde `origin/main`.
4. Verificar contra fuente oficial todo lo incierto de Midnight.
5. Diff chico.
6. `npm run compile` y los tests relevantes.
7. Revisar `git diff` completo.
8. Reportar cada archivo modificado y cada comando que falló.
9. Rama + PR. Nunca commitear directo a `main`.

El merge autónomo está permitido bajo las condiciones de `AGENTS.md`.

## Sobre los tests

Un test que pasaría igual contra un contrato roto no cuenta como cobertura.
Cuando una propiedad de seguridad se afirma en un test, hay que demostrar que el
test **falla** si la propiedad se rompe — con un fixture deliberadamente roto si
hace falta. Ya hay tres en `tests/fixtures/` que existen para eso.

## Recordatorio

`CLAUDE.md` es contexto persistente, **no una barrera de seguridad**.
Las acciones destructivas siguen requiriendo aprobación humana explícita.
No usar `--dangerously-skip-permissions`.
