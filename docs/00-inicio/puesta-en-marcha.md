# Puesta en marcha

Cómo levantar el proyecto en una computadora nueva. Última verificación: 30/10/2026 (plan v3, sin backend propio).

## Requisitos

- Node.js 24 o superior y Git.
- Un proyecto de Supabase con las migraciones aplicadas y su URL y clave **publicable**. Nunca la clave secreta.
- Un celular Android con Expo Go compatible con SDK 58, en la misma red que la computadora.

No hace falta Docker ni un servidor propio: la app habla directo con Supabase.

## Pasos

1. Clonar e instalar:
   ```bash
   git clone https://github.com/LautaCastillo/Lector-Codigo.git
   cd Lector-Codigo
   git checkout lautaPC
   npm_config_legacy_peer_deps=true npm install
   ```
2. Crear `app/.env` a partir de `app/.env.example` y completar `EXPO_PUBLIC_SUPABASE_URL` y `EXPO_PUBLIC_SUPABASE_KEY` (clave publicable).
3. Compilar el paquete compartido:
   ```bash
   npm run build -w shared
   ```
4. Base de datos. Si el proyecto de Supabase ya existe, no hay nada que hacer. Para uno nuevo, aplicar en orden `supabase/base-prisma/migraciones/` y después `supabase/migrations/` (ver [`supabase/README.md`](../../supabase/README.md)), y desplegar la Edge Function `admin-cuentas` (`supabase/functions/`).
5. Primer administrador. Nadie puede aprobar al primero; se crea la cuenta en el panel de Supabase (Authentication, Users) y se la designa en la base:
   ```sql
   UPDATE usuario SET estado = 'activa', rol = 'administrador' WHERE cuenta = '<correo>';
   ```
   Después de eso, las demás cuentas las crea un administrador desde la app (Cuentas, Nueva cuenta).
6. Iniciar la app y escanear el código QR con Expo Go:
   ```bash
   npm run start -w app -- --clear
   ```
   En el primer ingreso la app pide elegir una contraseña propia. El PIN de bloqueo es opcional (Ajustes).
7. Cargar el catálogo: como administrador, menú "Importar catálogo" (CSV o XLSX exportado de SIU Diaguita). Se puede repetir con cada área; "Historial de cargas" muestra lo ya importado.
8. Pruebas:
   ```bash
   npm test
   ```
   Corre las pruebas unitarias de `shared` y de `app`. Las pruebas de políticas y funciones SQL están en `supabase/tests/` y se ejecutan contra el proyecto (cada una termina en ROLLBACK; todas deben dar `true`).

## Advertencias

- Los `.env` no se versionan y deben recrearse en cada computadora.
- Desactivar el registro público en Supabase (Authentication, "Allow new users to sign up"): las cuentas las crea un administrador.
- Cambiar o dar de baja las cuentas de prueba (`adminlauta`, `relevador-app`, `prueba1`) antes de cargar datos reales, y rotar la cuenta `consulta.patrimonio` de SIU, cuyas credenciales se expusieron en un chat.
- Antes de cargar datos reales hace falta el aval escrito de Patrimonio.
