# ROADMAP — ProofMatch

Qué falta y en qué orden. Para el estado exacto de hoy, ver `docs/STATUS.md`.

---

## Completado

| Gate | Qué dejó |
|---|---|
| `green-01-starter` ✅ | Baseline `create-mn-app@0.5.0` verde |
| `green-02-contract` ✅ | Skeleton: términos sellados, `matchCount`, invariantes |
| `green-03-compatibility` ✅ | `proveMatch()`, salary/hours privados |
| `green-04-nullifier` ✅ | `candidateSecret`, nullifier por candidato/vacante, duplicados |

**Contrato: core completo.** Sin features nuevas hasta Core Frozen.

---

## ▶ ESTAMOS ACÁ — A. Integración TypeScript real

**Owner:** Coqui · **Rama:** `integration/proof-flow` · **Gate:** `green-05-integration`

Lo primero que desbloquea todo lo demás.

- private state real, con `candidateSecret` de CSPRNG y persistencia;
- witnesses productivos que implementen la interfaz `Witnesses<PS>` generada;
- providers, conexión Lace, deploy/join;
- llamada real a `proveMatch`;
- los tres caminos: compatible, incompatible, duplicado;
- lectura del estado público desde el indexer.

**Termina cuando** una llamada real genera una prueba compatible, rechaza una
incompatible, rechaza un duplicado, y `matchCount` se lee del ledger.

Depende de: contrato ✅ (listo). Ver `docs/HANDOFFS.md` y `docs/CONTRACT_INTERFACE.md`.
Claude queda disponible para blockers de contrato, bindings o proof.

---

## B. UI end-to-end

**Owner:** Ponti · **Rama:** `ui/end-to-end` · **Gate:** `green-06-e2e`

**Depende de A.** Hasta que exista la capa de integración, Ponti puede construir
el shell visual con fixtures aislados, pero no conectar nada.

- consumir la interfaz de integración, sin importar providers ni bindings;
- conexión de wallet;
- formulario privado;
- progreso de la prueba;
- resultado compatible;
- rechazo incompatible;
- rechazo duplicado;
- Match Pass;
- refresh del estado público.

**Termina cuando** una persona abre la app, ve una vacante, ingresa sus valores,
conecta Lace, genera una prueba, autoriza, ve el resultado y confirma el cambio
público.

---

## C. Recruiter view + Ledger Lens

**Owners:** Coqui (lectura) + Ponti (presentación). **Depende de A y B.**

- términos públicos reales;
- `matchCount` real, del ledger;
- nullifiers o tickets, según decida la UX;
- mostrar **explícitamente qué NO recibió** el recruiter: salario exacto,
  disponibilidad exacta, identidad.

No se acepta un dashboard alimentado solo por estado de React. Franco debe poder
recargar y ver que el dato viene del provider o del indexer.

---

## D. Hardening

**Owners:** los tres. **Gate:** `green-07-core-frozen`

Se deja de agregar y se intenta romper:

- errores y estados de fallo;
- reload en medio del flujo;
- wallet no detectada, bloqueada, conexión rechazada;
- proof server caído;
- indexer lento;
- duplicado;
- auditoría de privacidad: sin datos privados en logs, requests ni estado compartido;
- **la demo completa, tres veces seguidas.**

Claude corre el hardening del contrato: review final de disclosures,
security review y fact-check.

A partir de este gate: sin arquitectura nueva, sin dependencias nuevas, sin
features sin autorización de Franco. Recién acá se abre `docs/POST_MVP.md`.

---

## E. Submission

**Owner:** Ponti (Submission Owner), con revisión técnica de Franco y Claude.

- README completo;
- **video de respaldo grabado antes de cualquier extra**;
- pitch y deck;
- runbook de demo;
- links probados en incógnito;
- freeze final.

---

## Dependencias entre owners

```text
contrato ✅ ──▶ A. integración (Coqui) ──▶ B. UI e2e (Ponti) ──▶ C. recruiter
                                                                      │
                                                                      ▼
                                                              D. hardening
                                                                      │
                                                                      ▼
                                                              E. submission
```

Lo que **sí** puede avanzar en paralelo ahora mismo:

- shell visual de Ponti con fixtures aislados, sin tocar integración;
- documentación operativa y QA (Franco + su Codex);
- soporte y hardening del contrato (Claude), a demanda.

Lo que **no** puede terminar antes de tiempo:

- la llamada al circuito sin bindings reales;
- el flujo de duplicado sin integración;
- el recruiter dashboard sin lectura pública real;
- la demo final sin E2E.
