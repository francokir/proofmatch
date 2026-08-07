# COMMANDS — ProofMatch

**Solo comandos ya ejecutados y verificados.** Si un comando no está acá, no está confirmado.
No agregar comandos "que deberían funcionar".

## Toolchain verificado

Verificado en la notebook de Franco (Ubuntu/WSL2) el **2026-08-07**:

| Herramienta | Versión | Cómo se verificó |
|---|---|---|
| Node | `v24.11.1` | `node --version` |
| Ruta de Node | `/home/franco/.nvm/versions/node/v24.11.1/bin/node` | `which node` |
| npm | `11.6.2` | `npm --version` |
| Yarn | `1.22.22` | `yarn --version` |
| CLI `compact` (developer tools) | `0.5.1` | `compact --version` |
| **Compilador Compact** | `0.31.1` | `compact compile --version` |
| Estado del compilador | Up to date | `compact check` |
| Docker | `29.6.2`, servidor respondiendo | `docker --version`, `docker info` |
| Git | `2.53.0` | `git --version` |

> Ojo: `compact --version` (0.5.1) es el CLI, **no** el compilador.
> El compilador es 0.31.1. No confundirlos al reportar versiones.

```bash
node --version          # v24.11.1
which node              # debe apuntar a /home/<usuario>/.nvm/...
compact --version       # CLI: 0.5.1
compact compile --version  # compilador: 0.31.1
compact check           # confirma si el compilador está al día
docker info             # Docker debe responder desde WSL
```

Si `which node` apunta fuera de `/home/<usuario>/.nvm/...`, corregir con `nvm use 24.11.1`.

## Git — verificación de estado

```bash
pwd
git branch --show-current
git status --short
git remote -v
git log --oneline -5
git worktree list
```

## Git — worktrees (ya ejecutado en la notebook de Franco)

```bash
git worktree add ../proofmatch-claude -b contract/skeleton main
git worktree add ../proofmatch-codex  -b franco/qa-docs   main
```

## Git — antes de aceptar un cambio

```bash
git status
git diff --stat
git diff
git diff --check
```

## Git — commit y PR

```bash
git add ruta/archivo1 ruta/archivo2   # archivos específicos, no `git add .`
git diff --cached
git commit -m "feat: describe el cambio"
git push -u origin NOMBRE-DE-RAMA
gh pr create --fill
```

## Git — actualizar una rama desde main

```bash
git fetch origin
git rebase origin/main
```

## Build / test del proyecto

**PENDIENTE.** No hay starter instalado, así que no hay comandos de compile ni test
confirmados. No inventar `yarn compile` / `yarn test:local` ni ningún otro script
hasta que exista el starter oficial y su README.

Cuando el starter esté instalado y verde, documentar acá los comandos **exactos**
que quedaron verdes, con su salida esperada.
