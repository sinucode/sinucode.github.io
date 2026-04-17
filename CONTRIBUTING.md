# Contribuir

Gracias por querer contribuir. A continuación indicamos las pautas mínimas para colaborar de forma segura y efectiva.

1) Antes de abrir un PR
- Lee `SECURITY.md`.
- Ejecuta linters y tests localmente. Si no estás seguro de los comandos, revisa `frontend/package.json` y `backend/package.json`.
- No subas secretos ni credenciales al repositorio.

2) Flujo de trabajo
- Crea una rama descriptiva: `feature/xxx`, `fix/xxx`, `chore/deps-update`.
- Haz commits pequeños y atómicos con mensajes claros.
- Abre un PR con la plantilla correspondiente y completa el checklist.

3) Revisiones
- Los cambios relacionados con seguridad o dependencias deben ser revisados por al menos un mantenedor y pasar las pruebas automáticas.

4) Actualizaciones de dependencias
- Si actualizas dependencias, añade notas sobre riesgos y los resultados de `npm audit`.

5) Reportar vulnerabilidades
- Usa `SECURITY.md` para reportar vulnerabilidades de forma privada.

Si necesitas ayuda, abre un issue y etiqueta `help wanted`.
