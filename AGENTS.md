# AGENTS.md — ProofMatch

Reglas obligatorias para todo agente (Claude Code, Codex) y toda persona del equipo.
Aplica a cualquier worktree, clon y rama de este repositorio.

## Regla cero

`main` es **release-only**. Ningún agente desarrolla en `main`.
`main` representa el último estado integrado, compilable, testeado y demostrable.

## Prohibiciones duras

- No hacer `git push --force` ni `--force-with-lease`, sobre ninguna rama.
- No usar `git reset --hard`, `git clean -fdx` ni borrar ramas remotas.
- No commitear ni imprimir secretos: `.env` reales, seeds, mnemonics, private keys, tokens, contraseñas.
- No cambiar dependencias (agregar, actualizar, borrar, tocar el lockfile) sin aprobación explícita de Franco.
- No editar a mano bindings, artefactos ZK, `node_modules` ni ningún archivo generado. Se regeneran con el compilador.
- No inventar APIs, sintaxis ni funciones de Compact/Midnight. Si no está confirmado por documentación oficial, starter o compilador: **parar y preguntar**.
- No desplegar en Preview, Preprod ni Mainnet sin decisión humana.
- No mover el proyecto a `/mnt/c/...`. Todo vive bajo `/home/<usuario>/...`.

## Flujo de cambios

Todo cambio entra por **rama + Pull Request**. Sin excepciones.

```
contract/<tarea>      integration/<tarea>     ui/<tarea>
qa/<tarea>            docs/<tarea>            fix/<tarea>
```

**Un cambio, una prueba, un commit verde.** Cambiar una cosa, revisar el diff,
compilar, correr tests, commitear. Recién después avanzar.

## Ownership

Esta tabla es la fuente única. `docs/OWNERSHIP.md` cubre worktrees y ramas, no
vuelve a definir ownership.

| Superficie | Owner |
|---|---|
| Compact, tests contractuales, privacidad y disclosures, bugs de contrato, review Midnight | **Franco + Claude Code** |
| Integración TypeScript, private state, witnesses productivos, providers, Lace, deploy/join, indexer | **Coqui + su Codex** |
| UI, UX, frontend, demo | **Ponti + su Codex** |
| QA, documentación operativa, Git, coordinación | **Franco + su Codex** |
| Release: `main`, merges cross-owner, alcance, freeze, demo final | **Franco (humano)** |

Un agente **no toca la superficie de otro** "porque es más rápido".

**Si dos agentes necesitan el mismo archivo compartido: PARAR y coordinar con Franco.**
Se define un owner temporal; el otro trabaja sobre una interfaz, un test o un
documento independiente. Nunca se edita el mismo archivo desde dos worktrees a la vez.

Excepción registrada: `docs/CONTRACT_INTERFACE.md` lo mantiene Claude, porque
describe la interfaz real del contrato y se actualiza junto con él.

## Merge autónomo

Un agente owner **puede, sin pedir aprobación humana paso a paso**: commitear,
pushear su propia rama, abrir el PR, inspeccionarlo y hacerle squash merge.

Solo si se cumple **todo** esto:

- el cambio está dentro de su ownership;
- todos los gates relevantes están verdes;
- el PR está CLEAN / MERGEABLE;
- `main` no cambió de forma conflictiva;
- no cambia `dependencies` ni el lockfile;
- no cambia arquitectura global;
- no cambia el modelo de privacidad;
- no toca superficies ajenas;
- no introduce secretos.

Si falla cualquiera de esos puntos: **parar y reportar a Franco.** No forzar.

Siempre prohibido, sin excepción:

- push directo a `main`;
- `--force` / `--force-with-lease`;
- `reset --hard`;
- mergear con conflictos;
- saltear compile o tests;
- mergear cambios cross-owner sin coordinación humana.

Después de mergear: actualizar `main` en `proofmatch-release` por fast-forward,
correr el smoke check y, si la etapa lo amerita, crear el tag verde.

## Antes de cualquier tarea importante

Leer, en este orden:

1. `docs/STATUS.md` — la foto de ahora: qué existe, qué está activo, cuál es el próximo gate.
2. `docs/DECISIONS.md` — decisiones ya cerradas; no re-litigarlas.
3. `docs/COMMANDS.md` — solo comandos ya verificados.
4. `docs/HANDOFFS.md` — qué espera de vos otra línea, y qué podés esperar vos.

Según la tarea: `docs/ROADMAP.md` (dónde estamos), `docs/MVP_DEFINITION.md` (qué
significa terminado), `docs/CONTRACT_INTERFACE.md` (interfaz real del contrato).

Y confirmar siempre `pwd`, `git branch --show-current` y `git status` antes de editar.

## Validación antes de commitear

- `git status` revisado.
- `git diff` y `git diff --cached` leídos completos.
- `git diff --check` sin errores.
- Sin `.env`, seeds, tokens, logs ni temporales.
- Sin archivos generados editados a mano.
- Sin cambios inesperados en `package.json` o lockfile.
- Compile verde y tests relevantes verdes.
- Reportar honestamente **todos** los archivos modificados y **todo** comando que falló.

## Jerarquía de autoridad

Documentación oficial de Midnight > README/lockfile del starter > compilador y tests
reales > mentores del evento > `docs/DECISIONS.md` > sugerencias de cualquier IA.

Gana la solución más simple que sigue el starter, compila, pasa los tests y revela
menos información. No gana el agente que suena más convincente.

## Mapa de documentos

Cada archivo tiene una sola función. No dupliques contenido entre ellos.

| Archivo | Para qué |
|---|---|
| `AGENTS.md` | Reglas y ownership. Este archivo. |
| `CLAUDE.md` | Comportamiento específico de Claude Code. |
| `docs/STATUS.md` | La foto de ahora. Corto y siempre actual. |
| `docs/DECISIONS.md` | Decisiones cerradas, con evidencia. |
| `docs/COMMANDS.md` | Comandos verificados. |
| `docs/ROADMAP.md` | Qué falta y en qué orden. |
| `docs/MVP_DEFINITION.md` | Checklist binario de "terminado", y los non-goals. |
| `docs/HANDOFFS.md` | Interfaces entre las tres líneas y protocolo de blockers. |
| `docs/POST_MVP.md` | Extras. No se tocan antes de Core Frozen. |
| `docs/CONTRACT_INTERFACE.md` | Interfaz real del contrato. La mantiene Claude. |
| `docs/OWNERSHIP.md` | Worktrees y ramas activas. |

Guía operativa completa del equipo: `docs/reference/Guia_operativa_ProofMatch_Hack_BA_2026.md`
