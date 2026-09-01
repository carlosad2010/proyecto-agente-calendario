import { google } from "googleapis";

export const TIME_ZONE = "America/Bogota";

export type EventoNormalizado = {
  id: string;
  titulo: string;
  inicio: string; // ISO 8601
  fin: string;
  todoElDia: boolean;
  ubicacion?: string;
  descripcion?: string;
  invitados: string[];
  enlaceMeet?: string;
};

export type Hueco = {
  inicio: string; // ISO 8601
  fin: string;
  duracionMinutos: number;
};

function getCalendar(accessToken: string) {
  const auth = new google.auth.OAuth2();
  auth.setCredentials({ access_token: accessToken });
  return google.calendar({ version: "v3", auth });
}

function normalizarEvento(e: any): EventoNormalizado {
  return {
    id: e.id!,
    titulo: e.summary ?? "(sin título)",
    inicio: e.start?.dateTime ?? e.start?.date ?? "",
    fin: e.end?.dateTime ?? e.end?.date ?? "",
    todoElDia: Boolean(e.start?.date),
    ubicacion: e.location ?? undefined,
    descripcion: e.description ?? undefined,
    invitados: (e.attendees ?? []).map((a: any) => a.email!).filter(Boolean),
    enlaceMeet: e.hangoutLink ?? undefined,
  };
}

/**
 * Lista eventos en un rango. Es la base de todo lo demás: buscarHuecos
 * la reutiliza para saber qué está ocupado.
 */
export async function listarEventos(
  accessToken: string,
  opciones: { desde?: Date; hasta?: Date; maximo?: number } = {}
): Promise<EventoNormalizado[]> {
  const calendar = getCalendar(accessToken);
  const desde = opciones.desde ?? new Date();
  const hasta =
    opciones.hasta ?? new Date(desde.getTime() + 7 * 24 * 60 * 60 * 1000);

  const { data } = await calendar.events.list({
    calendarId: "primary",
    timeMin: desde.toISOString(),
    timeMax: hasta.toISOString(),
    timeZone: TIME_ZONE,
    singleEvents: true,
    orderBy: "startTime",
    maxResults: opciones.maximo ?? 25,
  });

  return (data.items ?? [])
    .filter((e) => e.status !== "cancelled")
    .map(normalizarEvento);
}

/**
 * Busca huecos libres dentro de una ventana de días, respetando un
 * horario "laboral" (por defecto 7am-9pm, porque Carlos da clases
 * en la tarde/noche) y una duración mínima deseada.
 *
 * Estrategia: trae los eventos ocupados del rango, arma la lista de
 * intervalos libres restando esos eventos de la ventana laboral de
 * cada día. Todo en memoria — no hay endpoint de Google que haga esto
 * directamente para un solo calendario de forma simple.
 */
export async function buscarHuecos(
  accessToken: string,
  opciones: {
    desde?: Date;
    diasHaciaAdelante?: number;
    duracionMinutosMinima?: number;
    horaInicioLaboral?: number; // 0-23
    horaFinLaboral?: number; // 0-23
  } = {}
): Promise<Hueco[]> {
  const desde = opciones.desde ?? new Date();
  const dias = opciones.diasHaciaAdelante ?? 7;
  const duracionMin = opciones.duracionMinutosMinima ?? 30;
  const horaInicio = opciones.horaInicioLaboral ?? 7;
  const horaFin = opciones.horaFinLaboral ?? 21;

  const hasta = new Date(desde.getTime() + dias * 24 * 60 * 60 * 1000);
  const ocupados = await listarEventos(accessToken, {
    desde,
    hasta,
    maximo: 250,
  });

  // Solo nos importan los eventos con hora (los de "todo el día" no
  // bloquean horas específicas para este propósito).
  const bloques = ocupados
    .filter((e) => !e.todoElDia)
    .map((e) => ({ inicio: new Date(e.inicio), fin: new Date(e.fin) }))
    .sort((a, b) => a.inicio.getTime() - b.inicio.getTime());

  const huecos: Hueco[] = [];

  for (let offset = 0; offset < dias; offset++) {
    const dia = new Date(desde);
    dia.setDate(dia.getDate() + offset);

    const ventanaInicio = new Date(dia);
    ventanaInicio.setHours(horaInicio, 0, 0, 0);
    const ventanaFin = new Date(dia);
    ventanaFin.setHours(horaFin, 0, 0, 0);

    // Si estamos evaluando "hoy", el hueco no puede empezar en el pasado.
    const inicioEfectivo =
      ventanaInicio < desde && offset === 0 ? desde : ventanaInicio;

    const bloquesDelDia = bloques.filter(
      (b) => b.inicio < ventanaFin && b.fin > inicioEfectivo
    );

    let cursor = inicioEfectivo;
    for (const bloque of bloquesDelDia) {
      if (bloque.inicio > cursor) {
        const minutos = (bloque.inicio.getTime() - cursor.getTime()) / 60000;
        if (minutos >= duracionMin) {
          huecos.push({
            inicio: cursor.toISOString(),
            fin: bloque.inicio.toISOString(),
            duracionMinutos: Math.round(minutos),
          });
        }
      }
      if (bloque.fin > cursor) cursor = bloque.fin;
    }

    if (cursor < ventanaFin) {
      const minutos = (ventanaFin.getTime() - cursor.getTime()) / 60000;
      if (minutos >= duracionMin) {
        huecos.push({
          inicio: cursor.toISOString(),
          fin: ventanaFin.toISOString(),
          duracionMinutos: Math.round(minutos),
        });
      }
    }
  }

  return huecos;
}

/**
 * Crea un evento nuevo. inicio/fin en ISO 8601 con offset
 * (ej: "2026-08-20T15:00:00-05:00") para que no haya ambigüedad de
 * zona horaria entre lo que decide el modelo y lo que recibe Google.
 */
export async function crearEvento(
  accessToken: string,
  datos: {
    titulo: string;
    inicio: string;
    fin: string;
    descripcion?: string;
    ubicacion?: string;
    invitados?: string[];
  }
): Promise<EventoNormalizado> {
  const calendar = getCalendar(accessToken);

  const { data } = await calendar.events.insert({
    calendarId: "primary",
    requestBody: {
      summary: datos.titulo,
      description: datos.descripcion,
      location: datos.ubicacion,
      start: { dateTime: datos.inicio, timeZone: TIME_ZONE },
      end: { dateTime: datos.fin, timeZone: TIME_ZONE },
      attendees: datos.invitados?.map((email) => ({ email })),
    },
  });

  return normalizarEvento(data);
}

/**
 * Mueve un evento existente a un nuevo horario. Usa patch (no update)
 * para no tener que reenviar todos los campos que no cambian.
 */
export async function moverEvento(
  accessToken: string,
  eventoId: string,
  nuevoHorario: { inicio: string; fin: string }
): Promise<EventoNormalizado> {
  const calendar = getCalendar(accessToken);

  const { data } = await calendar.events.patch({
    calendarId: "primary",
    eventId: eventoId,
    requestBody: {
      start: { dateTime: nuevoHorario.inicio, timeZone: TIME_ZONE },
      end: { dateTime: nuevoHorario.fin, timeZone: TIME_ZONE },
    },
  });

  return normalizarEvento(data);
}

/**
 * Elimina un evento. No hay confirmación aquí adentro a propósito:
 * la confirmación con el usuario debe pasar ANTES de llamar esta
 * función (en la capa de tool use / UI), no dentro de ella.
 */
export async function eliminarEvento(
  accessToken: string,
  eventoId: string
): Promise<void> {
  const calendar = getCalendar(accessToken);
  await calendar.events.delete({
    calendarId: "primary",
    eventId: eventoId,
  });
}
