# Verified Qualifications — Midnames × ProofMatch V2Q

La segunda categoría de datos de ProofMatch. Las **private preferences** (salario,
horas, modalidad, commute, presupuesto del empleador) son autodeclaradas y se
prueban en ZK. Las **verified qualifications** están respaldadas por una
credencial W3C real emitida y verificada por Midnames.

MVP: una sola qualification — `EnglishProficiencyCredential` (escala CEFR,
A1=1 … C2=6). Demo: vacante exige English ≥ B2; candidato tiene C1 real.

## Modelo de confianza (honesto)

```
ProofMatch Demo Issuer
      │  emite VC W3C real (P-256, DataIntegrityProof/ecdsa-2019)
      ▼
credencial del CANDIDATO (browser: VC + holder key WebCrypto)
      │  Verifiable Presentation con challenge single-use
      ▼
MIDNAMES verifica OFF-CHAIN          ←— la cadena de Midnames resuelve
  · firma contra el DID del issuer       issuer DID, holder DID y la
  · holder binding                       revocation list on-chain
  · validez / expiración
  · revocación (contrato on-chain)
      ▼
BRIDGE de ProofMatch (verifier autorizado, proceso server-side)
  · pinea el issuer DID confiable
  · evalúa nivel de la VC ≥ requiredQualificationLevel (leído de la cadena)
  · attesta Q OPACA en el contrato V2Q (tx real, autorización hash-secret
    verificada EN el circuito)
      ▼
CANDIDATO prueba en ZK (proveGuaranteedMatch de V2Q)
  · conoce el qualificationSecret que deriva Q
  · Q está attestada en ESTA vacante (membresía por Merkle path,
    leaf re-bindeada — el ledger no sabe QUÉ attestation respaldó el match)
  · + todas las condiciones V2 (salario, horas, modalidad, commute, nullifier)
```

**Narrativa correcta:** “Midnames verifies the credential. ProofMatch proves
private ownership of a job-specific verified attestation.”
**Nunca afirmar:** “ProofMatch verifies the VC signature inside ZK.”

`Q = persistentHash("proofmatch:qualification:v1", kernel.self().bytes,
qualificationType, qualificationSecret)` — distinta por vacante, por tipo y
por secreto. Una Q copiada del ledger no sirve sin el secreto (probado por
test de simulador + fixture roto + negativo E2E).

Qué NO recibe nunca el recruiter automáticamente: el nivel exacto, la VC, el
nombre, un DID estable del candidato, el qualificationSecret. Post-match el
candidato puede consentir una **Verifiable Presentation completa** (Midnames
no tiene selective disclosure; se presenta la credencial entera, y solo con
ese consentimiento explícito).

## Piezas

| Pieza | Dónde | Rol |
|---|---|---|
| `contracts/proofmatch-job-v2q.compact` | ProofMatch | V2 + gate de qualification. V2 intacto: vacantes sin requisito siguen en V2. |
| `src/proofmatch-v2/qualification/` | ProofMatch | niveles CEFR, derivación de Q, deploy/join/witnesses/service V2Q, cliente Midnames, holder WebCrypto, **bridge-server** |
| `scripts/qualification-bridge.ts` | ProofMatch | daemon del bridge (`npm run qualification-bridge`) |
| `scripts/proofmatch-v2q-e2e.ts` | ProofMatch | E2E real (`npm run test:e2e:v2q`) |
| Midnames stack | `/home/franco/midnames-core` (clon externo, branch `proofmatch-local-deploy`) | server de credenciales + su propia chain local |

El stack de Midnames corre en **su propia chain local** (imágenes pineadas por
su bench: node 0.22.1, indexer 4.0.0, proof-server 8.0.3) en puertos
19944/18088/16300 — al lado del devnet de ProofMatch (9944/8088/6300), sin
tocar dependencias de ProofMatch. Desde la perspectiva de ProofMatch, TODO el
stack de Midnames es el verificador off-chain confiable, incluida su cadena.

Adaptaciones locales del clon de Midnames (documentadas en ese repo, branch
`proofmatch-local-deploy`): el DID contract compilado es la baseline pública
`midnightntwrk/midnight-did@e603ac9` recortada a los circuitos que el server
usa (el deploy de 13 circuitos excede los límites de bloque del node dev) más
dos wrappers de compatibilidad (`addVerificationMethod`/`updateVerificationMethod`
sobre la semántica de `setVerificationMethod`); x/y de las JWK viajan como hex
strings (el shape de la baseline). El código de emisión/verificación/revocación
de `@midnames/vc` quedó intacto.

## Levantar todo (orden exacto)

```bash
# 0. Devnet de ProofMatch + contratos (como siempre)
npm run proof-server:start && npm run compile

# 1. Chain local de Midnames
cd /home/franco/midnames-core
docker compose -f bench/proofmatch-env.yml up -d

# 2. Server de credenciales (English). Primera vez: bootstrap + issuer DID.
set -a; . bench/proofmatch.env; set +a
node bench/bootstrap-local-wallet.mjs        # solo primera vez (dust)
node examples/deploy-issuer.ts               # solo primera vez → ISSUER_DID
node bench/english-server.mjs                # queda corriendo (puerto 3300)

# 3. Bridge de ProofMatch (verifier autorizado)
cd /home/franco/proofmatch-claude
cp scripts/qualification-bridge.env.example .env.qualification-bridge
#   (completar MIDNAMES_ISSUER_DID con el output de deploy-issuer)
set -a; . ./.env.qualification-bridge; set +a
npm run qualification-bridge                 # queda corriendo (puerto 3400)

# 4. UI: agregar a ui/.env.local
#      VITE_PROOFMATCH_QUALIFICATION_BRIDGE_URL=http://127.0.0.1:3400
cd ui && npm run dev
```

E2E headless (con 1–3 corriendo):

```bash
MIDNAMES_ISSUER_DID=did:midnight:undeployed:<addr> npm run test:e2e:v2q
```

## Evidencia registrada (2026-08-08, corrida real)

Midnames (su chain local):
- issuer DID `did:midnight:undeployed:e78636f332cc05e23f239608886449a1f71354db1819c77f0d75244e00c056e9`
- revocation list `696ef06077073fb0d9a77496d9c4509cd147bfba816e798d6882ffa439cb7584`
- ciclo completo issue→verify→VP→revoke→revoked: `bench/english-smoke-evidence.json`

ProofMatch devnet (`PROOFMATCH_V2Q_E2E_PASS`):
- vacante V2Q `944282c4986308516da962bb094c05434c42452fc3b46f523d5ad980d401c3db`
- deploy `0084de5e…c1441a` · lockPrivateBudget `003a3275…82c983`
- attestation `009cbe5e…c5f36b` · guaranteed match calificado `00a87892…dcbef03`
- credencial `urn:uuid:1ebf277e-04c8-4902-94c0-187d87586bdc` (C1, requisito B2)
- negativos: B1<B2 REFUSED · VC adulterada INVALID · VC revocada REFUSED ·
  verifier impostor REJECTED (assert del circuito) · Q copiada REJECTED
- privacidad: ni secretos, ni Q, ni números privados en el estado público
- attestationCount=1, matchCount=1, 1 nullifier, 1+1 commitments

## Límites conocidos (honestos)

- El verifier del bridge es una entidad confiable del puente — como todo
  credential verifier. La cadena garantiza que solo él attesta y que nadie usa
  una attestation ajena; no elimina la confianza en su evaluación.
- La attestation es point-in-time: una revocación POSTERIOR no retira una Q ya
  attestada (la revocación sí bloquea attestations nuevas). Un `closeJob` /
  expiry de attestations es post-MVP.
- Midnames no ofrece selective disclosure: el consent reveal presenta la
  credencial completa. Se dice tal cual en la UI.
- La clave del holder vive en localStorage para la demo; producción usaría un
  wallet real / claves WebCrypto no extraíbles.
