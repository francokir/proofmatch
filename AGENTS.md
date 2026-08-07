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

| Superficie | Owner |
|---|---|
| Contrato Compact, tests contractuales, privacidad, disclosures | **Franco + Claude Code** |
| Integración Midnight.js, providers, witnesses TS, private state, Lace, indexer, deploy/join | **Coqui + su Codex** |
| UI React, CSS, estados de UX, copy, narrativa y demo | **Ponti + su Codex** |
| QA, documentación, Git, coordinación, revisión de diffs | **Franco + su Codex** |
| Release: `main`, merges, alcance, freeze, demo final | **Franco (humano)** |

Un agente **no toca la superficie de otro** "porque es más rápido".

**Si dos agentes necesitan el mismo archivo compartido: PARAR y coordinar con Franco.**
Se define un owner temporal; el otro trabaja sobre una interfaz, un test o un
documento independiente. Nunca se edita el mismo archivo desde dos worktrees a la vez.

## Antes de cualquier tarea importante

Leer, en este orden:

1. `docs/STATUS.md` — qué funciona, qué está bloqueado, cuál es el próximo gate.
2. `docs/DECISIONS.md` — decisiones ya tomadas; no re-litigarlas.
3. `docs/OWNERSHIP.md` — de quién es la zona que vas a tocar.
4. `docs/COMMANDS.md` — solo comandos ya verificados.

Y confirmar siempre `pwd`, `git branch --show-current` y `git status` antes de editar.

## Validación antes de commitear

- `git status` revisado.
- `git diff` y `git diff --cached` leídos completos.
- `git diff --check` sin errores.
- Sin `.env`, seeds, tokens, logs ni temporales.
- Sin archivos generados editados a mano.
- Sin cambios inesperados en `package.json` o lockfile.
- Compile verde y tests relevantes verdes (cuando exista starter).
- Reportar honestamente **todos** los archivos modificados y **todo** comando que falló.

## Jerarquía de autoridad

Documentación oficial de Midnight > README/lockfile del starter > compilador y tests
reales > mentores del evento > `docs/DECISIONS.md` > sugerencias de cualquier IA.

Gana la solución más simple que sigue el starter, compila, pasa los tests y revela
menos información. No gana el agente que suena más convincente.

## Referencia

Guía operativa completa del equipo: `docs/reference/Guia_operativa_ProofMatch_Hack_BA_2026.md`
