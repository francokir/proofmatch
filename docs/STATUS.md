# STATUS — ProofMatch

La foto de **ahora**. Si contradice a Git, gana Git: corregí este archivo.

**Main:** `a4e115b44bc5125e7d3c132cbb9a4bccc57101d1`
**Último tag verde:** `green-04-nullifier` → `e5c420f`
**Actualizado:** 2026-08-07

---

## CONTRATO — CORE COMPLETE

`contracts/proofmatch-job.compact`. Una instancia = una vacante.

Existe y está mergeado en `main`:

- `ProofMatchJob` con términos públicos **sellados** (`jobId`,
  `jobMaximumCompensation`, `jobRequiredWeeklyHours`);
- `proveMatch()` — único circuito, sin argumentos;
- compatibilidad privada: `candidateMinimumCompensation` y
  `candidateAvailableWeeklyHours` como witnesses;
- `candidateSecret` como witness;
- nullifier por candidato **y** vacante, derivado con `kernel.self()`;
- prevención de duplicados vía `usedNullifiers: Set<Bytes<32>>`;
- `matchCount: Counter`;
- un fallo de compatibilidad **no** consume el nullifier.

Interfaz completa: `docs/CONTRACT_INTERFACE.md`.

### Validaciones al momento del gate

| Comando | Resultado |
|---|---|
| `npm run compile` | PASS |
| `npm run test:contract` | 82/82 |
| `npm test` | 82/82 |
| `npm run build` | PASS |
| `npm run test:e2e` | PASS sobre el baseline del starter disponible al momento del gate |

`npm run test:e2e` valida el contrato `hello-world` del starter, no `proveMatch`.
El E2E real de ProofMatch llega con la integración.

---

## Estado de las tres líneas

| Línea | Estado |
|---|---|
| **Franco + Claude** — contrato | **Core completo.** Modo soporte y hardening. Sin features nuevas. |
| **Coqui** — integración | **ACTIVO.** Rama `integration/provider-foundation`, 1 commit **no mergeado**. |
| **Ponti** — UI | **ACTIVO.** Rama `ui/product-shell` creada, todavía sin commits propios. |

Nada de las líneas de Coqui o Ponti está integrado en `main` todavía. No asumir
que una función existe hasta que esté mergeada.

---

## NEXT CRITICAL GATE

**Integración TypeScript real contra ProofMatch.**

Resultado buscado: una llamada real a `proveMatch` desde la capa de aplicación,
con private state real, proof flow completo y lectura del estado público.

Concretamente, que se pueda demostrar:

1. un candidato compatible registra el match;
2. uno incompatible es rechazado y no cambia nada;
3. un duplicado es rechazado;
4. `matchCount` se lee del ledger vía indexer.

Gate: `green-05-integration`. Owner: Coqui. Ver `docs/ROADMAP.md`.

---

## Riesgos abiertos

- **Ningún test genera todavía una prueba ZK real.** La suite contractual corre
  en el simulador; las proving keys existen y no se ejercitan. Se cierra con la
  integración.
- **No hay CI.** La única validación es local y manual.
- **No hay README.md** en la raíz del repo. Es requisito de entrega (Ponti).
- El nullifier acota **secretos, no personas**: un secreto nuevo es un candidato
  nuevo. Límite conocido y aceptado para el MVP.
