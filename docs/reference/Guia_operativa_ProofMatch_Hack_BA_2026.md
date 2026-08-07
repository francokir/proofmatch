# HACK BUENOS AIRES 2026

# GUIA OPERATIVA DEL VIERNES

**Creacion del repositorio, equipo, Git, Claude Code, Claude Desktop, Codex, WSL y protocolo de integracion**

> **Objetivo**  
> Que el equipo pueda empezar a desarrollar despues del kickoff sin improvisar: crear un unico repositorio publico, obtener un baseline verde, separar ramas y directorios, configurar cada agente y preservar `main` como estado demostrable.

**Preparado para:** Franco Matias Kirchheimer y equipo  
**Proyecto:** ProofMatch  
**Track:** Beginners Track  
**Contexto:** Primera hackathon presencial  
**Actualizado:** 06/08/2026

**Uso:** seguir en orden. No saltar gates. No ejecutar comandos competitivos antes del kickoff.

| Pieza | Decision operativa |
|---|---|
| Repositorio | Uno solo, publico, con licencia Apache 2.0 y `main` protegido. |
| Proyecto | Siempre bajo `/home/<usuario>/...`, nunca bajo `/mnt/c/...`. |
| Claude | Worktree propio para Compact, tests y privacidad. |
| Codex | Ramas/directorios propios para integracion, frontend, QA y documentacion. |
| Integracion | Solo por Pull Request y con compile/tests verdes. |

> Documento operativo. Los comandos exactos del starter y las indicaciones de los mentores prevalecen sobre esta guia.

---

## 1. Reglas no negociables antes de empezar

> **Regla cero**  
> No crear ni adaptar codigo especifico de ProofMatch antes del kickoff. La preparacion previa se limita a herramientas, tutoriales oficiales, documentos, planificacion y pruebas locales permitidas.

- [ ] Esperar la confirmacion oficial de inicio y escuchar cambios de reglas o consigna.
- [ ] Confirmar con un mentor que starter, red y versiones son las recomendadas.
- [ ] Trabajar inicialmente en Local. No usar Preview, Preprod o Mainnet sin autorizacion expresa.
- [ ] No copiar codigo competitivo desde TurnoBot, proyectos universitarios ni prototipos previos.
- [ ] No instalar o actualizar dependencias por impulso. El lockfile y el README del starter mandan.
- [ ] No pedir seeds, claves, contrasenas, fondos reales ni datos personales reales.

### 1.1 Jerarquia de autoridad

| Prioridad | Fuente de verdad |
|---:|---|
| 1 | Documentacion oficial vigente de Midnight, Anthropic, OpenAI y GitHub. |
| 2 | README, lockfile y scripts del starter indicado durante el evento. |
| 3 | Compilador Compact y tests reales. |
| 4 | Indicaciones de mentores y reglas del evento. |
| 5 | Decisiones registradas por el equipo. |
| 6 | Sugerencias de Claude, Codex u otra IA. |

### 1.2 Modelo mental de carpetas

```text
/home/franco/proofmatch-release    # main, integracion y demo
/home/franco/proofmatch-claude     # Claude: Compact, tests, privacidad
/home/franco/proofmatch-codex      # Franco + Codex: QA, docs, coordinacion
```

Cada amigo trabaja en su propia notebook, su propio clon, su propia cuenta de GitHub y su propia cuenta de Codex. Nadie comparte sesiones, tokens o credenciales.

### 1.3 Regla de oro

> **Un cambio, una prueba, un commit**  
> Cambiar una cosa. Revisar el diff. Compilar. Correr tests. Hacer un commit verde. Recien despues avanzar.

---

## 2. Secuencia exacta del kickoff

1. Escuchar reglas y consigna. Anotar cualquier cambio respecto de la planificacion previa.
2. Confirmar el starter. Preguntar cual repositorio, template o generador debe usarse.
3. Confirmar la red. Para Beginners Track, mantener Local salvo autorizacion escrita.
4. Registrar versiones. Copiar Node, Yarn, Compact compiler, proof server y paquetes del starter.
5. Crear el repositorio publico. Usar una sola cuenta propietaria y licencia Apache 2.0.
6. Agregar colaboradores. Esperar que todos acepten antes de empezar.
7. Obtener baseline verde. Instalar, compilar y testear sin modificar la logica.
8. Etiquetar el baseline. Crear `green-01-starter` como punto de rescate.
9. Clonar y validar en las tres notebooks. Nadie desarrolla hasta que todos puedan ejecutar el starter.
10. Crear ramas y worktrees. Asignar ownership antes de pedir cambios a una IA.
11. Crear instrucciones compartidas. `AGENTS.md`, `CLAUDE.md` y documentos de decisiones.
12. Empezar la primera ola paralela. Contrato, integracion y UI en zonas separadas.

### 2.1 Preguntas obligatorias al mentor

- [ ] ¿Este es el starter correcto para la entrega?
- [ ] ¿Que comando exacto compila el contrato y que comando ejecuta los tests?
- [ ] ¿La entrega debe ejecutarse en Local, Preview o Preprod?
- [ ] ¿Que versiones del toolchain recomiendan para hoy?
- [ ] ¿Que archivos generados deben quedar en Git y cuales no?
- [ ] ¿Como esperan que se demuestre el caso negativo y el replay?

> **No adivinar**  
> Si el starter o una API no estan claros, detenerse. Consultar Kapa, documentacion oficial y mentor. No dejar que una IA invente sintaxis o cambie versiones para "hacerlo funcionar".

---

## 3. Crear el repositorio de GitHub

Ejecutar solamente despues del kickoff y de confirmar el starter. El repositorio debe vivir localmente bajo `/home`, no en el disco C: montado.

### 3.1 Verificar GitHub CLI y Git

```bash
cd ~
gh auth status
git config --global user.name
git config --global user.email
```

Si GitHub CLI no esta autenticado:

```bash
gh auth login
gh auth setup-git
```

Elegir GitHub.com, HTTPS y "Login with a web browser".

### 3.2 Elegir una de estas rutas

> **Decision del mentor**  
> No ejecutar las dos rutas. Elegir solo la que corresponda al starter oficial.

#### Ruta A - El evento entrega un template de GitHub

```bash
cd /home/franco
gh repo create francokir/proofmatch \
  --public \
  --template OWNER/TEMPLATE \
  --clone
```

Reemplazar `OWNER/TEMPLATE` por el repositorio confirmado. Verificar si la licencia ya viene incluida antes de agregar otra.

#### Ruta B - El evento pide crear un repositorio vacio

```bash
cd /home/franco
gh repo create francokir/proofmatch \
  --public \
  --license apache-2.0 \
  --clone
```

Luego, dentro de `/home/franco/proofmatch`, ejecutar exactamente el generador o los pasos del README indicados por el evento.

### 3.3 Verificacion inmediata

```bash
cd /home/franco/proofmatch
pwd
git remote -v
git branch --show-current
git status
```

| Chequeo | Resultado esperado |
|---|---|
| `pwd` | `/home/franco/proofmatch` |
| remote | `origin` apunta a `github.com/francokir/proofmatch` |
| branch | `main` o la rama por defecto indicada |
| status | Sin cambios inesperados |
| visibility | Public |
| license | Apache-2.0 |

---

## 4. Agregar a los integrantes y proteger main

### 4.1 Agregar colaboradores desde GitHub

1. Abrir el repositorio en GitHub.
2. Ir a **Settings**.
3. Abrir **Collaborators & teams**.
4. Pulsar **Add people**.
5. Buscar el usuario de GitHub de cada amigo.
6. Asignar acceso de escritura y enviar la invitacion.
7. Esperar que ambos acepten.

Opcion por terminal:

```bash
gh api --method PUT \
  repos/francokir/proofmatch/collaborators/USUARIO \
  -f permission=push
```

Repetir para cada usuario. La interfaz web es preferible porque permite verificar visualmente invitaciones y roles.

### 4.2 Proteccion minima de main

En **Settings > Branches** o **Rules > Rulesets**, crear una regla para `main`:

- [ ] Bloquear force pushes.
- [ ] Bloquear eliminacion de la rama.
- [ ] Requerir Pull Request antes de mergear.
- [ ] Requerir 1 aprobacion si el ritmo del evento lo permite.
- [ ] No exigir status checks hasta tener CI configurado y estable.
- [ ] Mantener una via de emergencia humana; no dar bypass automatico a agentes.

> **Main es release-only**  
> Claude y Codex nunca desarrollan directamente en `main`. `main` representa el ultimo estado integrado, compilable, testeado y demostrable.

### 4.3 Regla de acceso

| Actor | Puede | No puede |
|---|---|---|
| Franco | Crear repo, configurar reglas, revisar y mergear. | Saltar compile/tests o mergear secretos. |
| Integrantes | Crear ramas, push y Pull Requests. | Force push a main o editar zonas ajenas sin coordinar. |
| Claude / Codex | Trabajar en su rama y carpeta asignada. | Administrar colaboradores, cambiar protecciones o decidir el merge final. |

---

## 5. Crear el baseline verde

El baseline es el starter oficial sin cambios competitivos, instalado y validado. Es el primer punto de rescate del equipo.

### 5.1 Ejecutar el README exacto

```bash
cd /home/franco/proofmatch
nvm use 24.11.1
which node
node --version
docker info

# Ejecutar los comandos exactos del starter, por ejemplo:
yarn install
yarn compile
yarn test:local
```

> **Importante**  
> Los nombres `yarn compile` y `yarn test:local` son ejemplos del tutorial verificado. Si el starter usa otros scripts, usar los del README.

### 5.2 Gate del baseline

- [ ] Node apunta a `/home/<usuario>/.nvm/...`.
- [ ] Docker responde y los servicios requeridos estan saludables.
- [ ] Compact compila sin errores.
- [ ] Todos los tests oficiales pasan.
- [ ] `git status` no muestra secretos ni archivos raros.
- [ ] El flujo local del starter puede ejecutarse.

### 5.3 Crear punto de rescate

```bash
git status
git add .
git commit -m "chore: initialize official Midnight starter"
git push origin main

git tag -a green-01-starter -m "Official starter compiling and tests passing"
git push origin green-01-starter
```

Si el template ya incluye el commit inicial y no hay cambios, no crear un commit vacio: verificar y etiquetar el commit existente.

### 5.4 Validacion en cada notebook

```bash
cd ~
gh repo clone francokir/proofmatch
cd proofmatch
nvm use 24.11.1
# Seguir README
yarn install
yarn compile
yarn test:local
```

> **Gate de equipo**  
> Nadie empieza features hasta que las tres notebooks puedan clonar, instalar, compilar y testear el mismo commit.

---

## 6. Separar ramas y directorios con worktrees

En la notebook de Franco, cada agente tendra una carpeta fisica distinta. Esto evita que Claude y Codex editen los mismos archivos o confundan estados.

### 6.1 Preparar el clon de release

```bash
cd /home/franco
mv proofmatch proofmatch-release
cd proofmatch-release
git switch main
git status
```

### 6.2 Crear worktree de Claude

```bash
git worktree add \
  ../proofmatch-claude \
  -b contract/skeleton \
  main
```

### 6.3 Crear worktree de Codex de Franco

```bash
git worktree add \
  ../proofmatch-codex \
  -b franco/qa-docs \
  main
```

### 6.4 Verificar

```bash
git worktree list

cd ../proofmatch-claude
pwd
git branch --show-current
git status

cd ../proofmatch-codex
pwd
git branch --show-current
git status
```

| Directorio | Rama inicial | Uso |
|---|---|---|
| `/home/franco/proofmatch-release` | `main` | Integracion, QA final, demo y ultimo estado verde. |
| `/home/franco/proofmatch-claude` | `contract/skeleton` | Compact, tests contractuales y privacidad. |
| `/home/franco/proofmatch-codex` | `franco/qa-docs` | QA, documentacion, revision y coordinacion. |

> **Una sola sesion escritora**  
> No abrir Claude CLI y Claude Desktop escribiendo simultaneamente en `proofmatch-claude`. Tampoco abrir dos agentes Codex sobre el mismo worktree.

---

## 7. Reparto de ownership

| Responsable | Superficie principal | Archivos / tareas |
|---|---|---|
| Franco + Claude | Contrato y privacidad | `*.compact`, tests del contrato, disclosures, casos negativos, replay. |
| Integrante A + Codex | Integracion Midnight | Midnight.js, witnesses TypeScript, private state, Lace, providers, deploy/join, indexer. |
| Integrante B + Codex | Frontend y demo | React, CSS, estados de UX, loading, narrativa, pantallas y video. |
| Franco + Codex | QA y coordinacion | Docs, revision de diffs, Git, contingencias, README tecnico. |
| Franco humano | Release | Main, merges, alcance, freeze de features y demo final. |

### 7.1 Regla de zonas

- Un agente no toca la superficie de otro "porque es mas rapido".
- Si una tarea cruza zonas, primero se define una interfaz o contrato de integracion.
- Bindings generados se regeneran con el compilador; no se editan manualmente.
- Los cambios de dependencias requieren aprobacion humana y coordinacion de todos.
- Cada Pull Request declara los archivos modificados y las validaciones ejecutadas.

### 7.2 Ramas sugeridas

```text
contract/<tarea>
integration/<tarea>
ui/<tarea>
qa/<tarea>
docs/<tarea>
fix/<tarea>
```

Evitar nombres genericos como `test`, `cambios` o `final`. La rama debe explicar la responsabilidad.

### 7.3 Documentos compartidos

| Archivo | Proposito |
|---|---|
| `docs/STATUS.md` | Que funciona, que esta bloqueado y siguiente gate. |
| `docs/DECISIONS.md` | Decisiones de arquitectura y privacidad con fecha. |
| `docs/OWNERSHIP.md` | Quien puede tocar cada zona. |
| `docs/COMMANDS.md` | Comandos exactos que quedaron verdes. |
| `docs/DEMO.md` | Secuencia de demo y contingencias. |

---

## 8. Configurar Claude Code y Claude Desktop

### 8.1 Claude por terminal

```bash
cd /home/franco/proofmatch-claude
pwd
git branch --show-current
git status
claude
```

- [ ] Usar modo Manual o Ask for approval.
- [ ] No usar `--dangerously-skip-permissions`.
- [ ] Confirmar Kapa con `/mcp`.
- [ ] Ejecutar `/midnight-expert:doctor` antes de depender de plugins.
- [ ] Permitir solo checks de lectura hasta entender cada accion.

### 8.2 Claude Desktop sobre WSL

1. Abrir Claude Desktop y entrar en **Code**.
2. Crear una sesion nueva.
3. Elegir **Environment: WSL**.
4. Elegir **Distribution: Ubuntu**.
5. Elegir **Project folder: `/home/franco/proofmatch-claude`**.
6. Elegir **Permission mode: Manual / Ask**.
7. Confirmar que el prompt muestra la rama `contract/...` y el directorio Linux.

> **Interfaz comoda, mismo taller Linux**  
> Desktop puede ser la interfaz principal. Los comandos siguen ejecutandose dentro de Ubuntu y utilizan el toolchain instalado en WSL. Para diagnosticos o plugins que no aparezcan, usar la CLI.

### 8.3 `CLAUDE.md` inicial

```markdown
# ProofMatch - Claude instructions

## Role
Claude owns Compact contracts, contractual tests and privacy review.

## Allowed
- Compact source files
- Contract tests
- Privacy and interface documentation

## Forbidden
- Frontend and wallet integration implementation
- Secrets, seeds, credentials or real private data
- Manual edits to generated files
- Dependency updates without human approval
- Work on main
- Force push or destructive Git commands

## Required workflow
1. Read AGENTS.md and docs/STATUS.md.
2. Confirm pwd, branch and git status.
3. Check official examples/Kapa for uncertain Midnight facts.
4. Make a small diff.
5. Review git diff.
6. Compile and run relevant positive and negative tests.
7. Report every modified file and failed command.

## Authority
Official docs > starter README/lockfile > compiler/tests > mentors > team decisions > AI.
```

`CLAUDE.md` es contexto persistente, no una barrera de seguridad. Las acciones peligrosas deben seguir requiriendo aprobacion y, si hace falta, hooks probados.

---

## 9. Configurar Codex en WSL y en Desktop

### 9.1 Instalar Codex CLI dentro de Ubuntu

```bash
cd ~
curl -fsSL https://chatgpt.com/codex/install.sh | sh
source ~/.bashrc
codex --version
```

Cada integrante ejecuta Codex desde su propio clon o rama y se autentica con su propia cuenta de ChatGPT.

### 9.2 Abrir Codex CLI en la rama correcta

```bash
cd /home/franco/proofmatch-codex
pwd
git branch --show-current
git status
codex
```

- [ ] Mantener sandbox / Ask for approval.
- [ ] No habilitar Full access salvo una necesidad concreta y comprendida.
- [ ] No permitir que Codex salga del directorio asignado.

### 9.3 Configurar ChatGPT Desktop para que el agente corra en WSL

1. Abrir Settings en la aplicacion de ChatGPT/Codex.
2. Cambiar el agente de Windows native a WSL.
3. Reiniciar la aplicacion: el cambio no se aplica hasta reiniciar.
4. Agregar proyecto con `Ctrl+O`.
5. Escribir `\\wsl$\` en el selector de archivos.
6. Elegir `Ubuntu > home > franco > proofmatch-codex`.
7. Mantener Ask for approval debajo del composer.

> **No mezclar agentes**  
> Si el proyecto vive en `/home/franco`, configurar el agente Desktop en WSL. No dejarlo en Windows native para ese repo: las herramientas Midnight viven en Linux.

### 9.4 CLI y Desktop no comparten todo automaticamente

La app de Windows y Codex CLI dentro de WSL usan homes de configuracion distintos por defecto. Para la hackathon, no sincronizar carpetas de configuracion salvo que sea necesario: autenticar cada superficie y mantener instrucciones en el repositorio mediante `AGENTS.md`.

---

## 10. `AGENTS.md` compartido para Codex

```markdown
# AGENTS.md

## Repository policy
- main is release-only.
- Work only on the current assigned branch and directory.
- Confirm pwd, branch and git status before modifying files.
- Do not edit files owned by another role.
- Do not update dependencies without human approval.
- Do not edit generated files manually.
- Never read, print or commit secrets, seeds or credentials.
- Never force push.
- Never run destructive Git commands.
- Do not commit or push until validations pass.

## Required validation
- Review git diff and git diff --check.
- Run the relevant compile/build command.
- Run relevant tests.
- Report modified files and failed commands honestly.

## Authority
Official Midnight docs > starter README/lockfile > compiler/tests > mentors > docs/DECISIONS.md > AI.
```

### 10.1 Reglas por subdirectorio

Una vez conocida la estructura real del starter, se pueden agregar instrucciones mas especificas:

```text
contracts/AGENTS.md
src/integration/AGENTS.md
src/ui/AGENTS.md
docs/AGENTS.md
```

Ejemplo: `contracts/AGENTS.md` puede exigir tests negativos; `src/ui/AGENTS.md` puede prohibir imports directos de archivos generated.

### 10.2 Prompt inicial recomendado para cualquier Codex

```text
Antes de editar:
1. Mostra pwd, branch y git status.
2. Lee AGENTS.md y docs/STATUS.md.
3. Resume el ownership de esta tarea.
4. Propone un plan de 3-5 pasos.
5. No edites hasta confirmar que no tocaras archivos de otra superficie.

Restricciones:
- Sin cambios de dependencias.
- Sin secretos ni .env.
- Sin generated manual.
- Sin commit/push hasta que compile y los tests pasen.
- Detenete si una API de Midnight no esta confirmada por docs/starter.
```

> **Prompts acotados**  
> Pedir una tarea concreta, una referencia oficial, archivos permitidos, archivos prohibidos y un gate de salida. Evitar "construi toda la DApp".

---

## 11. Flujo de trabajo diario por tarea

### 11.1 Antes de editar

```bash
pwd
git status
git branch --show-current
git fetch origin
git rebase origin/main
```

Si la rama aun no existe:

```bash
git switch -c integration/nombre-tarea
# o contract/nombre-tarea, ui/nombre-tarea, qa/nombre-tarea
```

### 11.2 Durante el cambio

- Cambiar una sola regla o pieza por vez.
- No corregir diez errores secundarios: leer el primer error completo.
- Mantener el diff pequeno y revisar `git status` con frecuencia.
- No permitir que dos agentes escriban en la misma rama/directorio.

### 11.3 Antes de aceptar cambios

```bash
git status
git diff --stat
git diff
git diff --check
```

Luego ejecutar los comandos reales del starter, por ejemplo:

```bash
yarn compile
yarn test:local
```

### 11.4 Commit y Pull Request

```bash
git add ruta/archivo1 ruta/archivo2
git diff --cached
git commit -m "feat: describe el cambio"
git push -u origin NOMBRE-DE-RAMA
gh pr create --fill
```

Agregar archivos especificos, no usar `git add .` por reflejo cuando haya outputs o archivos no revisados.

### 11.5 Gate de merge

| Gate | Condicion |
|---|---|
| Ownership | El PR toca solamente la superficie asignada o documenta la excepcion. |
| Contrato | Compact compila. |
| Tests | Casos positivos, negativos y replay relevantes pasan. |
| Diff | No contiene secretos, seeds, logs ni generated manual. |
| Dependencias | No cambian sin justificacion y aprobacion. |
| Integracion | No rompe el flujo principal ni la demo. |
| Documentacion | STATUS/DECISIONS se actualizan si corresponde. |

---

## 12. Seguridad: lo que ningun agente puede hacer

| Categoria | Prohibido / requiere freno humano |
|---|---|
| Secretos | Leer, mostrar, copiar o commitear `.env`, seed phrases, private keys, tokens o contrasenas. |
| Git destructivo | `git push --force`, `git reset --hard`, borrar ramas remotas o reescribir `main`. |
| Filesystem | `sudo` por reflejo, `rm -rf`, `chmod` masivo o mover el proyecto a `/mnt/c`. |
| Dependencias | `yarn upgrade`, borrar lockfile, cambiar versiones aisladas o instalar paquetes pesados sin aprobacion. |
| Generated | Editar bindings, artefactos ZK, `node_modules` o outputs managed manualmente. |
| Tests | Desactivar asserts, saltar tests o modificar expectativas para ocultar un fallo. |
| Privacidad | Publicar un input privado, agregar `disclose()` sin justificar o loguear datos sensibles. |
| Redes | Desplegar en Preview, Preprod o Mainnet sin decision humana y permiso del evento. |

### 12.1 Checklist antes de commit

- [ ] `git status` revisado.
- [ ] `git diff` y `git diff --cached` leidos.
- [ ] No hay `.env`, seeds, tokens, logs ni archivos temporales.
- [ ] No hay generated editado manualmente.
- [ ] No hay cambios de `package.json` o lockfile inesperados.
- [ ] Compile verde.
- [ ] Tests relevantes verdes.
- [ ] Archivos modificados reportados por el agente.

> **Nunca pegues credenciales en un chat**  
> Los codigos OAuth, tokens y seeds son temporales o secretos. Si aparecen en una captura, cancelar el intento, generar uno nuevo y no reutilizarlo.

---

## 13. Cuando Claude y Codex se contradicen

1. Frenar ambas sesiones. No dejar que sigan editando para "probar quien tiene razon".
2. Aislar la discrepancia. Escribir la pregunta tecnica exacta y los archivos afectados.
3. Pedir evidencia. Cada agente debe citar README, documentacion oficial o ejemplo oficial.
4. Consultar Kapa / Midnight Expert. Usar la documentacion actual de Midnight, no memoria del modelo.
5. Probar la opcion minima. En una rama de experimento o diff pequeno, sin tocar `main`.
6. Dejar decidir al toolchain. Compiler y tests tienen prioridad sobre opiniones.
7. Consultar mentor si persiste. Especialmente para privacidad, versiones o reglas de entrega.
8. Registrar la decision. Anotar fecha, alternativas, evidencia y resultado en `docs/DECISIONS.md`.

### 13.1 Plantilla de decision

```markdown
## YYYY-MM-DD - Titulo

Problema:

Opcion A (Claude):
- Evidencia:
- Riesgos:

Opcion B (Codex):
- Evidencia:
- Riesgos:

Prueba ejecutada:
- Comando:
- Resultado:

Decision humana:

Consecuencia / archivos afectados:
```

> **Criterio de desempate**  
> Gana la solucion mas simple que sigue el starter, compila, pasa los tests y revela menos informacion. No gana el agente que suena mas convincente.

### 13.2 Si ambos necesitan el mismo archivo

- Definir primero quien es owner temporal.
- El otro agente trabaja sobre una interfaz, documento o test independiente.
- Mergear el primer cambio y actualizar la segunda rama antes de continuar.
- Nunca editar simultaneamente el mismo archivo desde dos worktrees/agentes.

---

## 14. Integrar a main y mantener un release limpio

### 14.1 Revision humana del Pull Request

- [ ] Leer el resumen y los archivos modificados.
- [ ] Confirmar que el PR pertenece al owner correcto.
- [ ] Revisar el diff completo, no solo la descripcion de la IA.
- [ ] Repetir compile y tests en `proofmatch-release` o en una rama de integracion.
- [ ] Verificar que no se agregaron dependencias, secretos o generated manual.
- [ ] Probar el flujo principal antes de mergear.

### 14.2 Actualizar el release worktree

```bash
cd /home/franco/proofmatch-release
git switch main
git pull --ff-only origin main
git status

# Validaciones del starter
yarn compile
yarn test:local
```

### 14.3 Commit verde y tags

Crear tags solamente en hitos repetibles, no en cada commit:

```bash
git tag -a green-02-contract -m "Contract MVP compiling and tests passing"
git push origin green-02-contract
```

| Tag sugerido | Significado |
|---|---|
| `green-01-starter` | Starter oficial intacto, compila y pasa tests. |
| `green-02-contract` | Contrato MVP y tests contractuales verdes. |
| `green-03-integration` | Lace/Midnight.js y flujo local funcionando. |
| `green-04-demo` | Demo end-to-end repetible y grabada. |
| `submission-final` | Estado exacto entregado. |

> **No seguir si el contrato esta rojo**  
> Si Compact no compila, volver al ultimo tag verde. No construir mas UI sobre un nucleo roto.

---

## 15. Checklist de arranque rapido

### Antes del kickoff

- [ ] Docker Desktop abierto y Engine running.
- [ ] Ubuntu/WSL2 abre correctamente.
- [ ] Node 24.11.1 activo mediante nvm.
- [ ] Compact compiler y proof server verificables.
- [ ] Claude Code login Max funciona.
- [ ] Kapa MCP conectado.
- [ ] Midnight Expert instalado y doctor pendiente/verde.
- [ ] Codex disponible en cada cuenta/notebook.
- [ ] Usuarios de GitHub de los amigos anotados.

### Despues del kickoff

- [ ] Reglas y starter confirmados con mentor.
- [ ] Repositorio publico creado con Apache 2.0.
- [ ] Colaboradores invitados y aceptados.
- [ ] Main protegido contra force push y delete.
- [ ] Starter instalado sin modificar.
- [ ] Compile y tests verdes.
- [ ] Tag `green-01-starter` creado.
- [ ] Tres notebooks verificadas.
- [ ] Worktrees/ramas creados.
- [ ] `AGENTS.md` y `CLAUDE.md` agregados.
- [ ] Ownership registrado.

### Primera ola de trabajo

- [ ] Claude: contrato minimo + caso positivo y negativo.
- [ ] Codex integracion: driver/witness/private state siguiendo interfaz acordada.
- [ ] Codex UI: shell visual y estados sin simular prueba.
- [ ] Codex QA/docs: comandos, riesgos, decisiones y checklist de demo.
- [ ] Franco: coordinacion, revisiones y merges.

> **Objetivo de las primeras horas**  
> Obtener un contrato minimo que compile, un caso positivo y uno negativo, y una ejecucion local real antes de pulir la interfaz.

---

## 16. Troubleshooting y recuperacion

| Sintoma | Primera accion |
|---|---|
| `pwd` muestra `/mnt/c/...` | `cd ~` y volver a `/home/<usuario>/...` |
| Node incorrecto | `nvm use 24.11.1`; `which node`; `node --version` |
| Docker falla | Abrir/reiniciar Docker Desktop; `docker info` |
| Claude pide login otra vez | `claude auth status --text`; no compartir codigos OAuth. |
| Kapa desconectado | `claude mcp get midnight`; `claude mcp login midnight` |
| Plugin no aparece en Desktop | Abrir Claude CLI en el mismo worktree y ejecutar doctor alli. |
| Compile falla | Leer el primer error, archivo y linea; no actualizar versiones. |
| Tests fallan | Inspeccionar el caso exacto, inputs y asserts. |
| Repo roto | `git status`; `git diff`; `git log --oneline -5`; volver a tag verde. |
| Conflicto de ramas | Frenar agentes, resolver ownership y rebasear de forma humana. |

### 16.1 Recuperacion no destructiva

```bash
git status
git diff
git log --oneline -5

# Restaurar un archivo concreto, solo si se entiende que se pierde:
git restore ruta/al/archivo

# Crear rama de rescate antes de una operacion riesgosa:
git switch -c rescue/antes-de-cambio
```

> **No usar `reset --hard` a ciegas**  
> Puede borrar trabajo no guardado. Antes de cualquier operacion destructiva, revisar status/diff y crear una rama de rescate.

### 16.2 Si faltan pocas horas

- Mantener un contrato que compile.
- Mantener un caso positivo y uno negativo.
- Mantener prueba real, aunque la UI sea simple.
- Quitar integraciones externas y pantallas secundarias.
- Grabar video del ultimo estado funcional.
- No actualizar dependencias ni redisenar arquitectura.

---

## 17. Fuentes y alcance de esta guia

Documento preparado el 6 de agosto de 2026 a partir de los manuales del equipo y documentacion oficial verificada. Las interfaces y comandos pueden evolucionar; si una pantalla difiere, priorizar la documentacion oficial y el README del starter del evento.

### 17.1 Documentos del equipo

- Manual tecnico operativo - Hack Buenos Aires 2026. Entorno, WSL, Docker, Git, Compact y flujo de trabajo.
- Midnight desde cero - Hack Buenos Aires 2026. Privacidad programable, stack, Beginners Track, alcance y gates.

### 17.2 Documentacion oficial consultada

- Claude Code - Desktop / WSL: https://code.claude.com/docs/en/desktop
- Claude Code - Setup y troubleshooting: https://code.claude.com/docs/en/setup
- Claude Code - CLAUDE.md y memoria: https://code.claude.com/docs/en/memory
- Claude Code - Settings y permisos: https://code.claude.com/docs/en/settings
- Claude Code - CLI reference: https://code.claude.com/docs/en/cli-reference
- Codex CLI: https://learn.chatgpt.com/docs/codex/cli
- ChatGPT/Codex Desktop para Windows y WSL: https://learn.chatgpt.com/docs/windows/windows-app
- GitHub CLI - `gh repo create`: https://cli.github.com/manual/gh_repo_create
- GitHub - colaboradores: https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/managing-repository-settings/managing-teams-and-people-with-access-to-your-repository
- GitHub - branch protection: https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-protected-branches/managing-a-branch-protection-rule

### 17.3 Ultima advertencia

> **La guia organiza; el toolchain decide**  
> No memorizar todo. Poder reconocer la capa que falla, ejecutar los checks basicos, explicar ownership y volver rapido al ultimo estado verde.
