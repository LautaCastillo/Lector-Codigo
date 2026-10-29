# ADR 0002: Cuentas creadas por administrador y sesión sin caducidad

- Estado: aceptada
- Fecha: 26/10/2026
- Decide: el autor del proyecto
- Plan: [`plan-v3-supabase-directo.md`](../plan-v3-supabase-directo.md), decisiones D2 y D3

## Contexto

Hoy cualquiera puede registrarse desde la app y queda pendiente hasta que un administrador lo apruebe. El plan anterior recomendaba autenticación propia con invitaciones; no hay hosting para una autenticación propia, y Supabase Auth ya funciona. El personal de Patrimonio (unas 30 personas) releva en campo y no quiere volver a identificarse a cada rato.

## Decisión

- **Proveedor:** Supabase Auth, definitivo. No se construye autenticación propia.
- **Alta de cuentas:** solo las crea un administrador desde la app. Una Edge Function (`admin-cuentas`, acción `crear`) verifica que quien llama sea administrador activo, crea el usuario con la clave secreta, inserta la fila en `usuario` y registra el evento de auditoría. El registro público de Supabase Auth se desactiva.
- **Contraseña inicial:** temporal, la entrega el administrador, con cambio obligatorio en el primer ingreso.
- **Estados de cuenta:** `activa`, `suspendida` y `baja`. Desaparecen `pendiente` y `rechazada`.
- **Sesión:** no caduca por tiempo. Se guarda en `expo-secure-store` con renovación automática.
- **PIN y biometría:** opcionales, se activan en Ajustes.
- **Corte de acceso:** suspender o dar de baja una cuenta corta el acceso a los datos de inmediato, porque cada política RLS consulta el estado de la cuenta (ver [ADR 0005](0005-seguridad-por-rls-y-privilegios-minimos.md)), aunque el teléfono conserve su sesión.
- **Recuperación de contraseña:** la restablece un administrador (acción `restablecer` de la misma función) con una contraseña temporal nueva. Sin correo.
- **Contraseña temporal:** la genera la Edge Function (12 caracteres aleatorios, sin los que se confunden al leer) y se muestra una sola vez al administrador. No se guarda en ningún lado.

## Consecuencias

- Un teléfono perdido sigue teniendo sesión abierta hasta que un administrador suspenda la cuenta. El riesgo se acepta con la suspensión inmediata y la recomendación del PIN.
- Hace falta una pantalla "Nueva cuenta" y una de gestión (rol, suspender, baja) para administradores.
- El correo de la cuenta es interno (por ejemplo `usuario@patrimonio.local`); no se envían correos, así que la confirmación de correo se desactiva.
- El primer administrador se crea fuera de la app, con el panel de Supabase o una Edge Function de arranque.
