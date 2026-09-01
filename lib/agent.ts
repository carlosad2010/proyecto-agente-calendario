import Anthropic from "@anthropic-ai/sdk";
import {
  TOOLS,
  HERRAMIENTAS_LECTURA,
  ejecutarHerramientaLectura,
} from "@/lib/tools";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const MODELO = "claude-sonnet-5";

export type MensajeAgente = Anthropic.MessageParam;

export type ResultadoAgente =
  | { tipo: "final"; texto: string; mensajes: MensajeAgente[] }
  | {
      tipo: "confirmacion_requerida";
      texto: string; // lo que el modelo dijo antes de pedir la acción, si algo
      herramienta: string;
      input: any;
      toolUseId: string;
      mensajes: MensajeAgente[]; // incluye ya el mensaje del assistant con el tool_use
    };

function systemPrompt(): string {
  const ahora = new Date().toLocaleString("es-CO", {
    timeZone: "America/Bogota",
    dateStyle: "full",
    timeStyle: "short",
  });

  return `Eres el agente de calendario personal de Carlos. Hablas español, de forma breve y directa, como para leerse en voz alta.

Fecha y hora actual en Bogotá: ${ahora}. Todas las fechas que generes para crear_evento o mover_evento deben ir en ISO 8601 con offset -05:00 (hora de Bogotá).

Reglas:
- Si el usuario no da una hora exacta para agendar algo, usa buscar_huecos primero y propónle 2-3 opciones antes de crear nada.
- Para mover_evento o eliminar_evento, si no sabes el eventoId, usa listar_eventos primero para encontrarlo por título/fecha.
- Nunca inventes un eventoId.
- Sé conciso: esto se lee o se escucha en el celular, no escribas párrafos largos.
- NUNCA uses markdown: nada de asteriscos, guiones de lista, numerales (#) ni comillas dobles decorativas. Tu respuesta se convierte directo a voz y se lee tal cual, así que escribe en texto plano, como si estuvieras hablando por teléfono. En vez de "**Iglesia**" escribe simplemente "Iglesia".`;
}

/**
 * Corre el loop de tool use. Ejecuta automáticamente las herramientas
 * de solo lectura y sigue llamando al modelo hasta que:
 *   a) el modelo termina con texto final (tipo: "final"), o
 *   b) el modelo pide una herramienta de escritura (tipo: "confirmacion_requerida"),
 *      momento en el que el loop se DETIENE sin ejecutar nada.
 */
export async function correrAgente(
  mensajes: MensajeAgente[],
  accessToken: string
): Promise<ResultadoAgente> {
  let historial = [...mensajes];

  // Límite de seguridad: evita loops infinitos si algo sale mal.
  for (let vuelta = 0; vuelta < 8; vuelta++) {
    const respuesta = await anthropic.messages.create({
      model: MODELO,
      max_tokens: 1024,
      system: systemPrompt(),
      tools: TOOLS,
      messages: historial,
    });

    const bloquesToolUse = respuesta.content.filter(
      (b): b is Anthropic.ToolUseBlock => b.type === "tool_use"
    );

    // Sin llamadas a herramientas: es la respuesta final.
    if (bloquesToolUse.length === 0) {
      const texto = respuesta.content
        .filter((b): b is Anthropic.TextBlock => b.type === "text")
        .map((b) => b.text)
        .join("\n");
      return {
        tipo: "final",
        texto,
        mensajes: [...historial, { role: "assistant", content: respuesta.content }],
      };
    }

    // Si CUALQUIERA de las herramientas pedidas es de escritura, paramos
    // ahí mismo. En la práctica el system prompt empuja a pedir una cosa
    // a la vez, así que normalmente es solo una.
    const bloqueEscritura = bloquesToolUse.find(
      (b) => !HERRAMIENTAS_LECTURA.has(b.name)
    );

    const textoPrevio = respuesta.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("\n");

    const mensajesConAssistant: MensajeAgente[] = [
      ...historial,
      { role: "assistant", content: respuesta.content },
    ];

    if (bloqueEscritura) {
      return {
        tipo: "confirmacion_requerida",
        texto: textoPrevio,
        herramienta: bloqueEscritura.name,
        input: bloqueEscritura.input,
        toolUseId: bloqueEscritura.id,
        mensajes: mensajesConAssistant,
      };
    }

    // Todas son de lectura: las ejecutamos todas y seguimos el loop.
    const resultados = await Promise.all(
      bloquesToolUse.map(async (bloque) => {
        try {
          const resultado = await ejecutarHerramientaLectura(
            bloque.name,
            bloque.input,
            accessToken
          );
          return {
            type: "tool_result" as const,
            tool_use_id: bloque.id,
            content: resultado,
          };
        } catch (error: any) {
          return {
            type: "tool_result" as const,
            tool_use_id: bloque.id,
            content: `Error: ${error.message}`,
            is_error: true,
          };
        }
      })
    );

    historial = [...mensajesConAssistant, { role: "user", content: resultados }];
  }

  return {
    tipo: "final",
    texto: "No pude completar la solicitud después de varios intentos. ¿Puedes reformularla?",
    mensajes: historial,
  };
}
