# GanaAds — App web de recompensas por ver anuncios

Los usuarios se registran, ven anuncios y ganan puntos. Al invitar amigos, ganan
un bono único cuando el invitado ve su primer anuncio (no en cascada, así evitas
que esto sea un esquema piramidal). Los retiros los apruebas tú manualmente
desde un panel de administrador antes de que se marquen como pagados.

## Estructura del proyecto

```
app/
├── backend/              → servidor Node.js + Express + PostgreSQL
│   ├── server.js         → arranque del servidor
│   ├── db.js             → conexión y tablas de la base de datos
│   ├── routes/           → auth, ads, user, withdrawals
│   ├── middleware/auth.js→ verificación de sesión (JWT)
│   ├── package.json
│   └── .env.example      → plantilla de variables de entorno
├── public/                → frontend (se sirve automáticamente desde el backend)
│   ├── index.html         → registro / login
│   ├── dashboard.html     → panel del usuario
│   ├── admin.html         → panel para aprobar retiros
│   ├── css/style.css
│   └── js/
├── render.yaml             → despliegue automático en Render (1 clic)
└── .gitignore
```

## 1. Cómo funciona el sistema de anuncios (importante)

- **Versión web:** usa la **Ad Placement API de Google** (`adBreak`), que es el
  producto oficial de Google/AdSense diseñado específicamente para dar una
  recompensa a cambio de ver un anuncio completo en la web. A diferencia de
  intentar "forzar" clics, esto sí cumple las políticas de AdSense.
- Necesitas una cuenta de **Google AdSense aprobada** y tu ID de publisher
  (`ca-pub-XXXXXXXXXXXXXXXX`). Mientras no la tengas, la app funciona en
  **modo de prueba** (simula el anuncio con una espera de 5 segundos) para que
  puedas probar todo el flujo sin esperar la aprobación de Google.
- **Versión Android (APK):** cuando empaquetes esta web como app (ver paso 5),
  ahí sí puedes cambiar la lógica de `js/dashboard.js` para usar el SDK nativo
  de **Unity Ads** con tu Game ID (`800359230`) y Placement (`Rewarded_Android`),
  ya que fuera del navegador sí tienes acceso a SDKs nativos.

## 2. Probar en tu computadora antes de subir nada

Necesitas [Node.js](https://nodejs.org) instalado.

```bash
cd backend
npm install
cp .env.example .env
```

Para probar localmente sin PostgreSQL en la nube, instala Postgres local o usa
un Postgres gratis de [Neon](https://neon.tech) o [Supabase](https://supabase.com)
y pega su cadena de conexión en `DATABASE_URL` dentro de `.env`.

```bash
npm start
```

Abre `http://localhost:3000` en tu navegador.

## 3. Subir el proyecto a GitHub

```bash
cd app
git init
git add .
git commit -m "Primera versión de GanaAds"
git branch -M main
git remote add origin https://github.com/TU_USUARIO/TU_REPOSITORIO.git
git push -u origin main
```

El archivo `.gitignore` ya excluye `.env` y `node_modules`, así que tus claves
secretas nunca se suben a GitHub.

## 4. Desplegar en Render (gratis)

**Opción rápida (recomendada):**
1. Entra a [render.com](https://render.com) y conecta tu cuenta de GitHub.
2. Clic en **New → Blueprint**, selecciona tu repositorio.
3. Render detecta el archivo `render.yaml` y crea automáticamente:
   - La base de datos PostgreSQL
   - El servicio web con todas las variables de entorno conectadas
4. Ve a la variable `ADSENSE_PUBLISHER_ID` en el panel de Render y ponla real
   cuando tengas tu cuenta de AdSense aprobada.
5. Espera el deploy (2-3 minutos) y tu app queda en una URL como
   `https://ganaads-web.onrender.com`.

**Opción manual** (si prefieres no usar el Blueprint):
1. New → PostgreSQL → créala y copia su "Internal Connection String".
2. New → Web Service → conecta tu repo → Root Directory: `backend` →
   Build Command: `npm install` → Start Command: `npm start`.
3. En Environment, agrega las variables de `.env.example` con tus valores
   reales (pega la connection string de Postgres en `DATABASE_URL`).

## 5. Hacerte administrador (para aprobar retiros)

Después de registrarte normalmente en la app, entra a la base de datos desde
el panel de Render (Shell o "Connect" → psql) y ejecuta:

```sql
UPDATE users SET is_admin = true WHERE email = 'tu-correo@ejemplo.com';
```

Luego entra a `https://tu-app.onrender.com/admin.html` para ver y aprobar
retiros pendientes.

## 6. Convertir la web en un APK de Android

La forma más simple es con **Capacitor**, que empaqueta tu web dentro de una
app Android real (con acceso a plugins nativos si más adelante quieres
integrar Unity Ads directamente):

```bash
npm install -g @capacitor/cli
mkdir ganaads-app && cd ganaads-app
npm init -y
npm install @capacitor/core @capacitor/android
npx cap init GanaAds com.tuempresa.ganaads
```

En `capacitor.config.json`, en vez de copiar archivos locales, apunta al
servidor ya desplegado en Render:

```json
{
  "appId": "com.tuempresa.ganaads",
  "appName": "GanaAds",
  "server": {
    "url": "https://tu-app.onrender.com",
    "cleartext": false
  }
}
```

Luego:

```bash
npx cap add android
npx cap sync
npx cap open android
```

Esto abre Android Studio, donde puedes generar el APK final
(Build → Build Bundle(s) / APK(s) → Build APK(s)).

## 7. Ajustar la economía de puntos

Todo se controla desde las variables de entorno en Render (sin tocar código):

- `POINTS_PER_AD`: puntos que gana el usuario por cada anuncio.
- `POINTS_REFERRAL_BONUS`: bono único cuando su referido ve su primer anuncio.
- `POINTS_PER_USDT`: cuántos puntos equivalen a 1 USDT.
- `MIN_WITHDRAWAL_USDT`: mínimo para poder pedir un retiro.

Ajusta `POINTS_PER_USDT` según lo que realmente te paguen los anuncios, para
asegurarte de que siempre te quede margen antes de pagar a los usuarios.

## Nota legal

Los pagos en USDT y los programas de referidos con dinero real pueden tener
implicaciones legales según tu país (impuestos, regulación de cripto,
prevención de lavado de dinero). Esto no es asesoría legal — conviene que lo
consultes con un abogado o contador local antes de operar con dinero real a
gran escala.
