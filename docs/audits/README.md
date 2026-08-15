# docs/audits/ — Auditorías técnicas

Auditorías técnicas integrales del proyecto (clon de Minecraft). Cada
auditoría documenta hallazgos verificados en el código, priorizados por
gravedad (críticos → bajos), falsos positivos descartados y el estado de
corrección de cada hallazgo.

| Auditoría | Contenido |
| --- | --- |
| [`auditoria-2026-08-09.md`](auditoria-2026-08-09.md) | Auditoría técnica integral (errores, seguridad, rendimiento y paridad): hallazgos priorizados por gravedad, falsos positivos descartados y estado de corrección |
| [`auditoria-2026-08-10.md`](auditoria-2026-08-10.md) | Auditoría integral (commit `da0b4c0`): línea base + cinco pases (cliente CL-1..CL-4, servidor SV-1..SV-6, seguridad SEC-1..SEC-4, rendimiento REN-1..REN-3, paridad PAR-1..PAR-8) — base de la Fase 16 |
| [`auditoria-2026-08-11.md`](auditoria-2026-08-11.md) | Auditoría integral (commit `3dc581e`): base de la Fase 17/18 (skins, menú, refactor y paridad C-1..C-9) |

Los hallazgos que llevan a código se resuelven en su fase (ver las specs de
`../spec/`); el estado vivo de cada fase está en [`STATUS.md`](../../STATUS.md).
