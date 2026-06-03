---
description: Refresca ARCHITECTURE.md con el subagente architecture-keeper tras cambios estructurales
---

Actualiza el mapa de arquitectura del proyecto usando el subagente
**architecture-keeper**.

Pasos:
1. (Opcional) Detecta qué cambió estructuralmente para enfocar la actualización:
   - `git status` y `git diff --stat`
2. Delega en el subagente **architecture-keeper**, pidiéndole que refresque
   **`ARCHITECTURE.md`** (raíz): mapa por módulo con propósito, funciones/archivos
   clave (`ruta` + qué hace) y dependencias (de qué depende y quién lo consume).
   Debe actualizar de forma **incremental** (solo las secciones afectadas, conservando
   el resto y el formato) y documentar únicamente lo que existe hoy en el código.
3. Confirma al final qué secciones se actualizaron.

Recuerda: `architecture-keeper` solo escribe `ARCHITECTURE.md`; no toca código.

Argumentos opcionales del usuario: $ARGUMENTS (p. ej. el módulo o área concreta a
remapear).
