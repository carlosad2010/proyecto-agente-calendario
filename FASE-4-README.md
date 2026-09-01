# Fase 4 — El agente real: chat con voz + confirmación antes de escribir

## Qué se agrega

```
lib/tools.ts                    → nuevo: definición de las 5 herramientas para el modelo
lib/agent.ts                    → nuevo: el loop que llama a la API de Anthropic
app/api/chat/route.ts           → nuevo: primer turno del chat
app/api/chat/confirm/route.ts   → nuevo: ejecuta o cancela una acción tras tu confirmación
app/chat/page.tsx               → nuevo: la pantalla de chat con voz
```

No borres `app/api/test-calendar/route.ts` todavía — te sigue sirviendo si algo
falla y quieres probar una función aislada sin pasar por el modelo.

## Instalar la dependencia que falta

```bash
npm i @anthropic-ai/sdk
```

## Agregar tu API key

En tu `.env.local`, agrega una línea nueva (las otras 4 se quedan igual):

```
ANTHROPIC_API_KEY=tu_key_de_console.anthropic.com
```

La sacas de https://console.anthropic.com → API Keys → Create Key.

## Cómo funciona el flujo de confirmación (para que sepas qué esperar)

1. Le pides algo al agente ("agéndame algo con Juan el jueves a las 3pm").
2. Si es una **lectura** (consultar agenda, buscar huecos), responde directo.
3. Si implica **escribir** (crear/mover/eliminar), el agente se detiene y te
   muestra una tarjeta amarilla con el resumen de la acción y dos botones:
   **Confirmar** / **Cancelar**. Nada se ejecuta hasta que aprietes uno.
4. Si confirmas, ahí sí se llama a Google Calendar de verdad, y el agente te
   responde (por texto y voz) que quedó listo.
5. Si cancelas, el agente se entera de que no se hizo y responde acorde —
   no se queda "pensando" que sí pasó.

## Sobre la voz

Usa la **Web Speech API** del navegador — no instala nada nuevo, no usa tu
API key de Anthropic para esto (es gratis y nativo del navegador). Dos
limitaciones que debes saber de entrada:

- **Solo funciona bien en Chrome** (de escritorio y de Android). En iPhone,
  Safari tiene soporte parcial y puede no funcionar igual.
- **Necesita permiso de micrófono.** La primera vez que aprietes el botón
  🎤, Chrome te va a pedir autorización — acéptala.
- El botón 🔊/🔇 arriba a la derecha apaga la voz de salida si prefieres
  leer en silencio (por ejemplo, si estás en público).

## Probar

```bash
npm run dev
```

Abre `http://localhost:3000/chat` (nota: es una ruta nueva, distinta a la
página principal). Prueba en este orden:

**1. Una lectura simple** — escribe o di:
> "¿Qué tengo esta semana?"

Debe responder directo, sin tarjeta de confirmación.

**2. Una escritura** — escribe o di:
> "Agéndame una llamada de prueba mañana a las 4pm"

Debe aparecer la tarjeta amarilla. Dale **Cancelar** primero, y confirma que
el agente reconoce que no se creó nada. Luego repite el mensaje y esta vez
dale **Confirmar** — ve a calendar.google.com y revisa que sí se creó.
Bórralo a mano desde ahí para no dejar basura.

**3. Un huecos + creación combinada**:
> "Busca un espacio de una hora esta semana para hacer ejercicio y agéndalo"

Aquí es donde se ve el valor real: el agente debe usar `buscar_huecos`
primero (sin pedirte nada, es lectura), proponerte opciones, y solo pedir
confirmación cuando ya sepa la hora exacta.

## Qué revisar si algo falla

- **La tarjeta de confirmación no aparece nunca / crea directo**: revisa que
  `lib/agent.ts` esté deteniendo el loop cuando detecta una herramienta que
  no está en `HERRAMIENTAS_LECTURA`.
- **Error 401 al enviar un mensaje**: la sesión de Google expiró (recuerda,
  en modo Testing dura 7 días) — reconecta desde la página principal.
- **El micrófono no hace nada**: abre la consola del navegador (F12) y
  revisa si hay un error de permisos; también confirma que estás en Chrome.
- **Las horas que crea no cuadran**: revisa que el `system` prompt en
  `lib/agent.ts` esté generando bien la fecha/hora actual de Bogotá — si el
  servidor está en otra zona horaria vas a ver el mismo problema que
  anotamos para `buscarHuecos` en la fase 3.

## Lo que sigue (fase 5)

Convertir esto en una PWA instalable en tu celular (`manifest.json` +
`next-pwa`), y luego el despliegue a Vercel — ahí sí resolvemos de una vez
el tema de zona horaria del servidor y el modo Testing de Google.
