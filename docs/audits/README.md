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
| [`auditoria-2026-08-15.md`](auditoria-2026-08-15.md) | Auditoría de seguridad/resiliencia/rendimiento/cliente (working tree con F19.5) que detectó H1/B1/M1-M5/B2/B3, P1-P7, CL-1..CL-8 y F1-F8; integrada y corregida en el cierre de la F19.6 (`161721c`) |
| [`auditoria-2026-08-16.md`](auditoria-2026-08-16.md) | Auditoría manual (commit `7b5b83f`): dos hallazgos de documentación (comentario de TNT y wording de dimensiones), resueltos en el cierre de la F19.6 |
| [`auditoria-2026-08-16-copilot.md`](auditoria-2026-08-16-copilot.md) | Reconciliación de la auditoría de **GitHub Copilot** (2026-08-16, árbol `161721c`) con el árbol actual: veredicto hallazgo→estado (casi todo ya corregido) + plan de los pendientes reales en la Fase 20 |

Los hallazgos que llevan a código se resuelven en su fase (ver las specs de
`../spec/`); el estado vivo de cada fase está en [`STATUS.md`](../../STATUS.md).
