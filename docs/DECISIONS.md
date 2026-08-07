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
> Vigente, salvo por las ramas: `proofmatch-claude` ya no tiene rama fija — cada
> tarea parte de `origin/main`. Ver `docs/OWNERSHIP.md`.

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
> **SUPERADA** por «Starter oficial: `create-mn-app@0.5.0`, con npm», más abajo.
> Se conserva por trazabilidad.

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

## 2026-08-07 — Starter oficial: `create-mn-app@0.5.0`, con npm

**Reemplaza** la entrada anterior que dejaba `STARTER STATUS: BLOCKED`.

Se instaló el baseline hello-world de `create-mn-app@0.5.0` y quedó verde
(`green-01-starter`). El proyecto usa **npm**, no yarn. Los comandos reales
están en `docs/COMMANDS.md`.

---

## 2026-08-07 — Arquitectura: una instancia de contrato = una vacante

No hay abstracción para múltiples vacantes dentro de un contrato, y no se va a
agregar. La identidad de la vacante es la dirección de la instancia.

**Consecuencia:** el contexto de vacante en cualquier derivación criptográfica
es `kernel.self()`, no un campo del ledger.

---

## 2026-08-07 — Unidades del MVP

- Compensación (`jobMaximumCompensation`, `candidateMinimumCompensation`):
  **USD mensuales enteros**. Sin centavos, decimales, monedas ni períodos.
- Disponibilidad (`jobRequiredWeeklyHours`, `candidateAvailableWeeklyHours`):
  **horas por semana**.

**Por qué se cierra como decisión y no como campo del contrato:** Compact no
lleva unidades en los tipos. Si contrato, integración y UI no interpretan lo
mismo, la comparación da un resultado seguro y equivocado — y como el lado del
candidato es privado, el error sería indetectable. Se evaluó agregar un enum
sellado de unidad/período y se descartó: no hay razón técnica que lo exija en el
MVP y sumaría estado público.

**Vinculante para las tres capas.**

---

## 2026-08-07 — Qué es público y qué es privado

**Público (ledger):** `jobId`, `jobMaximumCompensation`,
`jobRequiredWeeklyHours` (los tres `sealed`), `jobState`, `matchCount`,
`usedNullifiers`.

**Privado (witnesses):** `candidateMinimumCompensation`,
`candidateAvailableWeeklyHours`, `candidateSecret`. Nunca tocan el ledger, no se
devuelven, y el circuito no los disclosa.

Los términos de la vacante son públicos por diseño: el candidato tiene que poder
leerlos antes de decidir si prueba compatibilidad.

`usedNullifiers` es público por necesidad: la red tiene que poder rechazar el
duplicado. Publica un hash one-way, no el secreto.

---

## 2026-08-07 — `candidateSecret`: privado, 32 bytes, CSPRNG, persistido

**Requisito normativo para la integración**, que el contrato no puede verificar:
32 bytes de un CSPRNG, generado una vez y persistido, **nunca** derivado de un
identificador del usuario.

**Evidencia:** el nullifier es `hash(dominio, dirección, secreto)` y los dos
primeros son públicos. Con un secreto de espacio enumerable, cualquiera
recomputa nullifiers y lee `usedNullifiers` para saber quién se postuló a cada
vacante.

**Alcance:** basta que sea estable **por vacante**. No hace falta un secreto
global compartido entre contratos — lo que rompe la deduplicación es la
rotación, no el alcance. Un secreto por contrato es el patrón nativo del
`levelPrivateStateProvider`, que namespacea por dirección.

---

## 2026-08-07 — Nullifier: `persistentHash` con `kernel.self()` como contexto

```compact
persistentHash<Vector<3, Bytes<32>>>([
  pad(32, "proofmatch:job-nullifier:v1"),
  kernel.self().bytes,
  candidateSecret()
])
```

Almacenamiento: `usedNullifiers: Set<Bytes<32>>`, con `member()` antes de
`insert()`.

**Por qué `kernel.self()` y no `jobId`:** `jobId` lo elige quien despliega y
puede repetirse a propósito. Con `jobId` como contexto, una vacante señuelo con
el mismo `jobId` produciría el mismo nullifier que la legítima — permitiendo
reconocer al candidato entre vacantes, o adelantarse a insertar su nullifier
para bloquearlo. La dirección es `Sha256(estado inicial, nonce)`: no se puede
elegir para colisionar.

**Domain separator:** `proofmatch:job-nullifier:v1`. Cualquier derivación futura
del mismo secreto —un commitment, un handle de Consent Reveal— debe usar su
propio dominio y no reusar el nullifier.

**Evidencia:** patrón oficial de la documentación de Midnight
(*smart-contract-security*, *preventing replay attacks*). Verificado ejecutando
el contrato compilado. Golden vector en la suite.

---

## 2026-08-07 — Un fallo de compatibilidad no consume el nullifier

En `proveMatch`, derivar/verificar/registrar el nullifier va **después** de las
dos condiciones de compatibilidad.

**Por qué:** si el orden se invirtiera, un intento incompatible quemaría el
nullifier del candidato y lo dejaría afuera de esa vacante para siempre. Con el
orden actual puede corregir sus valores y reintentar.

**Prueba:** el fixture `tests/fixtures/proofmatch-job-mutates-first.compact`
reproduce el bug, y un test verifica que la suite lo detecta.

---

## 2026-08-07 — Requisitos de privacidad para la capa de integración

Dos cosas que el contrato **no puede** garantizar y que son invariantes, no
conveniencias:

1. **El proof server debe ser local al candidato.** Para generar la prueba de un
   intento exitoso necesita la asignación de testigos: un proof server remoto
   vería la compensación y la disponibilidad en claro.
2. **No propagar al recruiter el motivo exacto de la incompatibilidad.** Los
   mensajes distinguen qué eje falló, lo cual es útil para el candidato en su
   propia UI. Enviado al empleador, y repetido contra vacantes con distinto
   máximo público, permitiría acorralar el salario.

---

## 2026-08-07 — Core contractual congelado

Desde `green-04-nullifier`, el contrato **no recibe features nuevas**. Solo se
tocan bugs y blockers reales de integración.

Los extras (`closeJob`, tercer criterio, Consent Reveal) quedan en
`docs/POST_MVP.md` y requieren Core Frozen más autorización explícita de scope.

---

## 2026-08-07 — Merge autónomo por owner

Un agente owner puede commitear, pushear, abrir PR y hacer squash merge de su
propio PR sin aprobación paso a paso, bajo las condiciones listadas en
`AGENTS.md`. Push directo a `main`, force push y merge con conflictos siguen
prohibidos sin excepción.

---

## 2026-08-07 — `onchain-runtime-v3` fijado en 3.0.0 como dependencia directa

La **matriz de compatibilidad oficial** de Midnight —Preview, Preprod y Mainnet—
fija **on-chain runtime 3.0.0** para Midnight.js 4.1.1 y compact-runtime 0.16.0.
`3.1.0` existe pero no está soportada en esta línea.

**Por qué una dependencia directa y no solo confiar en la resolución:**
`compact-runtime@0.16.0` pide `^3.0.0` y npm resolvía a 3.1.0, mientras
`midnight-js-protocol@4.1.1` la pide con pin exacto `3.0.0`. Eso dejaba **dos
copias físicas** del paquete. Como es `wasm-bindgen`, cada copia define su propia
clase `StateValue`: un objeto creado por una fallaba el `instanceof` de la otra
con `expected instance of StateValue`, rompiendo cualquier `callTx`.

Declararla en `dependencies` fuerza una única copia que satisface a ambos
parents. `overrides` **no** sirve: iguala las versiones pero deja las dos copias
anidadas y el mismatch persiste — verificado.

**Revisar esta decisión si se actualiza el toolchain.** Está acoplada a
`compact-runtime` y a `midnight-js-protocol`: si cualquiera de los dos cambia de
versión, hay que volver a la matriz oficial y realinear los tres a la vez.
Midnight.js 5.0.0 ya migra a `onchain-runtime-v4` bajo otro scope.

**Evidencia:** repro `callTx` before/after contra devnet local, y
`npm ls @midnight-ntwrk/onchain-runtime-v3` mostrando una sola copia deduplicada.

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
