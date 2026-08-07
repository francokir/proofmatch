# CONTRACT_INTERFACE — ProofMatch

Interfaz **real** del contrato Compact, tal como está hoy en el repositorio.
Este documento describe únicamente lo que existe y compila. No documenta APIs futuras.

**Etapa actual:** `contract/skeleton`
**Fuente:** `contracts/proofmatch-job.compact`
**Artefactos generados:** `contracts/managed/proofmatch-job/` (gitignored, se regeneran con `npm run compile`)
**Compilador verificado:** Compact `0.31.1` · CLI `compact` `0.5.1` · `@midnight-ntwrk/compact-runtime` `0.16.0`

---

## Arquitectura

**Una instancia de contrato = una vacante.** No hay abstracción para múltiples
vacantes dentro de un mismo contrato, y no se planea agregarla.

---

## Convención de unidades del MVP

**Vinculante para contrato, integración y UI.** Compact no lleva unidades en los
tipos: `Uint<64>` es un número pelado. Si las tres capas no interpretan lo mismo,
la comparación de compatibilidad da un resultado seguro y equivocado — y como el
lado del candidato es privado, el error sería indetectable después. Por eso la
convención se fija acá y no se negocia por capa.

| Valor | Unidad | Tipo |
|---|---|---|
| `jobMaximumCompensation` | **USD mensuales, enteros** | `Uint<64>` |
| `candidateMinimumCompensation` *(próxima etapa)* | **USD mensuales, enteros** | mismo tipo |
| `jobRequiredWeeklyHours` | **horas por semana** | `Uint<8>` |
| `candidateAvailableWeeklyHours` *(próxima etapa)* | **horas por semana** | mismo tipo |

Sin centavos, sin decimales, sin conversión de moneda, sin períodos anuales. Un
salario de USD 3.500 por mes se representa como `3500n`.

Las dos comparaciones del núcleo quedan entonces entre magnitudes homogéneas:

```text
candidateMinimumCompensation <= jobMaximumCompensation   // USD/mes vs USD/mes
candidateAvailableWeeklyHours >= jobRequiredWeeklyHours   // h/sem vs h/sem
```

Esta convención **no agrega ningún campo al contrato**: es documentación, que es
suficiente para el MVP. Si en el futuro hiciera falta soportar varias monedas o
períodos, eso sí requeriría un enum sellado en los términos, y sería un cambio
de alcance a decidir por Franco.

## Tipos

```compact
export enum JobState {
  OPEN,    // = 0
  CLOSED   // = 1
}
```

En esta etapa `CLOSED` está declarado pero **ningún circuito puede transicionar
hacia él**: no existen circuitos todavía. `closeJob` es scope de una etapa
posterior y opcional.

---

## Estado público (ledger)

Todo el estado del ledger es **público y legible por cualquiera**. Eso es
deliberado: el candidato tiene que poder leer los términos de la vacante antes
de decidir si prueba compatibilidad.

| Campo | Tipo Compact | Tipo TypeScript | `sealed` | Descripción |
|---|---|---|---|---|
| `jobId` | `Bytes<32>` | `Uint8Array` | sí | Identificador de la vacante |
| `jobMaximumCompensation` | `Uint<64>` | `bigint` | sí | Compensación máxima que la empresa paga, en **USD mensuales enteros** |
| `jobRequiredWeeklyHours` | `Uint<8>` | `bigint` | sí | Mínimo de **horas por semana** requeridas |
| `jobState` | `JobState` | `JobState` | no | Estado de la vacante. Inicial: `OPEN` |
| `matchCount` | `Counter` | `bigint` | no | Matches registrados. Inicial: `0` |

`sealed` significa que el campo **solo puede escribirse durante la ejecución del
constructor**. El compilador rechaza en tiempo de compilación cualquier circuito
exportado que intente modificarlo — verificado mecánicamente, ver
[Decisiones verificadas](#decisiones-verificadas).

`matchCount` no se inicializa explícitamente: `Counter` arranca en su valor por
defecto, `0`. Está cubierto por test.

---

## Constructor

```compact
constructor(
  id: Bytes<32>,
  maximumCompensation: Uint<64>,
  requiredWeeklyHours: Uint<8>
)
```

Binding TypeScript generado:

```ts
initialState(
  context: ConstructorContext<PS>,
  id_0: Uint8Array,           // exactamente 32 bytes
  maximumCompensation_0: bigint,
  requiredWeeklyHours_0: bigint,
): ConstructorResult<PS>
```

### Invariantes (dentro del contrato, no en el frontend)

| Invariante | Mensaje de error |
|---|---|
| `id != default<Bytes<32>>` | `ProofMatch: jobId must not be the zero identifier` |
| `maximumCompensation > 0` | `ProofMatch: jobMaximumCompensation must be greater than zero` |
| `requiredWeeklyHours > 0` | `ProofMatch: jobRequiredWeeklyHours must be greater than zero` |
| `requiredWeeklyHours <= 168` | `ProofMatch: jobRequiredWeeklyHours must not exceed 168` |

Los rangos de tipo (`Uint<64>`, `Uint<8>`, `Bytes<32>`) los impone además el
runtime generado, antes de ejecutar el constructor.

**168** es el número de horas de una semana calendario: un requisito mayor sería
insatisfacible por construcción. Compact no admite constantes a nivel de
programa, así que el límite aparece como literal en el `assert`.

### Alcance real de estas invariantes

Los cuatro `assert` están en Compact, dentro del contrato, no en el frontend.
Pero **no los verifica la cadena**: un `constructor` de Compact no genera
circuito ZK, y por lo tanto tampoco proving key ni verifying key. Evidencia
local: `contract-info.json` reporta `"circuits": []` y la compilación no emite
`keys/` ni `zkir/` para este contrato, a diferencia de `hello-world`, que sí los
emite para su circuito.

El lado cadena está verificado contra el código fuente del ledger (rama
`ledger-8` de `midnightntwrk/midnight-ledger`):

- `ContractDeploy` tiene exactamente dos campos, `initial_state` y `nonce`, y a
  diferencia de `ContractCall<P, D>` **no está parametrizado por el tipo de
  prueba**: estructuralmente un deploy no puede llevar una prueba ZK
  (`ledger/src/structure.rs:2519-2526` y `:2750-2758`).
- Su única validación comprueba balance cero, consistencia del *charged state* y
  que cada circuito exportado tenga verifier key. No re-ejecuta el constructor
  ni verifica prueba alguna (`ledger/src/verify.rs:1707-1728`, `:351-364`).
- Al aplicar el deploy, el `initial_state` provisto por el cliente se inserta
  tal cual en el estado del ledger (`ledger/src/semantics.rs:1454-1471`).

Consecuencia práctica: las invariantes obligan al cliente honesto que despliega.
Un deployer que arme el `ContractDeploy` a mano puede publicar una instancia con
`jobRequiredWeeklyHours = 200` o `jobMaximumCompensation = 0`, y el nodo la
acepta.

**Regla para las etapas siguientes:** todo circuito que *lea* estos términos
debe volver a validarlos antes de confiar en ellos. Las lecturas de ledger son
públicas, así que ese re-chequeo no necesita `disclose()`.

### Efecto

```
jobId                  = id
jobMaximumCompensation = maximumCompensation
jobRequiredWeeklyHours = requiredWeeklyHours
jobState               = JobState.OPEN
matchCount             = 0   (valor por defecto de Counter)
```

---

## Circuitos

**Ninguno.** El contrato no expone puntos de entrada en esta etapa. `Circuits`,
`ImpureCircuits`, `PureCircuits` y `Witnesses` están todos vacíos en los
bindings generados.

Consecuencia práctica: la compilación no produce `keys/` ni `zkir/` para este
contrato, porque no hay circuitos que probar.

---

## Witnesses / estado privado

**No existen todavía.** El contrato no declara ningún `witness` y no consume
private state. Los inputs privados del candidato
(`candidateMinimumCompensation`, `candidateAvailableWeeklyHours`,
`candidateSecret`) llegan en `contract/private-compatibility`.

---

## Privacidad en esta etapa

| Qué | Visibilidad |
|---|---|
| `jobId` | público |
| `jobMaximumCompensation` | público |
| `jobRequiredWeeklyHours` | público |
| `jobState` | público |
| `matchCount` | público |
| Datos del candidato | **no existen en el contrato todavía** |

Los tres `disclose()` del constructor publican exactamente los términos de la
vacante, que son públicos por diseño. No hay ninguna otra disclosure.

Los argumentos del constructor son witness data desde el punto de vista de
Compact; por eso escribirlos en el ledger requiere `disclose()` explícito.
Usarlos dentro de un `assert` no lo requiere, porque el `assert` no escribe
estado público.

Los mensajes de los `assert` no contienen valores: nombran la regla violada, no
el dato que la violó. Además, como el constructor corre localmente y lanza antes
de construir transacción alguna, un assert fallido no es observable on-chain.

### Riesgos de privacidad ya fijados por esta etapa

Ninguno de estos es un bug del skeleton: son consecuencias del diseño que
conviene tener escritas antes de construir encima.

- **`matchCount` público es un canal lateral.** Con una vacante por contrato,
  cada incremento será un evento fechado y atribuible a *esta* vacante. Una
  vacante con un solo postulante revela que esa persona se postuló, por bien
  construidos que estén el nullifier y los commitments. Lo que las etapas
  siguientes protegen es el *contenido* del match, no el hecho de participar.
  Decisión pendiente de Franco: aceptarlo y documentarlo, o sacar el contador
  del estado público.
- **El deploy vincula públicamente empresa y vacante**, porque lo firma la
  wallet de la empresa. Es aceptable para un aviso de trabajo, pero implica que
  el único activo de privacidad real es el lado del candidato.
- **`jobId` es una etiqueta, no una identidad.** Es un valor de 32 bytes elegido
  por quien despliega, validado solo como distinto de cero. Nada lo liga a la
  instancia ni a la empresa, y dos deploys pueden usar el mismo. **No debe
  usarse como única fuente de dominio para el nullifier**: si el nullifier se
  derivara solo de `jobId` + secreto del candidato, alguien podría desplegar una
  vacante señuelo con un `jobId` colisionante y (a) reconocer al mismo candidato
  en la vacante legítima, o (b) adelantarse a insertar su nullifier y bloquearlo.
  La identidad única de la instancia es su dirección de contrato.

---

## Decisiones verificadas

| Decisión | Evidencia |
|---|---|
| `export sealed ledger` fija los términos en el constructor | [Compact reference — sealed and unsealed ledger fields](https://docs.midnight.network/compact/reference/compact-reference#sealed-and-unsealed-ledger-fields) |
| Un circuito exportado no puede escribir un campo `sealed` | Probado con el compilador: `exported circuits cannot modify sealed ledger fields` |
| `Counter` arranca en 0 sin inicialización explícita | [Ledger data types — Counter](https://docs.midnight.network/compact/reference/ledger-adt#counter) + test `arranca con matchCount en 0` |
| El constructor admite parámetros tipados y `assert` | [Compact reference — contract constructor](https://docs.midnight.network/compact/reference/compact-reference#contract-constructor) |
| Escribir un parámetro del constructor en el ledger exige `disclose()` | [Unshielded token tutorial — initialize at deployment](https://docs.midnight.network/tokens/unshielded-token#build-an-unshielded-token) |
| Compact no tiene constantes a nivel de programa | Probado con el compilador: `parse error: found keyword "const" looking for a program element` |
| Asignar `JobState.OPEN` no requiere `disclose()` | Probado: el literal no deriva de witness data. Un `jobState = closed ? … : …` sobre un parámetro del constructor **sí** falla a compilar |
| Un contrato sin circuitos es válido y no emite `keys/` ni `zkir/` | Probado contra un control con un circuito, que sí los emite |

### Decisiones tomadas y descartadas

**Se descartó `Uint<0..168>` para `jobRequiredWeeklyHours`.** Mover el límite al
tipo del cell parecía defensa en profundidad, pero la notación de rango es
**exclusiva en el extremo superior**: se compiló y ejecutó un contrato con
`Uint<0..168>` y el binding acepta 167 y rechaza 168 con
`expected value of type Uint<0..168> but received 168n`. Adoptarlo habría
introducido un off-by-one silencioso en un término público de la vacante. Queda
`Uint<8>` con `assert(requiredWeeklyHours <= 168)`, que es inequívoco y está
testeado en ambos bordes (168 acepta, 169 rechaza).

**No se pinea el `pragma` a un rango cerrado.** `pragma language_version >= 0.23;`
es lo que usa el contrato del starter; divergir sin necesidad contradice el
criterio de desempate de `AGENTS.md` (seguir el starter). Si el equipo decide
pinear versiones, es una decisión de repo, no del contrato.

**Las unidades se fijan por convención documentada, no por un campo del
contrato.** Ver [Convención de unidades del MVP](#convención-de-unidades-del-mvp).
Se evaluó agregar un enum sellado de unidad/período a los términos y se
descartó: no hay razón técnica que lo exija en el MVP, y sumaría un campo
público más a un contrato que debe quedar mínimo.

---

## Comandos

```bash
npm run compile                  # compila hello-world y proofmatch-job
npm run compile:proofmatch-job   # solo el contrato de ProofMatch
npm run test:contract            # tests contractuales (requiere compile previo)
npm test                         # alias de test:contract
```

Los tests usan el runner de Node (`node --test`) vía `tsx`, que ya estaba en
`devDependencies`. No se agregó ninguna dependencia.

## Estado de deploy

**Este contrato no debe desplegarse fuera de un devnet local descartable.** No
tiene circuitos: una instancia desplegada ahora queda permanentemente en
`JobState.OPEN`, sin forma de matchear ni de cerrarse, y con los términos
sellados para siempre. Los contratos de Midnight no son actualizables.

`npm run deploy` y `npm run cli` siguen apuntando al contrato `hello-world` del
starter; esta etapa no los tocó.

---

## Fuera de scope en esta etapa

No existen y **no deben asumirse**: `proveMatch`, comparación privada,
assertions de compatibilidad, nullifier, prevención de duplicados,
`candidateSecret`, domain separator, commitments, Consent Reveal, `closeJob`,
tercer criterio.

Próxima etapa según el plan: `contract/private-compatibility`.
