# MVP_DEFINITION — ProofMatch

Responde una sola pregunta: **¿cuándo podemos decir que el MVP ya está?**

Checklist binario. Un ítem se marca solo si alguien lo vio funcionar de punta a
punta, no si "debería andar".

---

## Core funcional

- [ ] El usuario abre una vacante real, desplegada en la red.
- [ ] Ve los términos reales de la vacante, leídos del ledger.
- [ ] Ingresa su compensación mínima y su disponibilidad semanal.
- [ ] El private state conserva esos valores localmente.
- [ ] `candidateSecret` existe, viene de un CSPRNG y persiste entre sesiones.
- [ ] Conecta Lace.
- [ ] Genera una prueba ZK real, no simulada.
- [ ] **Compatible** → registra el match y `matchCount` sube.
- [ ] **Incompatible** → no registra nada y el estado público no cambia.
- [ ] **Duplicado** → rechazado, sin incrementar el contador.
- [ ] `matchCount` que muestra la UI viene del ledger o del indexer, no de estado local.
- [ ] El recruiter **no recibe** compensación ni disponibilidad exactas.
- [ ] La UI distingue con claridad qué es público y qué es privado.
- [ ] El reset de demo funciona y deja el flujo repetible.

## Calidad

- [ ] `npm run compile` verde.
- [ ] Tests contractuales verdes.
- [ ] Tests o smoke de integración verdes.
- [ ] `npm run build` verde.
- [ ] E2E verde contra el contrato de ProofMatch, no solo contra el hello-world.
- [ ] Auditoría de privacidad: sin valores privados en logs, requests, telemetría ni estado compartido.
- [ ] La demo completa corrió **tres veces seguidas** sin intervención manual.
- [ ] Video de respaldo grabado.

## Submission

- [ ] README con problema, solución, arquitectura, cómo ejecutar y limitaciones.
- [ ] Explicación de privacidad: qué es público, qué es privado, qué prueba el circuito.
- [ ] Limitaciones declaradas honestamente (ver más abajo).
- [ ] Deck.
- [ ] Video.
- [ ] Links públicos probados en incógnito.

---

## Limitaciones que hay que declarar, no esconder

Son reales y están documentadas. Declararlas suma credibilidad; que las
encuentre un juez, resta.

- **El candidato se auto-declara sus valores.** El circuito prueba la
  implicación, no las premisas: alguien puede declarar valores falsos que sí
  sean compatibles. Cerrarlo requiere attestation de un tercero.
- **El nullifier acota secretos, no personas.** Un secreto nuevo es un candidato
  nuevo a ojos del contrato.
- **La participación es pública.** El contenido del match es privado, pero un
  observador ve que alguien se postuló a esa vacante, y cuándo.
- **El nullifier queda vinculado al pagador de fees** de la transacción.
- **Las invariantes del constructor no las verifica la cadena** — por eso el
  circuito las revalida.

---

## NON-GOALS del MVP

Nada de esto es necesario para decir que el MVP está. Si aparece la tentación de
agregarlo antes de Core Frozen: **no**.

- Múltiples vacantes por contrato.
- Búsqueda, listados o catálogo de vacantes.
- Cuentas, perfiles, login o registro.
- Attestation de terceros o verificación de los valores del candidato.
- Mensajería entre candidato y empresa.
- `closeJob` u otro ciclo de vida de la vacante.
- Un tercer criterio de compatibilidad.
- Consent Reveal.
- Match Pass con QR.
- Backend propio, base de datos, o cualquier servidor fuera del devnet.
- Multi-moneda o períodos de compensación distintos del mensual.
- Deploy a Preview, Preprod o mainnet.
- CI, cobertura, o refactors de arquitectura.

Los que sí valen la pena **después** están priorizados en `docs/POST_MVP.md`.
