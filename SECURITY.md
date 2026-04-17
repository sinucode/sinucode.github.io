# Política de seguridad

Gracias por tomarte el tiempo de informar problemas de seguridad. Preferimos comunicaciones privadas para poder evaluar y solucionar vulnerabilidades antes de hacerlas públicas.

Contacto
- Envía un correo a `security@sinucode.com` con los detalles del hallazgo.
- Si no es posible por correo, abre un issue y etiqueta `security`. Indica en el cuerpo que el reporte es confidencial.

Qué incluir al reportar
- Componentes afectados (por ejemplo `backend/` o `frontend/`) y versión/commit.
- Descripción clara del problema y su impacto.
- Pasos para reproducir y PoC mínimo si aplica.
- Logs, request/response y payloads relevantes.

Proceso y tiempos
- Confirmaremos recepción en 72 horas hábiles.
- Evaluaremos, asignaremos prioridad y trabajaremos en un parche.
- Pedimos no divulgar públicamente hasta que se libere una corrección o el equipo coordine la divulgación.

Buenas prácticas para contribuciones
- No subir secretos (tokens, claves privadas) al repositorio.
- Usar variables de entorno y gestores de secretos.
- Ejecutar linters y tests localmente antes de abrir un PR.
- Añadir información de seguridad en la descripción del PR si el cambio afecta a seguridad, dependencias o datos sensibles.

Dependencias
- Mantén dependencias actualizadas. Revisamos `npm audit`/Dependabot y aceptamos PRs que actualicen dependencias siempre que pasen las pruebas.

Divulgación pública y CVE
- Para vulnerabilidades críticas, coordinaremos la asignación de CVE cuando proceda.

Gracias por ayudarnos a mantener este proyecto seguro.
