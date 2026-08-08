# ProofMatch

**Match before you disclose.** Privacy-first job matching built on [Midnight Network](https://midnight.network) — Hack Buenos Aires 2026, Midnight Beginners Track.

Recruiting forces both sides to reveal sensitive terms before knowing whether they are compatible. ProofMatch flips the order: candidate and recruiter **prove compatibility in zero knowledge first** and reveal exact numbers later, only by explicit consent.

- The recruiter publishes a **public salary band** and commits to a **private exact cap**, proving in ZK that it sits inside the band.
- The candidate proves their **private minimum** is at or below the band floor — so by transitivity `minimum ≤ cap`, without the chain ever comparing the two secrets.
- Hours, work mode and commute-within-radius are proven the same way; a per-vacancy **nullifier** prevents duplicate matches without identifying anyone.
- **Verified qualifications (V2Q + Midnames):** a vacancy can require *English ≥ B2*. A real W3C Verifiable Credential is verified off-chain by [Midnames](https://github.com/midnames/core) (P-256 signature vs. on-chain issuer DID, holder binding, revocation); an authorized verifier then writes a **job-specific opaque attestation**, and the match circuit proves private ownership of it. The recruiter sees only "English ≥ B2 — Credential-backed ✓". The exact level never touches the chain.

> Midnames verifies the credential. ProofMatch proves private ownership of the verified qualification.

## What is real

Smart contracts in **Compact** with real ZK proofs, real transactions signed through **Lace**, and state read back from the **indexer** on a local Midnight devnet. Full-chain E2E evidence (tx hashes, attestation and qualified match) is recorded in [`docs/MIDNAMES_QUALIFICATION.md`](docs/MIDNAMES_QUALIFICATION.md). The multi-job preview is local/off-chain **by design** — the candidate proves only the job they choose.

## Repository map

| Path | Contents |
|---|---|
| `contracts/` | Compact contracts: `proofmatch-job` (V1), `proofmatch-job-v2` (double-sided salary privacy), `proofmatch-job-v2q` (V2 + verified qualification gate) |
| `src/proofmatch-v2/` | application layer, browser facade, `qualification/` (Midnames bridge, credential holder, Q derivation) |
| `ui/` | React + Vite studio (recruiter, candidate profile, job board, privacy receipt, ledger lens, consent reveal) |
| `tests/` | 265 tests: contract simulator suites (incl. negative security cases and a deliberately broken fixture), unit and browser-facade tests |
| `scripts/` | devnet E2E flows (`proofmatch-v2q-e2e.ts` runs the full qualified match against the real chain) |
| `docs/` | [`CONTRACT_INTERFACE.md`](docs/CONTRACT_INTERFACE.md) (full contract interfaces) · [`MIDNAMES_QUALIFICATION.md`](docs/MIDNAMES_QUALIFICATION.md) (architecture, trust model, bring-up, evidence) |

## Build and test

Requirements: Node ≥ 22, Docker, and the [Compact CLI](https://docs.midnight.network/) (`compact`) on PATH.

```bash
npm install
npm run compile          # compiles the 4 Compact contracts (PASS expected)
npm test                 # 265/265 simulator + unit tests, no chain needed
npx tsc --noEmit         # root typecheck
```

Local devnet + real-chain flows:

```bash
npm run proof-server:start        # node + indexer + proof server (docker)
npm run test:e2e:v2               # real V2 flow: deploy, budget lock, guaranteed match
```

The verified-qualification E2E additionally needs the local Midnames stack (credential server + its own chain) and the ProofMatch bridge — exact bring-up order in [`docs/MIDNAMES_QUALIFICATION.md`](docs/MIDNAMES_QUALIFICATION.md), then:

```bash
MIDNAMES_ISSUER_DID=<from deploy-issuer> npm run test:e2e:v2q
```

UI (browser demo with Lace wallet against the local devnet):

```bash
cd ui && npm install && cp .env.example .env.local && npm run dev
```

## Honest limitations

Credential verification is off-chain by design; the attestation verifier is a trusted bridge entity (the chain enforces its authorization in-circuit, not the truth of its evaluation); attestations are point-in-time; Midnames has no selective disclosure, so a consented credential presentation reveals the full credential. Local-devnet demo — not deployed to a public network.

---

This project is part of the Midnight Network ecosystem.
