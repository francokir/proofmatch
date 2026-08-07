# HANDOFFS — ProofMatch

La interfaz **humana** entre las tres líneas. Qué entrega cada una y qué puede
esperar de las otras.

No duplica `docs/CONTRACT_INTERFACE.md`: para la interfaz técnica exacta del
contrato, ir ahí.

---

## CONTRACT → COQUI

**Estado: entregado.** `green-04-nullifier`, mergeado en `main`.

| Qué | Dónde |
|---|---|
| Fuente del contrato | `contracts/proofmatch-job.compact` |
| Bindings | `contracts/managed/proofmatch-job/` — gitignored, los genera `npm run compile` |
| **Interfaz completa** | `docs/CONTRACT_INTERFACE.md` ← fuente principal |

### Lo que hay que implementar

Un único circuito, **sin argumentos**:

```ts
proveMatch(context: CircuitContext<PS>): CircuitResults<PS, []>
```

Y los tres witnesses que el contrato declara:

```ts
export type Witnesses<PS> = {
  candidateMinimumCompensation(context: WitnessContext<Ledger, PS>): [PS, bigint];
  candidateAvailableWeeklyHours(context: WitnessContext<Ledger, PS>): [PS, bigint];
  candidateSecret(context: WitnessContext<Ledger, PS>): [PS, Uint8Array];
}
```

Unidades: compensación en **USD mensuales enteros**, disponibilidad en **horas
por semana**. No negociable por capa — ver `docs/DECISIONS.md`.

### Estado público legible

`jobId`, `jobMaximumCompensation`, `jobRequiredWeeklyHours`, `jobState`,
`matchCount`, `usedNullifiers`.

### Fallos esperados

Cada uno es un estado distinto de UX, no un error genérico:

| Mensaje | Significa |
|---|---|
| `compensation not compatible` | el candidato pide más de lo que la vacante paga |
| `weekly hours not compatible` | ofrece menos horas de las requeridas |
| `candidate already matched this job` | duplicado: su nullifier ya está registrado |
| `candidate compensation out of range` | valor privado en 0 |
| `candidate weekly hours out of range` | valor privado en 0 o mayor a 168 |
| `candidate secret not initialized` | private state sin inicializar |
| `job is not open` | la vacante no está `OPEN` |
| `malformed job terms` | términos on-chain inválidos |

### Requisitos innegociables

1. **`candidateSecret`: 32 bytes de CSPRNG**, generado una vez y persistido,
   nunca derivado de un identificador del usuario. Basta que sea estable por
   vacante; no hace falta un secreto global. El `levelPrivateStateProvider`
   namespacea por dirección de contrato, así que el patrón per-contrato es el
   nativo.
2. **El proof server debe ser local al candidato.** Uno remoto vería la
   compensación y la disponibilidad en claro al generar la prueba.
3. **No propagar al recruiter el motivo del fallo.** Se computa client-side y se
   queda client-side.

### Qué NO hay que hacer

- No editar `*.compact` ni los tests contractuales.
- No editar los bindings a mano: se regeneran con `npm run compile`.
- `npm run deploy`, `npm run cli` y `npm run test:e2e` todavía apuntan al
  `hello-world` del starter. Migrarlos es parte de la integración.

---

## COQUI → PONTI

Coqui expone una **capa propia de ProofMatch**. Ponti consume esa capa y nada
más abajo.

Conceptualmente, con capacidades como:

```text
connectWallet
proveMatch
readPublicState
refreshPublicState
resetDemo
```

Y estados observables:

```text
wallet:       not detected · locked · declined · connected
proof:        idle · generating · done · failed
transaction:  pending · submitted · confirmed · failed
indexing:     pending · synced
resultado:    compatible · incompatible · duplicate · error
```

**Los nombres finales los define Coqui** según la implementación real. Lo que no
cambia es que los tres resultados —compatible, incompatible, duplicado— tienen
que ser distinguibles por la UI.

**Ponti no importa providers, bindings ni el indexer directamente.** Si necesita
una capacidad que la capa no expone, se la pide a Coqui; no la implementa por su
cuenta.

---

## PONTI → EQUIPO

La UI debe poder representar:

- la vacante y sus términos públicos;
- el formulario de valores privados;
- el progreso de la prueba;
- resultado compatible;
- rechazo por incompatibilidad;
- rechazo por duplicado;
- Match Pass;
- vista de recruiter;
- Ledger Lens: qué quedó en el ledger y **qué nunca recibió la empresa**.

Mientras la integración no exista, todo esto se construye con fixtures
aislados. Regla dura: **un botón no puede mostrar un match falso como si
viniera de Midnight.**

---

## BLOCKER PROTOCOL

Si una capa necesita algo de otra: **no se edita propiedad ajena.** Se reporta.

Formato mínimo:

```text
BLOCKER
Rama:
SHA:
Owner necesario:

Interfaz esperada:
Comportamiento real:
Error exacto:

Reproducción mínima:
1.
2.
3.
```

Sin reproducción mínima no es un blocker, es una sospecha.

**Enrutamiento:**

| El problema es de… | Owner |
|---|---|
| Compact, bindings, comportamiento de la prueba, disclosures | Claude |
| Providers, private state, wallet, indexer, deploy/join | Coqui |
| Componentes, estados visuales, copy | Ponti |
| Dependencias, arquitectura global, scope, `main` | Franco (humano) |

Cambiar `dependencies` o el lockfile **siempre** para y va a Franco, sin
importar de quién sea la superficie.
