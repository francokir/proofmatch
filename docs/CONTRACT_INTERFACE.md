# CONTRACT_INTERFACE — ProofMatch

Interfaz **real** del contrato Compact, tal como está hoy en el repositorio.
Este documento describe únicamente lo que existe y compila. No documenta APIs futuras.

**Etapa actual:** `contract/private-compatibility`
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
circuito ZK, y por lo tanto tampoco proving key ni verifying key. Cuando el
contrato tenía cero circuitos, la compilación no emitía `keys/` ni `zkir/` en
absoluto; ahora emite `keys/proveMatch.{prover,verifier}` — una entrada por
circuito, ninguna por el constructor.

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

`proveMatch` ya cumple esa regla: su paso 1 revalida los cinco términos. Está
cubierto por tests que despliegan, vía fixtures, estados que el constructor
honesto jamás produciría (vacante `CLOSED`, `jobMaximumCompensation = 0`,
`jobRequiredWeeklyHours = 200`) y comprueban que el circuito los rechaza.

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

### `proveMatch(): []`

Único punto de entrada del contrato. Prueba en cero conocimiento que el
candidato es compatible con la vacante, sin revelar sus valores.

```ts
proveMatch(context: CircuitContext<PS>): CircuitResults<PS, []>
```

**No recibe argumentos.** Esa es la defensa estructural contra un caller que
quiera afirmar compatibilidad: no hay ningún parámetro por el que se pueda
pasar un `compatible = true`. Todo lo que decide el resultado se computa dentro
del circuito.

Orden de ejecución:

1. **Revalida los términos públicos** leyendo el ledger: `jobState == OPEN`,
   `jobId != 0`, `jobMaximumCompensation > 0`, `1 <= jobRequiredWeeklyHours <= 168`.
2. Obtiene los dos valores privados llamando a los witnesses.
3. **Valida el rango de los valores privados**: compensación `> 0`, horas entre
   1 y 168.
4. `candidateMinimumCompensation <= jobMaximumCompensation`.
5. `candidateAvailableWeeklyHours >= jobRequiredWeeklyHours`.
6. Solo si todo lo anterior pasó: `matchCount += 1`.

Cualquier `assert` que falle aborta el circuito completo. No hay mutación
pública parcial posible: `matchCount += 1` es la última instrucción y la única
escritura.

El paso 1 no es redundante. Los `assert` del constructor no los verifica la
cadena (ver [Alcance real de estas invariantes](#alcance-real-de-estas-invariantes)),
así que el circuito no puede confiar en que los términos on-chain sean válidos.
`proveMatch` **sí** corre bajo prueba —la compilación emite
`keys/proveMatch.prover` y `keys/proveMatch.verifier`— y es ahí donde las
invariantes obligan de verdad.

| Error | Causa |
|---|---|
| `job is not open` | `jobState != OPEN` |
| `malformed job terms` | algún término público fuera de rango |
| `candidate compensation out of range` | compensación privada `== 0` |
| `candidate weekly hours out of range` | horas privadas `== 0` o `> 168` |
| `compensation not compatible` | el candidato pide más de lo que la vacante paga |
| `weekly hours not compatible` | el candidato ofrece menos horas de las requeridas |

---

## Witnesses / estado privado

El contrato declara dos witnesses. La implementación la aporta la capa
TypeScript desde el private state del usuario; el contrato solo los declara.

```compact
witness candidateMinimumCompensation(): Uint<64>;   // USD mensuales enteros
witness candidateAvailableWeeklyHours(): Uint<8>;   // horas por semana
```

Interfaz TypeScript generada, que es la que la capa de integración debe
implementar:

```ts
export type Witnesses<PS> = {
  candidateMinimumCompensation(context: WitnessContext<Ledger, PS>): [PS, bigint];
  candidateAvailableWeeklyHours(context: WitnessContext<Ledger, PS>): [PS, bigint];
}
```

**Un witness no es código confiable.** Cada DApp puede implementarlo como
quiera, así que el circuito nunca asume que devuelve algo sensato: valida rango
y compatibilidad sobre el valor que reciba.

Los tests usan una implementación mínima en `tests/witnesses.ts`. Esa **no** es
la implementación productiva de private state: esa vive en la capa de
integración y es ownership de Coqui.

---

## Privacidad en esta etapa

| Qué | Visibilidad |
|---|---|
| `jobId` | público |
| `jobMaximumCompensation` | público |
| `jobRequiredWeeklyHours` | público |
| `jobState` | público |
| `matchCount` | público |
| `candidateMinimumCompensation` | **privado** |
| `candidateAvailableWeeklyHours` | **privado** |

### Recorrido de los valores privados

1. La capa TypeScript los lee del private state del usuario y los devuelve desde
   el witness.
2. El circuito los recibe y los compara contra los términos públicos.
3. En el JS generado van a `partialProofData.privateTranscriptOutputs`, **nunca**
   a `publicTranscript`.
4. No se escriben en ningún campo del ledger y no se devuelven: `proveMatch`
   retorna `[]`.

El circuito **no contiene ningún `disclose()`**. Los únicos tres del contrato
están en el constructor, sobre los términos de la vacante, que son públicos por
diseño.

### Lo único que cambia públicamente tras un match válido

`matchCount += 1`. El incremento es la constante `1`, no deriva de witness data.
El argumento de un `Counter` sí es visible on-chain, pero aquí ese argumento es
siempre `1`, así que no revela nada del candidato.

### Qué garantiza el circuito y qué no

**Garantiza** que existe un par de valores privados que satisface las dos
condiciones y los rangos, y que `matchCount` solo sube si es así. Ni el
frontend ni un witness manipulado pueden saltear un `assert`.

**No garantiza** que los valores declarados sean los verdaderos del candidato.
El candidato se auto-declara: puede subdeclarar su compensación mínima o
sobredeclarar su disponibilidad para forzar un match. Atar esos valores a una
fuente confiable requeriría attestation de un tercero, que está fuera del scope
del MVP. Lo que el producto demuestra es que la empresa **no ve los valores**,
no que los valores sean verificados.

### Requisitos que el contrato no puede garantizar solo

Dos cosas quedan del lado de la capa de integración. No son opcionales: sin
ellas, la privacidad que el circuito construye se pierde fuera del circuito.

1. **El proof server tiene que ser local al candidato.** Los asserts abortan
   localmente, así que un intento fallido nunca sale de la máquina. Pero para
   generar la prueba de un intento exitoso, el proof server necesita la
   asignación de testigos: un proof server remoto vería, por candidato y por
   vacante, el par (compensación mínima, disponibilidad) en claro. `package.json`
   ya trae `proof-server:start` vía docker compose, que es la configuración
   correcta — esto lo deja escrito como **invariante de privacidad**, no como
   conveniencia de desarrollo.
2. **La capa TypeScript no debe propagar al empleador el motivo del fallo.** Los
   mensajes distinguen qué eje falló, lo cual es útil para el candidato en su
   propia UI. Si ese motivo se enviara al empleador o a telemetría compartida,
   `compensation not compatible` revelaría la cota
   `candidateMinimumCompensation > jobMaximumCompensation`; repetido contra
   vacantes con distinto máximo público, permitiría acorralar el valor exacto.
   El motivo se computa client-side y se queda client-side.

### Qué es observable de todas formas

Aunque los valores queden privados, un observador de la cadena ve que se llamó
`proveMatch` sobre **esta** vacante, cuándo, y que `matchCount` subió. Es decir:
el hecho de la participación es público, el contenido del match no. Un intento
fallido, en cambio, no llega a la cadena: el circuito aborta localmente antes de
construir la transacción.

Los argumentos del constructor son witness data desde el punto de vista de
Compact; por eso escribirlos en el ledger requiere `disclose()` explícito.
Usarlos dentro de un `assert` no lo requiere, porque el `assert` no escribe
estado público.

Los mensajes de los `assert` no contienen valores: nombran la regla violada, no
el dato que la violó. Además, tanto el constructor como `proveMatch` corren
localmente y lanzan antes de construir transacción alguna, así que un assert
fallido no es observable on-chain — ni siquiera cuál de ellos falló. Distinguir
"salario incompatible" de "horas incompatibles" es información que solo ve el
propio candidato en su UI.

### Riesgos de privacidad ya fijados por esta etapa

Ninguno de estos es un bug: son consecuencias del diseño que conviene tener
escritas antes de construir encima.

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
| Un `witness` se declara en Compact y lo implementa el DApp en TypeScript | [Compact reference — declaring witnesses](https://docs.midnight.network/compact/reference/compact-reference#declaring-witnesses-for-private-state-management) |
| El valor que devuelve un witness es privado salvo que se lo disclose | [Guides — on-chain visibility](https://docs.midnight.network/guides/security-best-practices#on-chain-visibility); confirmado en el JS generado: van a `privateTranscriptOutputs` |
| El argumento de un `Counter` **sí** es visible on-chain | Misma tabla de visibilidad. Acá el argumento es siempre la constante `1` |
| `matchCount += 1` tras asserts sobre witness data no requiere `disclose()` | Compila limpio: el incremento es una constante y el `assert` aborta, no ramifica |
| `--skip-zk` omite la generación de proving keys | Probado: genera `contract/` y `zkir/`, no `keys/` |

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

Los fixtures de `tests/fixtures/` no se compilan con `npm run compile`: la suite
los compila bajo demanda con `--skip-zk`, dentro de `contracts/managed/`, que
está gitignored.

**Limitación conocida de la suite:** todos los tests corren `proveMatch` en el
simulador JS. Las proving keys existen pero ningún test genera ni verifica una
prueba ZK real. Cerrar ese bucle requiere desplegar el contrato contra el devnet
local, lo que toca `src/deploy.ts` — superficie de integración, no de contrato.
Queda pendiente para `integration/proof-flow`: alcanza con un happy path.

## Estado de deploy

**Este contrato no debe desplegarse fuera de un devnet local descartable.** Una
instancia desplegada ahora queda permanentemente en `JobState.OPEN` —no existe
`closeJob`— y sin deduplicación: el mismo candidato puede matchear tantas veces
como quiera hasta que llegue el nullifier. Los contratos de Midnight no son
actualizables.

`npm run deploy` y `npm run cli` siguen apuntando al contrato `hello-world` del
starter; esta etapa no los tocó.

---

## Fuera de scope en esta etapa

No existen y **no deben asumirse**: nullifier, prevención de duplicados,
`candidateSecret`, hashing específico de candidato, domain separator,
commitments, Consent Reveal, `closeJob`, tercer criterio.

Consecuencia concreta que hay que tener presente: **nada impide todavía que el
mismo candidato incremente `matchCount` varias veces sobre la misma vacante.**
Hay un test que fija esa contabilidad actual, para que la etapa del nullifier la
cambie de forma explícita.

### Entradas para `contract/job-nullifier`

Salieron de la security review de esta etapa. Conviene decidirlas **al diseñar**
la próxima, no después:

- **Un nullifier por sí solo no acota nada si el secreto es gratis.** Un
  nullifier limita a un match *por secreto*, y un `Bytes<32>` que el witness
  elige libremente se genera infinitamente. Para que signifique algo,
  `candidateSecret` tiene que estar anclado a algo escaso o atestiguado: una
  credencial emitida por un tercero, pertenencia a un MerkleTree poblado por un
  registrador, un depósito.
- **El nullifier no debe derivarse solo de `jobId`.** `jobId` es elegido por
  quien despliega y puede colisionar a propósito. Incluir la dirección de la
  instancia (`kernel.self()`), que sí es única.
- **Domain separators distintos** para commitment y para nullifier, e incluir el
  identificador de la vacante en ambos. Compartir dominio habilita linkeo entre
  vacantes.
- **Comprometer los valores declarados, no solo probarlos.** Hoy los dos valores
  privados se consumen y se descartan: nada ata al candidato a lo que declaró.
  Si el commitment de la próxima etapa los incluye, el candidato podrá seguir
  mintiendo, pero no podrá mentir *distinto* en cada etapa — y un Consent Reveal
  posterior podría comprobar que lo revelado coincide con lo que se usó para
  probar compatibilidad.
- **Preservar la uniformidad del transcript.** Hoy el transcript público es
  byte-idéntico para todo `proveMatch` exitoso sobre una misma vacante, porque
  el circuito no tiene ramas. Un `if` sobre datos privados en la próxima etapa
  rompería esa propiedad y abriría un canal lateral por la forma del transcript.

Próxima etapa según el plan: `contract/job-nullifier`.
