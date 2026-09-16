# Agente de Calendario

Asistente conversacional (texto y voz) para gestionar Google Calendar mediante lenguaje natural. Corre sobre Next.js y usa la API de Anthropic (Claude) como motor del agente, con `tool use` para leer y modificar eventos reales del calendario del usuario.

Es una aplicación personal: cada usuario conecta su propia cuenta de Google y solo accede a su propio calendario.

## Características

- **Chat con IA** (`/chat`) que entiende peticiones en lenguaje natural: *"¿qué tengo esta semana?"*, *"agéndame algo con Juan el jueves a las 3pm"*, *"busca un hueco de una hora esta semana y agéndalo"*.
- **Entrada y salida por voz** usando la Web Speech API del navegador (sin costo ni dependencias adicionales).
- **Confirmación obligatoria antes de escribir**: las acciones de solo lectura (listar eventos, buscar huecos) se ejecutan directo; crear, mover o eliminar eventos siempre muestran una tarjeta de confirmación antes de tocar el calendario real.
- **Autenticación con Google OAuth** (NextAuth) con refresh automático de tokens.
- **Vista de agenda** (`/`) con los próximos 7 días, agrupados por día.
- **PWA instalable** (manifest + iconos) pensada para uso desde el celular.

## Stack técnico

| Capa | Tecnología |
|---|---|
| Framework | Next.js 16 (App Router) |
| UI | React 19, Tailwind CSS 4 |
| Autenticación | NextAuth 4 + Google Provider |
| Calendario | Google Calendar API (`googleapis`) |
| Agente / LLM | `@anthropic-ai/sdk` (Claude) |
| Voz | Web Speech API (nativa del navegador) |
| Lenguaje | TypeScript |

## Estructura del proyecto

```
app/
  page.tsx                       Vista de agenda (próximos 7 días)
  chat/page.tsx                  Chat con voz
  privacidad/page.tsx            Política de privacidad
  api/
    auth/[...nextauth]/route.ts  Login con Google
    chat/route.ts                Primer turno del chat (llama al agente)
    chat/confirm/route.ts        Ejecuta o cancela una acción de escritura
    events/route.ts              Lista eventos para la vista de agenda
    test-calendar/route.ts       Endpoint de prueba aislado (sin pasar por el modelo)
lib/
  agent.ts                       Loop del agente contra la API de Anthropic
  tools.ts                       Definición de las herramientas (tools) del modelo
  google-calendar.ts             Wrapper sobre la Google Calendar API
  auth.ts                        Configuración de NextAuth
types/
  next-auth.d.ts                 Extensión de tipos de sesión
```

## Cómo funciona el flujo de confirmación

1. El usuario le pide algo al agente (por texto o voz).
2. Si la petición implica **solo lectura** (consultar agenda, buscar huecos), el agente responde directo.
3. Si implica **escritura** (crear, mover o eliminar un evento), el agente se detiene y muestra una tarjeta con el resumen de la acción y los botones **Confirmar** / **Cancelar**. Nada se ejecuta hasta que el usuario decide.
4. Al confirmar, se llama a Google Calendar de verdad y el agente responde por texto y voz que quedó listo.
5. Al cancelar, el agente registra que no se ejecutó nada y responde en consecuencia.

## Requisitos previos

- Node.js 20 o superior.
- Una cuenta de Google (para el proyecto de OAuth y para probar la app).
- Una API key de [Anthropic](https://console.anthropic.com/) (Claude).

## Configuración

### 1. Clonar e instalar dependencias

```bash
git clone <url-del-repositorio>
cd proyecto-agente-calendario
npm install
```

### 2. Crear credenciales de Google OAuth

1. Entra a [Google Cloud Console](https://console.cloud.google.com/) y crea (o reutiliza) un proyecto.
2. Habilita la **Google Calendar API** en "APIs y servicios" → "Biblioteca".
3. Ve a "APIs y servicios" → "Pantalla de consentimiento OAuth" y configúrala en modo **Testing/Prueba**, agregando tu correo de Google como usuario de prueba (mientras la app no esté verificada, la sesión de Google dura 7 días y hay que reconectar después).
4. Ve a "Credenciales" → "Crear credenciales" → "ID de cliente de OAuth":
   - Tipo de aplicación: **Aplicación web**.
   - Orígenes autorizados de JavaScript: `http://localhost:3000`
   - URI de redirección autorizados: `http://localhost:3000/api/auth/callback/google`
5. Guarda el **Client ID** y el **Client Secret** que te entrega Google.

### 3. Obtener una API key de Anthropic

Ve a [console.anthropic.com](https://console.anthropic.com/) → **API Keys** → **Create Key**.

### 4. Variables de entorno

Crea un archivo `.env.local` en la raíz del proyecto con:

```bash
# Credenciales del cliente OAuth de Google (paso 2)
GOOGLE_CLIENT_ID=tu_client_id
GOOGLE_CLIENT_SECRET=tu_client_secret

# NextAuth
NEXTAUTH_SECRET=una_cadena_aleatoria_larga   # genera una con: openssl rand -base64 32
NEXTAUTH_URL=http://localhost:3000

# Anthropic (paso 3)
ANTHROPIC_API_KEY=tu_api_key_de_anthropic
```

### 5. Ejecutar en desarrollo

```bash
npm run dev
```

Abre [http://localhost:3000](http://localhost:3000) para la vista de agenda, o [http://localhost:3000/chat](http://localhost:3000/chat) para el chat con voz. Ambas requieren conectar tu cuenta de Google primero.

## Scripts disponibles

| Comando | Descripción |
|---|---|
| `npm run dev` | Levanta el servidor de desarrollo |
| `npm run build` | Compila la aplicación para producción |
| `npm start` | Sirve el build de producción |
| `npm run lint` | Corre ESLint |

## Notas sobre la voz

- El reconocimiento y la síntesis de voz usan la Web Speech API del navegador: no consumen la API key de Anthropic ni requieren instalar nada adicional.
- Funciona de forma confiable en **Chrome** (escritorio y Android). En Safari/iOS el soporte es parcial.
- El navegador pedirá permiso de micrófono la primera vez que se use el botón 🎤.
- El botón 🔊/🔇 permite silenciar la voz de salida.

## Notas de despliegue

- En producción, actualiza `NEXTAUTH_URL` y agrega el dominio real a los orígenes/URI de redirección autorizados en la configuración de OAuth de Google Cloud.
- Mientras el proyecto de Google esté en modo Testing, las sesiones expiran cada 7 días y hay que reconectar la cuenta manualmente.
- Verifica la zona horaria del servidor de despliegue: la lógica de horarios (`buscar_huecos`, creación/movimiento de eventos) asume horario de Bogotá (`America/Bogota`).

## Privacidad

La aplicación solo accede al calendario de la cuenta de Google que el propio usuario autoriza, y únicamente para leer, crear, mover o eliminar eventos a solicitud explícita del usuario. Ver el detalle en [`/privacidad`](app/privacidad/page.tsx).
