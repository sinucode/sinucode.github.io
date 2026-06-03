---
description: Revisa el git diff actual con el subagente code-reviewer y resume por severidad
---

Revisa los cambios pendientes del repositorio usando el subagente **code-reviewer**.

Pasos:
1. Reúne el contexto del diff (sin commitear nada):
   - `git status`
   - `git diff` (working tree) y `git diff --staged` (staged)
2. Delega en el subagente **code-reviewer** (solo lectura) pasándole ese diff y
   pidiéndole que: detecte bugs y problemas de calidad/seguridad, identifique **qué
   funciones se ven afectadas** y quién las consume (apoyándose en `ARCHITECTURE.md`),
   y preste atención a las trampas del proyecto (zona horaria Bogotá/UTC, `Decimal`/
   redondeo, capas backend, `invalidateMoney` en frontend).
3. Presenta el resultado agrupado por **severidad**:
   - 🔴 Crítico · 🟠 Alto · 🟡 Medio · 🔵 Bajo
   Cada hallazgo con `archivo:línea`, descripción y una sugerencia concreta.
4. Cierra con un veredicto breve: ¿listo para continuar o hay bloqueantes?

No apliques cambios en este comando: es revisión. Los arreglos los hace `developer`
o `database` después.

Argumentos opcionales del usuario: $ARGUMENTS (p. ej. una ruta o rango de commits a
revisar en vez del working tree).
