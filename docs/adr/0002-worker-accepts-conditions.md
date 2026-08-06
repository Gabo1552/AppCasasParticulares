# ADR 0002 — La relación laboral se activa con la aceptación de la trabajadora

- **Estado**: Aceptada
- **Fecha**: 2026-08-06
- **Decide**: equipo técnico
- **Contexto**: Etapa 3, pasos 1 a 6 del recorrido vertical
- **Modifica**: la máquina de estados de `EmploymentRelationship` definida en la ADR 0001

## Problema

La máquina de estados de la ADR 0001 permitía este arco:

```
PENDING_CONFIGURATION ──▶ ACTIVE     [FAMILY_EMPLOYER]
```

Es decir: la familia completaba las condiciones y activaba la relación por su cuenta. La aceptación
de la trabajadora ocurría antes, sobre la **vinculación** (`PENDING_WORKER_ACCEPTANCE →
PENDING_CONFIGURATION`), cuando todavía no existían ni la remuneración ni el horario.

Eso deja a la trabajadora aceptando un vínculo cuyas condiciones económicas no conoce. El
requerimiento del recorrido es explícito en sentido contrario:

> "No permitas que la familia active unilateralmente la relación sin aceptación de la trabajadora."

Y REL-08 pide "aceptación bilateral de condiciones y cambios", no de la vinculación.

## Decisión

Se invierte el orden: la aceptación de la trabajadora pasa a ser el **último** paso, y recae sobre
las condiciones concretas.

```
DRAFT ──────────────────▶ PENDING_CONFIGURATION      [FAMILY_EMPLOYER | SYSTEM]
                          (la trabajadora aceptó la invitación)

PENDING_CONFIGURATION ──▶ PENDING_WORKER_ACCEPTANCE  [FAMILY_EMPLOYER]
                          (guarda: condiciones vigentes + calendario publicado)

PENDING_WORKER_ACCEPTANCE ──▶ ACTIVE                 [WORKER]
                          (guarda: aceptación registrada con evidencia)

PENDING_WORKER_ACCEPTANCE ──▶ PENDING_CONFIGURATION  [WORKER | FAMILY_EMPLOYER]
                          (la trabajadora rechaza, o la familia retira para corregir)
```

Se **elimina** el arco `PENDING_CONFIGURATION → ACTIVE`. El único camino a `ACTIVE` es el que
ejecuta el rol `WORKER`.

No se agregan estados: los cuatro del enum ya existían y alcanzan. Lo que cambia es qué significa
`PENDING_WORKER_ACCEPTANCE` — antes "esperando que acepte el vínculo", ahora "esperando que acepte
las condiciones".

## Alternativas descartadas

| Alternativa                                                     | Por qué no                                                                                                                                                  |
| --------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Agregar un estado `PENDING_CONDITIONS_ACCEPTANCE`               | Duplica el significado de `PENDING_WORKER_ACCEPTANCE` y obliga a migrar el enum sin ganar nada                                                              |
| Dejar el arco de activación unilateral y validar en el servicio | La garantía quedaría fuera de la máquina de estados, que es justamente donde el encargo pide que viva ("no permitas modificaciones arbitrarias de estados") |
| Mantener las dos aceptaciones, de vinculación y de condiciones  | Dos confirmaciones para la trabajadora sin valor agregado; la primera ya la da al aceptar la invitación, que ahora es una entidad propia                    |

## Consecuencias

**Positivas**

- La trabajadora acepta viendo la remuneración, la modalidad y el calendario. Antes no los veía.
- El arco de rechazo devuelve la relación a configuración, así que la familia puede corregir y
  reenviar sin recrear nada.
- La imposibilidad de activación unilateral es una propiedad de la máquina de estados, verificada
  por pruebas, no una regla escrita en un servicio.

**Costos aceptados**

- `PENDING_WORKER_ACCEPTANCE` cambia de significado respecto de la ADR 0001. Como no hay datos en
  producción, no hay migración de estados que hacer.
- La familia necesita un paso más ("enviar condiciones") antes de que la relación quede activa.

## Verificación

Las pruebas de `packages/domain` cubren:

- que no exista ningún arco hacia `ACTIVE` ejecutable por `FAMILY_EMPLOYER`;
- que `PENDING_CONFIGURATION → PENDING_WORKER_ACCEPTANCE` falle sin condiciones o sin calendario;
- que `PENDING_WORKER_ACCEPTANCE → ACTIVE` falle si el actor no es `WORKER`;
- que el rechazo exija motivo y devuelva la relación a `PENDING_CONFIGURATION`.
