# POST_MVP — ProofMatch

> **Nada de este documento se toca antes de tener:**
> MVP end-to-end funcionando + video de respaldo grabado + `green-07-core-frozen`.
>
> Si algo de acá parece tentador y todavía no se cumplen las tres condiciones,
> la respuesta es no. Ver `docs/MVP_DEFINITION.md`.

---

## P0 — Antes de cualquier extra

No son extras: son la condición para poder considerarlos.

- [ ] Video de respaldo grabado. **Primero esto, antes que cualquier mejora.**
- [ ] Demo repetible: tres corridas completas sin intervención manual.
- [ ] README mínimo completo.
- [ ] Fallback listo por si la demo en vivo falla.
- [ ] Cero bugs conocidos en el core.

---

## P1 — Privacy Receipt / Ledger Lens mejorado

**Riesgo: bajo. Valor de demo: alto.** El mejor primer extra.

Mejora la comunicación sobre estado que **ya existe**: no toca el contrato ni la
integración. Mostrar lado a lado qué probó el candidato, qué recibió la empresa
y —sobre todo— **qué nunca recibió**.

Es lo que hace entendible el producto para alguien no técnico, que es
exactamente el criterio de la etapa final.

**Owner:** Ponti.

---

## P2 — Match Pass con QR

**Riesgo: bajo-medio.**

Ponti genera el QR, Coqui aporta la referencia pública real (dirección del
contrato o del match). No requiere tocar el contrato.

**Owners:** Ponti + Coqui.

---

## P3 — `closeJob`

**Riesgo: medio.** Requiere contrato.

`jobState` ya existe y `proveMatch` ya verifica que la vacante esté `OPEN`: la
guarda está puesta. Falta el circuito que transicione a `CLOSED` y su
autorización — que hoy **no está resuelta**: no hay identidad de empleador en el
contrato, y `ownPublicKey()` no sirve para autorizar.

Solo si el patrón de autorización está confirmado con documentación oficial.

**Owner:** Claude (contrato) + Ponti (UI).

---

## P4 — Tercer criterio, por ejemplo días onsite

**Riesgo: medio.** Contrato + integración + UI.

No se agrega hasta que las dos condiciones originales estén estables end-to-end.
Multiplica la superficie de test y de UX por poco valor incremental de demo.

**Owners:** los tres.

---

## P5 — Consent Reveal

**Mayor valor. Mayor riesgo.**

Involucra contrato, commitment, private state, integración y UX a la vez.

Si se intenta:

- **timebox duro de 60 a 90 minutos**;
- si no queda verde dentro del timebox: **revertir** y mantenerlo como roadmap;
- el commitment debe usar su **propio domain separator**
  (`proofmatch:job-consent:v1`), nunca reusar el nullifier — reusarlo lo
  convertiría de valor de un solo uso en pseudónimo estable dentro de la vacante;
- conviene que el commitment incluya los valores declarados: el candidato podría
  seguir mintiendo, pero no mentir *distinto* en cada etapa.

**Owners:** los tres, coordinados por Franco.

---

## Mejoras que no son features

Bajo riesgo, y suelen mover más la aguja que una feature nueva.

- Pulir la narrativa de **por qué Midnight**: qué sería imposible sin ZK.
- Contar la generación de la prueba como parte de la historia, no como un spinner.
- Presets de demo para no tipear en vivo.
- Pitch de 90 segundos, ensayado.
- Screenshots y video de calidad.
- Mensajes de error amigables en lugar de los strings del contrato.
- README reproducible: que alguien lo siga en limpio y le funcione.

---

## Cómo se decide entrar acá

1. Se cumple P0 completo.
2. Franco autoriza el extra específico y su timebox.
3. Se abre una rama propia desde `origin/main`.
4. Si el timebox vence sin verde: se revierte, sin discusión.

El criterio de fondo no cambió: **un ProofMatch chico, real y estable vale más
que una plataforma grande incompleta.**
