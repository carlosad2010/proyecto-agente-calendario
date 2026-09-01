import type Anthropic from "@anthropic-ai/sdk";
import {
  listarEventos,
  buscarHuecos,
  crearEvento,
  moverEvento,
  eliminarEvento,
} from "@/lib/google-calendar";

/**
 * Herramientas de solo lectura: el agente las ejecuta directo,
 * sin pedirte confirmación, porque no modifican nada.
 */
export const HERRAMIENTAS_LECTURA = new Set([
  "listar_eventos",
  "buscar_huecos",
]);

/**
 * Herramientas que escriben en tu calendario real. El loop del agente
 * NUNCA las ejecuta directo: se detiene y le pide a la capa de arriba
 * (el chat) que te muestre una tarjeta de confirmación primero.
 */
export const HERRAMIENTAS_ESCRITURA = new Set([
  "crear_evento",
  "mover_evento",
  "eliminar_evento",
]);

export const TOOLS: Anthropic.Tool[] = [
  {
    name: "listar_eventos",
    description:
      "Lista los eventos del calendario en un rango de fechas. Úsala para responder qué tiene agendado el usuario.",
    input_schema: {
      type: "object",
      properties: {
        desde: {
          type: "string",
          description: "Fecha/hora ISO 8601 de inicio del rango. Si se omite, se usa el momento actual.",
        },
        hasta: {
          type: "string",
          description: "Fecha/hora ISO 8601 de fin del rango. Si se omite, se usan 7 días desde 'desde'.",
        },
      },
    },
  },
  {
    name: "buscar_huecos",
    description:
      "Encuentra espacios libres en el calendario dentro de una ventana de días, respetando horario laboral. Úsala cuando el usuario pida agendar algo pero no dé una hora exacta, o pregunte por disponibilidad.",
    input_schema: {
      type: "object",
      properties: {
        diasHaciaAdelante: {
          type: "number",
          description: "Cuántos días hacia adelante buscar. Por defecto 7.",
        },
        duracionMinutosMinima: {
          type: "number",
          description: "Duración mínima del hueco en minutos. Por defecto 30.",
        },
      },
    },
  },
  {
    name: "crear_evento",
    description:
      "Crea un evento nuevo en el calendario. Requiere confirmación del usuario antes de ejecutarse de verdad.",
    input_schema: {
      type: "object",
      properties: {
        titulo: { type: "string", description: "Título del evento." },
        inicio: {
          type: "string",
          description: "Fecha/hora ISO 8601 con offset de zona horaria de Bogotá, ej: 2026-09-05T15:00:00-05:00",
        },
        fin: {
          type: "string",
          description: "Fecha/hora ISO 8601 de fin, mismo formato que inicio.",
        },
        descripcion: { type: "string" },
        ubicacion: { type: "string" },
      },
      required: ["titulo", "inicio", "fin"],
    },
  },
  {
    name: "mover_evento",
    description:
      "Cambia la fecha/hora de un evento existente. Requiere confirmación del usuario antes de ejecutarse de verdad. Si no tienes el eventoId, primero usa listar_eventos para encontrarlo.",
    input_schema: {
      type: "object",
      properties: {
        eventoId: { type: "string" },
        nuevoInicio: { type: "string", description: "ISO 8601 con offset de Bogotá." },
        nuevoFin: { type: "string", description: "ISO 8601 con offset de Bogotá." },
      },
      required: ["eventoId", "nuevoInicio", "nuevoFin"],
    },
  },
  {
    name: "eliminar_evento",
    description:
      "Elimina un evento del calendario. Requiere confirmación del usuario antes de ejecutarse de verdad. Si no tienes el eventoId, primero usa listar_eventos para encontrarlo.",
    input_schema: {
      type: "object",
      properties: {
        eventoId: { type: "string" },
      },
      required: ["eventoId"],
    },
  },
];

/**
 * Ejecuta una herramienta de SOLO LECTURA y devuelve el resultado
 * como string (así lo espera el bloque tool_result de la API).
 * Nunca llames esto con una herramienta de escritura.
 */
export async function ejecutarHerramientaLectura(
  nombre: string,
  input: any,
  accessToken: string
): Promise<string> {
  switch (nombre) {
    case "listar_eventos": {
      const eventos = await listarEventos(accessToken, {
        desde: input.desde ? new Date(input.desde) : undefined,
        hasta: input.hasta ? new Date(input.hasta) : undefined,
      });
      return JSON.stringify(eventos);
    }
    case "buscar_huecos": {
      const huecos = await buscarHuecos(accessToken, {
        diasHaciaAdelante: input.diasHaciaAdelante,
        duracionMinutosMinima: input.duracionMinutosMinima,
      });
      return JSON.stringify(huecos);
    }
    default:
      throw new Error(`Herramienta de lectura desconocida: ${nombre}`);
  }
}

/**
 * Ejecuta una herramienta de ESCRITURA. Solo se debe llamar después
 * de que el usuario confirmó explícitamente en la UI.
 */
export async function ejecutarHerramientaEscritura(
  nombre: string,
  input: any,
  accessToken: string
): Promise<string> {
  switch (nombre) {
    case "crear_evento": {
      const evento = await crearEvento(accessToken, {
        titulo: input.titulo,
        inicio: input.inicio,
        fin: input.fin,
        descripcion: input.descripcion,
        ubicacion: input.ubicacion,
      });
      return JSON.stringify(evento);
    }
    case "mover_evento": {
      const evento = await moverEvento(accessToken, input.eventoId, {
        inicio: input.nuevoInicio,
        fin: input.nuevoFin,
      });
      return JSON.stringify(evento);
    }
    case "eliminar_evento": {
      await eliminarEvento(accessToken, input.eventoId);
      return JSON.stringify({ ok: true });
    }
    default:
      throw new Error(`Herramienta de escritura desconocida: ${nombre}`);
  }
}
