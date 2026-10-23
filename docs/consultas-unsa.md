# Consultas a la UNSa

Registro de preguntas enviadas, respuestas, fecha y quién respondió. Origen: secciones 3.3 y 7.1 del [plan vigente](plan-de-mejora-login-auditoria-siu.md). Versión inicial: 23/10/2026. **Todavía no se envió ninguna.**

## Antes de consultar

Conviene pedir a la Dirección de Patrimonio una nota o aval que respalde la solicitud. El proyecto es independiente del área y el Centro de Cómputos no lo conoce: Patrimonio es quien puede justificar el acceso a sus datos. Es una recomendación propia, no figura en el plan.

## Preguntas al Centro de Cómputos y al referente de SIU (plan, sección 3.3)

| N.º | Pregunta | Enviada | Respuesta | Respondió |
|---|---|---|---|---|
| 1 | ¿Qué versión de SIU-Diaguita está en producción y qué versión de API expone (1.0 a 1.4)? | No | | |
| 2 | ¿Está habilitado el REST de Diaguita (`/diaguita/rest/v1/`)? ¿Pueden crear un usuario de API exclusivo para esta app? ¿Con digest o basic? ¿Pueden limitarlo a operaciones GET o a recursos de patrimonio? | No | | |
| 3 | ¿Qué recursos de bienes expone su instalación (consola `/rest`)? ¿Usan el bundle de Patrimonio de Huarpe o la verificación de la App Colector? | No | | |
| 4 | ¿Dónde podría alojarse el backend: un servidor o una VM dentro de la red de la UNSa, o en la nube con VPN o lista de IP? ¿Hay un proxy inverso con HTTPS y un dominio institucional disponible? | No | | |
| 5 | Si la API no fuera posible, ¿aceptarían crear vistas de solo lectura y un rol PostgreSQL dedicado, como hace Wichi? | No | | |
| 6 | ¿Pueden programar una exportación periódica de bienes (CSV o Excel) a una ubicación accesible por el backend? ¿Con qué frecuencia? | No | | |
| 7 | ¿Qué sistema gestiona las cuentas web institucionales: SIU-Araí (SAML u OIDC), Active Directory o LDAP, CAS u otro? ¿Permitirían registrar esta app como cliente o service provider? | No | | |
| 8 | ¿Hay SMTP institucional para correos transaccionales (invitaciones y recuperación de contraseña)? | No | | |
| 9 | ¿Existe una política de seguridad o de retención de registros que la app deba cumplir? | No | | |
| 10 | ¿El área de Patrimonio usa hoy la App Colector oficial? ¿Qué formato de archivo acepta Patrimonio, Colector de Datos? | No | | |

## Decisiones con la Dirección de Patrimonio (plan, sección 7.1)

| N.º | Pregunta | Enviada | Respuesta | Respondió |
|---|---|---|---|---|
| 11 | Modelo de alta de cuentas (por invitación) y quiénes serán administradores | No | | |
| 12 | Simbologías y formato real de las etiquetas (las de SIU parecen Code 128 con el número de 8 dígitos; en una prueba real una etiqueta se leyó como Code 39 y con 7 dígitos, `0304016`, para el bien `00304016`, y otra como `03316`: el escáner ya lo resuelve completando ceros, pero conviene confirmar el formato real con Patrimonio) | No | | |
| 13 | Retención de la auditoría y normativa aplicable (junto con el área legal) | No | | |
| 14 | ¿Se exporta en el formato del Colector de Datos de Diaguita? | No | | |
| 15 | Hallazgos: diferencia entre "no identificado" y "nuevo", cuántas fotos por hallazgo, tamaño máximo y dónde deben guardarse (hoy: una foto de hasta 1 MB en la base) | No | | |
| 16 | Licencia del código y permiso para mostrar el proyecto en el portfolio, sin datos reales (junto con la cátedra o tutor) | No | | |

## Pendientes de seguridad relacionados

- Rotar la cuenta `consulta.patrimonio` de SIU Diaguita, cuyas credenciales se expusieron en un chat.
- Confirmar si las consultas que se vieron en `diaguitadev.unsa.edu.ar` corresponden al ambiente de desarrollo o al de producción.
