# Puesta en marcha

Cómo levantar el proyecto en una computadora nueva. Última verificación: 23/10/2026.

## Requisitos

- Node.js 24 o superior (las dependencias de Nest no son compatibles con 22.12). Si se usa otra versión en otros proyectos, instalar `nvm-windows`.
- Git.
- Un proyecto de Supabase (base de datos y autenticación) y sus credenciales.
- Un celular Android con Expo Go compatible con SDK 58, en la misma red que la computadora.

Docker ya no es necesario. El `docker-compose.yml` queda solo para pruebas del backend con `AUTH_PROVISORIA=true`, sin login real.

## Pasos

1. Clonar e instalar:
   ```bash
   git clone https://github.com/LautaCastillo/Lector-Codigo.git
   cd Lector-Codigo
   git checkout lautaPC
   npm install
   ```
2. Crear `backend/.env` a partir de `.env.example` y completar:
   - `DATABASE_URL`: cadena **Session pooler** de Supabase (botón Connect), con la contraseña real y sin corchetes.
   - `SUPABASE_URL`: URL del proyecto. Es obligatoria: sin ella el backend no arranca.
3. Crear `app/.env` a partir de `app/.env.example` y completar:
   - (`EXPO_PUBLIC_API_URL` ya no se usa: la app no necesita el backend.)
   - `EXPO_PUBLIC_SUPABASE_URL` y `EXPO_PUBLIC_SUPABASE_KEY`: URL y clave **publicable** del proyecto. Nunca la clave secreta.
4. Compilar y preparar la base:
   ```bash
   npm run build -w shared
   npm run prisma:generate -w backend
   cd backend && npx prisma migrate deploy && cd ..
   ```
5. Primer administrador. Nadie puede aprobar al primero; se designa en la base, después de que esa persona se haya registrado una vez:
   ```sql
   UPDATE usuario SET estado = 'activa', rol = 'administrador' WHERE cuenta = '<correo>';
   ```
6. Cargar el catálogo (opcional): exportar "Bienes de uso" desde SIU Diaguita y subirlo desde la app, como administrador, en el menú "Importar catálogo" (Excel o CSV). El importador de línea de comandos del backend, que sigue abajo, ya no hace falta:
   ```bash
   npm run importar -w backend -- ruta/al/listado.xls
   ```
   SIU entrega el archivo con extensión `.xls`, pero es un `.xlsx`.
7. Iniciar el backend y la app, en dos terminales:
   ```bash
   npm run start:dev -w backend
   npm run start -w @patrimonio/app
   ```
   Escanear el código QR con Expo Go. Para entrar hace falta una cuenta creada por un administrador (pantalla Cuentas, Nueva cuenta); en el primer ingreso la app pide elegir una contraseña propia. El PIN de bloqueo es opcional y se activa desde Ajustes.
8. Ejecutar las pruebas:
   ```bash
   npm test
   npm run test:e2e -w backend
   ```

## Advertencias

- Los `.env` no se versionan y deben recrearse en cada computadora.
- Con "Confirm email" activado en Supabase Auth, quien se registra debe confirmar el correo antes de entrar.
- La cuenta de prueba de administrador se entrega fuera del repositorio. Cambiar su contraseña o eliminarla antes de cargar datos reales.
- `AUTH_PROVISORIA=true` acepta cualquier valor en la cabecera `x-relevador`: solo para desarrollo y pruebas; con `NODE_ENV=production` el backend lo rechaza.
- Las credenciales de SIU (`SIU_USUARIO`, `SIU_CLAVE`) van solo en `backend/.env`. La cuenta `consulta.patrimonio` está pendiente de rotar porque sus credenciales se expusieron en un chat.
- El `.env.example` apunta a SIU con `http://`: pedir HTTPS antes de usarlo.
