# STATUS — ProofMatch

**Última actualización:** 2026-08-07
**Actualiza:** Franco + su Codex. Todo agente debe leer este archivo antes de una tarea importante.

## Estado real

Bootstrap operativo del repositorio. **Todavía no hay código de producto.**

## Qué existe

- Repositorio `francokir/proofmatch`: público, Apache-2.0, default branch `main`.
- Colaboradores aceptados: `francokir`, `vcoqui`, `lucaspontiggia-gif`.
- Tres worktrees locales en la notebook de Franco (ver `docs/OWNERSHIP.md`).
- Contexto compartido de agentes: `AGENTS.md`, `CLAUDE.md`, `docs/*`.
- Toolchain verificado en la notebook de Franco (ver `docs/COMMANDS.md`).

## Qué NO existe todavía

- **No hay starter oficial instalado.** El repo contiene únicamente `LICENSE` y documentación.
- **No hay baseline verde.** No existe el tag `green-01-starter`.
- No hay `package.json`, ni lockfile, ni scripts de build/test.
- No hay contrato Compact, ni integración Midnight.js, ni UI.
- No hay CI ni status checks.

## Bloqueante actual

**STARTER STATUS: BLOCKED — official starter not yet selected/installed.**

No se eligió ni confirmó el starter oficial del evento. Nadie instala nada hasta
que un mentor confirme:

- ¿Cuál es el repositorio/template/generador correcto para la entrega?
- ¿Qué comando exacto compila el contrato y cuál corre los tests?
- ¿La entrega corre en Local, Preview o Preprod?
- ¿Qué versiones del toolchain se recomiendan hoy?
- ¿Qué archivos generados van a Git y cuáles no?

## Próximo gate

1. Confirmar el starter oficial con un mentor.
2. Instalarlo en `proofmatch-release` sin modificar su lógica.
3. `install` + `compile` + `test` verdes.
4. Commit del starter intacto y tag `green-01-starter`.
5. Validar que las tres notebooks pueden clonar, instalar, compilar y testear el mismo commit.
6. Recién ahí: primera ola de trabajo en paralelo.

**Nadie empieza features antes del punto 5.**

## Riesgos abiertos

- Sin baseline verde no hay punto de rescate al cual volver si algo se rompe.
- Las tres notebooks todavía no validaron el mismo commit.
- Sin CI, la única validación es local y manual.
