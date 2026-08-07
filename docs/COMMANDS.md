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
| CLI `compact` (developer tools) | `0.5.1` | `compact --version` |
| **Compilador Compact** | `0.31.1` | `compact compile --version` |
| Estado del compilador | Up to date | `compact check` |
| Docker | `29.6.2`, servidor respondiendo | `docker --version`, `docker info` |
| Git | `2.53.0` | `git --version` |

> Ojo: `compact --version` (0.5.1) es el CLI, **no** el compilador.
> El compilador es 0.31.1. No confundirlos al reportar versiones.
>
> **Este repo usa `npm`.** No usar `yarn`, aunque aparezca en documentos
> históricos o en el plan narrativo.

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

## Git — empezar una tarea

Cada tarea parte de `origin/main` en una rama nueva. No se reutilizan ramas de
etapas cerradas.

```bash
git fetch origin
git checkout -b <tipo>/<tarea> origin/main
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

Todos verificados sobre `main`. Requieren Node 24.11.1 y el compilador Compact
0.31.1.

```bash
npm ci                    # instalar exactamente el lockfile
npm run compile           # compila hello-world y proofmatch-job
npm run test:contract     # 82 tests contractuales (requiere compile previo)
npm test                  # alias de test:contract
npm run build             # tsc --noEmit
```

`npm run compile` es prerequisito de `npm run test:contract`: los tests importan
los bindings generados desde `contracts/managed/`.

Para compilar un solo contrato:

```bash
npm run compile:proofmatch-job
npm run compile:hello-world
```

## Devnet local y E2E

`npm run test:e2e` necesita el devnet levantado **y** un deploy previo en ese
mismo worktree. El estado de deploy vive en `.midnight-state.json`, que está
gitignored y es local a cada worktree: un worktree recién creado no lo tiene y
el E2E falla con `No deploy on file for network undeployed`. Eso no es una
regresión.

```bash
docker compose up -d      # node + indexer + proof-server
npm run setup             # devnet + compile + deploy; escribe .midnight-state.json
npm run test:e2e          # reconecta al contrato desplegado y lee su estado
docker compose down       # apagar
docker compose down -v    # apagar y borrar volúmenes (estado desde cero)
```

`npm run setup` usa una **seed de génesis conocida**: solo devnet local. Ver el
aviso en `docs/BASELINE_HELLO_WORLD.md`.

Otros scripts del starter, todos existentes en `package.json`:

```bash
npm run deploy            # desplegar el contrato compilado
npm run cli               # interactuar con el contrato desplegado
npm run check-balance     # balances NIGHT / DUST
npm run network           # ver o cambiar la red activa
npm run clean             # borra contracts/managed y el estado local
npm run proof-server:start / :stop   # ciclo de vida de docker compose
```

> `npm run deploy`, `npm run cli` y `npm run test:e2e` siguen apuntando al
> contrato `hello-world` del starter, no a `proofmatch-job`. Migrarlos es parte
> de la integración (Coqui).
