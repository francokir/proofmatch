# DECISIONS — ProofMatch

Decisiones de arquitectura, privacidad y proceso, con fecha y evidencia.
Una decisión registrada acá no se re-litiga: se actualiza con una nueva entrada.

---

## 2026-08-07 — Un solo repositorio público con `main` release-only

**Problema:** cómo organizar el trabajo de 3 personas y 4 agentes sin pisarse.

**Decisión humana:** un único repositorio público `francokir/proofmatch`, Apache-2.0,
con `main` protegido y release-only. Todo cambio entra por rama + Pull Request.

**Consecuencia:** ningún agente commitea directo a `main`. `main` siempre representa
el último estado integrado y demostrable.

---

## 2026-08-07 — Separación por worktrees en la notebook de Franco

**Problema:** Claude Code y Codex corriendo en la misma notebook pueden editar los
mismos archivos y confundir estados de Git.

**Decisión humana:** tres directorios físicos distintos sobre el mismo repositorio,
vía `git worktree`:

- `/home/franco/proofmatch-release` → `main`
- `/home/franco/proofmatch-claude` → `contract/skeleton`
- `/home/franco/proofmatch-codex` → `franco/qa-docs`

**Alternativa descartada:** tres clones independientes. Duplicaría el object store y
haría más fácil desincronizar estados.

**Consecuencia:** una sola sesión escritora por worktree. Los tres comparten el
mismo `.git` en `proofmatch-release`.

---

## 2026-08-07 — Todo el proyecto bajo `/home`, nunca bajo `/mnt/c`

**Evidencia:** el toolchain de Midnight (Node vía nvm, Compact, Docker) vive en Linux.
Trabajar desde el disco de Windows montado degrada performance y rompe permisos.

**Consecuencia:** los agentes Desktop (Claude Desktop, ChatGPT/Codex Desktop) se
configuran en modo WSL/Ubuntu, no en Windows native.

---

## 2026-08-07 — No instalar starter antes de confirmarlo con un mentor

**Problema:** hay múltiples starters y templates de Midnight; elegir mal cuesta horas.

**Decisión humana:** no instalar nada hasta que un mentor confirme cuál es el starter
oficial de la entrega, y con qué comandos compila y testea.

**Consecuencia:** `STARTER STATUS: BLOCKED`. No se crea `green-01-starter` todavía.
Ver `docs/STATUS.md`.

---

## 2026-08-07 — Bootstrap de contexto compartido por commit directo a `main`

**Problema:** los agentes necesitan `AGENTS.md`/`CLAUDE.md`/`docs` antes de que exista
el flujo de PR, y `main` todavía no estaba protegido.

**Decisión humana (Franco):** autorizar **un único** commit directo a `main` con
documentación y configuración, sin código de producto ni dependencias. Inmediatamente
después, activar la protección de `main`.

**Consecuencia:** a partir de ese punto, todo cambio a `main` requiere Pull Request.

---

## Plantilla para nuevas decisiones

```markdown
## YYYY-MM-DD — Título

Problema:

Opción A (Claude):
- Evidencia:
- Riesgos:

Opción B (Codex):
- Evidencia:
- Riesgos:

Prueba ejecutada:
- Comando:
- Resultado:

Decisión humana:

Consecuencia / archivos afectados:
```

> **Criterio de desempate:** gana la solución más simple que sigue el starter,
> compila, pasa los tests y revela menos información. No gana el agente que suena
> más convincente.
