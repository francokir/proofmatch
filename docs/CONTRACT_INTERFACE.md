# CONTRACT_INTERFACE — ProofMatch

Interfaz **real** del contrato Compact, tal como está hoy en el repositorio.
Este documento describe únicamente lo que existe y compila. No documenta APIs futuras.

**Estado:** core completo desde `green-04-nullifier`. Sin features nuevas.
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
| `candidateMinimumCompensation` | **USD mensuales, enteros** | mismo tipo |
| `jobRequiredWeeklyHours` | **horas por semana** | `Uint<8>` |
| `candidateAvailableWeeklyHours` | **horas por semana** | mismo tipo |

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

`CLOSED` está declarado pero **ningún circuito transiciona hacia él**:
`closeJob` es scope de una etapa posterior y opcional. `proveMatch` sí verifica
que la vacante esté `OPEN`, así que la guarda ya está lista para cuando exista.

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
| `usedNullifiers` | `Set<Bytes<32>>` | `Set` con `member`/`size`/iterador | no | Nullifiers ya consumidos. Inicial: vacío |

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
usedNullifiers         = {}  (valor por defecto de Set)
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
2. Obtiene los tres valores privados llamando a los witnesses.
3. **Valida el rango de los valores privados**: compensación `> 0`, horas entre
   1 y 168, secreto distinto de cero.
4. `candidateMinimumCompensation <= jobMaximumCompensation`.
5. `candidateAvailableWeeklyHours >= jobRequiredWeeklyHours`.
6. Deriva el nullifier de esta vacante.
7. **Uso único**: el nullifier no debe estar ya en `usedNullifiers`.
8. Registra el nullifier.
9. `matchCount += 1`.

Cualquier `assert` que falle aborta el circuito completo. Las dos únicas
escrituras son los pasos 8 y 9, y ambas van al final: verificado sobre el
transcript público, donde las 8 operaciones de escritura son las últimas, después
de todas las lecturas.

**Los pasos 6-8 van deliberadamente después de 4 y 5.** Un candidato
incompatible ni siquiera llega a derivar su nullifier, así que no lo consume:
puede corregir sus valores y volver a intentar. Si el orden se invirtiera, un
intento fallido quemaría el nullifier del candidato y lo dejaría afuera para
siempre — hay un fixture, `proofmatch-job-mutates-first`, que reproduce
exactamente ese bug y un test que verifica que la suite lo detecta.

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
| `candidate secret not initialized` | el secreto privado es 32 bytes en cero |
| `compensation not compatible` | el candidato pide más de lo que la vacante paga |
| `weekly hours not compatible` | el candidato ofrece menos horas de las requeridas |
| `candidate already matched this job` | el nullifier del candidato ya está registrado |

---

## Nullifier de uso único

### Derivación

```compact
circuit jobNullifier(sk: Bytes<32>): Bytes<32> {
  return persistentHash<Vector<3, Bytes<32>>>([
    pad(32, "proofmatch:job-nullifier:v1"),
    kernel.self().bytes,
    sk
  ]);
}
```

Tres entradas, cada una con un propósito:

| Entrada | Por qué |
|---|---|
| `pad(32, "proofmatch:job-nullifier:v1")` | **Domain separator.** Impide colisión con cualquier otro uso del mismo secreto. Cualquier derivación futura del mismo secreto —un commitment, o un handle de Consent Reveal— debe usar su propio dominio (`proofmatch:job-consent:v1`, etc.) y **no reusar el nullifier**: reusarlo lo convertiría de valor de un solo uso en pseudónimo estable dentro de la vacante. |
| `kernel.self().bytes` | **Contexto de vacante.** La dirección de esta instancia. |
| `sk` | El secreto del candidato: lo que hace el nullifier impredecible para terceros. |

### Por qué `kernel.self()` y no `jobId`

Esta es la decisión de diseño central de la etapa. `jobId` **no sirve** como
contexto: lo elige quien despliega y puede repetirse a propósito. Si el
nullifier fuera `hash(dominio, jobId, sk)`, un atacante podría desplegar una
vacante señuelo con el mismo `jobId` que una legítima y obtener, para el mismo
candidato, **el mismo nullifier**. Eso habilita dos ataques:

- **Linkabilidad** — observar el nullifier en la vacante señuelo y reconocer al
  mismo candidato en la legítima.
- **Griefing** — adelantarse a insertar ese nullifier en la vacante legítima y
  bloquear al candidato antes de que se postule.

`kernel.self()` devuelve la dirección del contrato, que es
`Sha256(estado inicial, nonce)`. No se puede elegir para colisionar con otra
instancia sin romper SHA-256.

### Propiedades verificadas

Ejecutadas contra el contrato compilado, no deducidas:

| Propiedad | Resultado |
|---|---|
| Mismo secreto + misma vacante → mismo nullifier | ✅ determinista |
| Mismo secreto + otra vacante → nullifier distinto | ✅ |
| Otro secreto + misma vacante → nullifier distinto | ✅ |
| El nullifier **no** depende de compensación ni horas | ✅ el mismo secreto con valores distintos da el mismo nullifier |
| Un duplicado no puede registrarse | ✅ rechazado por el `Set` dentro del circuito |
| Un fallo de compatibilidad no consume el nullifier | ✅ el candidato puede reintentar |
| La forma del transcript público es idéntica entre candidatos | ✅ 37 ops, misma secuencia — no hay canal lateral por la forma |

### Qué es público y por qué

El nullifier **es público**, y tiene que serlo: la red necesita verlo para
rechazar el duplicado. Los dos `disclose(_nullifier)` del circuito son
deliberados y necesarios.

Publicar el nullifier no compromete al candidato: es un hash one-way de su
secreto, y va ligado a esta instancia, así que **no permite reconocerlo en otra
vacante**. Lo que sí revela, como cualquier match, es que *alguien* se postuló.

### Lo que el nullifier no protege

Tres límites, ninguno resoluble dentro del circuito:

- **Acota un match por secreto, no por persona.** Un secreto nuevo es un
  candidato nuevo a ojos del contrato, y los secretos se generan gratis. Hay un
  test que lo deja explícito. Acotarlo de verdad requiere anclar el secreto a
  algo escaso o atestiguado.
- **Un DApp hostil puede quemar el nullifier del candidato.** Los tres witnesses
  corren en el cliente: un front-end malicioso que tenga el secreto puede llamar
  `proveMatch` con valores compatibles arbitrarios y consumir el nullifier en una
  vacante que el candidato nunca eligió. Es un DoS dirigido sobre una
  postulación, inherente a que el secreto viva en el cliente. Supuesto de
  confianza sobre el DApp, igual que el declarado para el constructor.
- **El nullifier queda vinculado al pagador de la transacción.** El circuito
  protege el secreto, no la metadata: `usedNullifiers` es público y la
  transacción que inserta el nullifier tiene un pagador de fees, así que un
  observador enlaza *esa wallet* con *esta vacante*. El candidato es anónimo
  respecto de su secreto, no respecto de su wallet. Mitigarlo requiere un
  submitter distinto del candidato — decisión de la capa de integración.

Lo que el nullifier **sí** resuelve, y es lo que el producto demuestra: un
candidato no puede registrar dos matches en la misma vacante con el mismo
secreto, ni reenviando la misma prueba, ni desde otro cliente. Y su nullifier en
una vacante no lo delata en otra.

---

## Witnesses / estado privado

El contrato declara dos witnesses. La implementación la aporta la capa
TypeScript desde el private state del usuario; el contrato solo los declara.

```compact
witness candidateMinimumCompensation(): Uint<64>;   // USD mensuales enteros
witness candidateAvailableWeeklyHours(): Uint<8>;   // horas por semana
witness candidateSecret(): Bytes<32>;               // secreto estable del candidato
```

Interfaz TypeScript generada, que es la que la capa de integración debe
implementar:

```ts
export type Witnesses<PS> = {
  candidateMinimumCompensation(context: WitnessContext<Ledger, PS>): [PS, bigint];
  candidateAvailableWeeklyHours(context: WitnessContext<Ledger, PS>): [PS, bigint];
  candidateSecret(context: WitnessContext<Ledger, PS>): [PS, Uint8Array];
}
```

### Requisitos de `candidateSecret` — para la capa de integración

Esto es lo que el private state productivo tiene que garantizar. El contrato no
puede verificarlo:

- **32 bytes exactos.** El runtime rechaza cualquier otra longitud.
- **No puede ser 32 bytes en cero.** El circuito lo rechaza explícitamente: un
  secreto en cero significa private state sin inicializar, y todos los
  candidatos en ese estado compartirían nullifier.
- **DEBE venir de un CSPRNG** (`crypto.getRandomValues`), generado una única vez
  y persistido. **NUNCA derivado de un identificador del usuario** — ni email,
  ni DNI, ni PIN, ni un contador.

  Esto no es una recomendación de estilo, es la condición de la que depende toda
  la privacidad del esquema, y **el contrato no puede verificarla**. El nullifier
  es `hash(dominio, direcciónDelContrato, secreto)`, y los dos primeros
  componentes son públicos. Si el secreto sale de un espacio enumerable,
  cualquiera puede recomputar el nullifier candidato por candidato y leer
  `usedNullifiers` —que es público— para saber **quién se postuló a cada
  vacante**. El circuito seguiría siendo correcto y la privacidad estaría rota.

  `tests/witnesses.ts` tiene un `testSecret(seed)` determinista: está marcado
  como test-only y es precisamente el antipatrón a no copiar.
- **Estable para una vacante dada, a lo largo del tiempo.** Este es el único
  requisito de estabilidad que el contrato impone, y conviene leerlo con
  precisión: si el candidato regenera su secreto y vuelve a postularse **a la
  misma vacante**, el nullifier cambia y el contrato lo considera otra persona.
  Lo que rompe la deduplicación es la **rotación**, no el alcance del secreto.

  **No hace falta un secreto global compartido entre vacantes.** El contexto de
  vacante ya lo aporta `kernel.self()` dentro del circuito, así que un secreto
  distinto por contrato produce exactamente las mismas garantías: nullifier
  determinista dentro de la vacante, y no linkeable fuera de ella.

  Esto importa porque el `levelPrivateStateProvider` **namespacea el private
  state por dirección de contrato** — la clave es `${contractAddress}:${privateStateId}`
  y `setContractAddress()` es obligatorio antes de cualquier `get`/`set`. Un
  secreto por contrato es el patrón que el provider soporta de forma nativa, y
  es el que usa el tutorial oficial de bboard: `setContractAddress(addr)` →
  `get()` → si no hay nada, generar 32 bytes aleatorios y persistir.

  Un secreto global es igualmente válido pero requiere almacenarlo fuera del
  provider y copiarlo al private state de cada contrato, lo que multiplica las
  copias del mismo secreto sin ganar nada. Preferir per-contrato salvo que
  aparezca una razón concreta (por ejemplo, anclar el secreto a una credencial
  externa, que hoy está fuera de scope).
- **Nunca sale de la máquina del candidato.** No se loguea, no se envía a la
  empresa, no va a telemetría. Lo único que se publica es el hash derivado.

**Consecuencia operativa a tener presente:** el provider también scopea por
`accountId` (hasheado con SHA-256). Si el candidato cambia de wallet, no
encuentra su secreto y el contrato lo ve como otra persona. Y el propio provider
advierte que **no tiene mecanismo de recuperación**: borrar el storage destruye
el secreto. Ambas cosas caen en el límite ya conocido —el nullifier acota
secretos, no personas— y no rompen ninguna garantía del contrato, pero definen
qué debe comunicar la UI.

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
| `candidateSecret` | **privado** — solo se publica su hash derivado |
| nullifier derivado | público, y necesariamente |

### Recorrido de los valores privados

1. La capa TypeScript los lee del private state del usuario y los devuelve desde
   el witness.
2. El circuito los recibe y los compara contra los términos públicos.
3. En el JS generado van a `partialProofData.privateTranscriptOutputs`, **nunca**
   a `publicTranscript`. Comprobado también por test: el secreto no aparece en
   el transcript serializado, ni en hex ni como array de bytes.
4. No se escriben en ningún campo del ledger y no se devuelven: `proveMatch`
   retorna `[]`.

El circuito contiene exactamente **dos `disclose()`**, ambos sobre el mismo
valor: el nullifier, que debe ser público para impedir el duplicado. Ni la
compensación, ni las horas, ni el secreto se disclosan nunca. Los otros tres
`disclose()` del contrato están en el constructor, sobre los términos de la
vacante, que son públicos por diseño.

### Lo único que cambia públicamente tras un match válido

Dos cosas: el nullifier entra en `usedNullifiers`, y `matchCount += 1`. El
incremento es la constante `1`, así que no revela nada del candidato. El
nullifier sí es un valor derivado de su secreto, pero es un hash one-way ligado
a esta instancia — ver [Nullifier de uso único](#nullifier-de-uso-único).

### Qué garantiza el circuito y qué no

**Garantiza** que existe un par de valores privados que satisface las dos
condiciones y los rangos, que `matchCount` solo sube si es así, y que el mismo
secreto no puede registrar dos matches en la misma vacante. Ni el frontend ni un
witness manipulado pueden saltear un `assert`: no hay ningún parámetro por el
que el caller pueda afirmar compatibilidad ni "nullifier sin usar".

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
  construido que esté el nullifier. Lo que el producto protege es el *contenido*
  del match, no el hecho de participar.
  **Decidido:** se acepta y se declara. `matchCount` es requisito de producto
  —el recruiter tiene que ver cuántos matches hay— y sacarlo del estado público
  no resolvería el canal lateral, porque la transacción es observable igual. Va
  documentado como limitación en `docs/MVP_DEFINITION.md`.
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
| `kernel.self()` devuelve la dirección del contrato dentro de un circuito | [Ledger data types — Kernel](https://docs.midnight.network/compact/reference/ledger-adt); compila al patrón `kernel_self` del onchain-runtime |
| El patrón de nullifier es `persistentHash` con domain separator + `Set<Bytes<32>>` | [Smart contract security — double-spend prevention](https://docs.midnight.network/compact/smart-contract-security#double-spend-prevention-with-nullifiers) y [Preventing replay attacks](https://docs.midnight.network/guides/security-best-practices#preventing-replay-attacks) |
| El nullifier debe disclosarse para insertarlo en el `Set` | Es el patrón oficial: `spent.insert(disclose(nul))` |
| La dirección del contrato es `Sha256(initial_state, nonce)` | `ledger/src/structure.rs:2536-2542`, verificado en la etapa anterior |

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
instancia desplegada ahora queda permanentemente en `JobState.OPEN`: no existe
`closeJob`, y los contratos de Midnight no son actualizables.

`npm run deploy` y `npm run cli` siguen apuntando al contrato `hello-world` del
starter; esta etapa no los tocó.

---

## Fuera de scope en esta etapa

No existen y **no deben asumirse**: commitments, Consent Reveal, `closeJob`,
tercer criterio (onsite days), autorización del empleador, presupuesto privado
del empleador.

### Entradas para las etapas siguientes

Vienen de las security reviews de esta etapa y de la anterior. Conviene
decidirlas **al diseñar**, no después:

- **Anclar `candidateSecret` para que el nullifier acote personas y no
  secretos.** Hoy un secreto nuevo es un candidato nuevo. Acotarlo de verdad
  requiere ligarlo a algo escaso o atestiguado: una credencial emitida por un
  tercero, pertenencia a un MerkleTree poblado por un registrador, un depósito.
  Es la única palanca que convierte el uso único en algo con sentido
  adversarial.
- **Domain separator distinto para el commitment.** El nullifier ya usa
  `"proofmatch:job-nullifier:v1"`. Un commitment futuro debe usar un dominio
  propio: compartirlo haría que ambos hashes coincidan para el mismo secreto y
  permitiría enlazarlos.
- **Comprometer los valores declarados, no solo probarlos.** Hoy la compensación
  y las horas se consumen y se descartan: nada ata al candidato a lo que
  declaró. Si el commitment los incluye, el candidato podrá seguir mintiendo,
  pero no podrá mentir *distinto* en cada etapa — y un Consent Reveal posterior
  podría comprobar que lo revelado coincide con lo que se usó para probar
  compatibilidad.
- **Preservar la uniformidad del transcript.** Hoy la forma del transcript
  público es idéntica para todo `proveMatch` exitoso: 37 operaciones en la misma
  secuencia, porque el circuito no tiene ramas. Un `if` sobre datos privados
  rompería esa propiedad y abriría un canal lateral por la forma del transcript.
- **Mantener las escrituras al final.** Las dos mutaciones van después de todos
  los `assert`. El fixture `proofmatch-job-mutates-first` y su test existen para
  que invertir ese orden rompa la suite en vez de pasar en silencio.

Próxima etapa según el plan: integración TypeScript (`integration/proof-flow`),
que es ownership de Coqui. La línea contractual core queda cerrada salvo bugs.
