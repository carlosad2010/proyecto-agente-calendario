import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import {
  buscarHuecos,
  crearEvento,
  moverEvento,
  eliminarEvento,
} from "@/lib/google-calendar";

/**
 * Endpoint SOLO para pruebas manuales de la fase 3.
 * Bórralo (o protégelo mejor) antes de pasar a producción real:
 * tal cual está, cualquiera con la sesión activa en el navegador
 * puede crear/mover/borrar eventos llamando esta ruta.
 *
 * Uso desde la barra de direcciones o con fetch en la consola del navegador:
 *
 *   /api/test-calendar?accion=huecos
 *   /api/test-calendar?accion=crear
 *   /api/test-calendar?accion=mover&eventoId=XXXX
 *   /api/test-calendar?accion=eliminar&eventoId=XXXX
 */
export async function GET(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.accessToken) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const accion = searchParams.get("accion");

  try {
    switch (accion) {
      case "huecos": {
        const huecos = await buscarHuecos(session.accessToken, {
          diasHaciaAdelante: 5,
          duracionMinutosMinima: 30,
        });
        return NextResponse.json({ huecos });
      }

      case "crear": {
        // Evento de prueba, mañana a las 10am por 30 minutos.
        const manana = new Date();
        manana.setDate(manana.getDate() + 1);
        manana.setHours(10, 0, 0, 0);
        const fin = new Date(manana.getTime() + 30 * 60000);

        const evento = await crearEvento(session.accessToken, {
          titulo: "Prueba del agente (bórrame)",
          inicio: manana.toISOString(),
          fin: fin.toISOString(),
          descripcion: "Evento de prueba creado desde /api/test-calendar",
        });
        return NextResponse.json({ evento });
      }

      case "mover": {
        const eventoId = searchParams.get("eventoId");
        if (!eventoId) {
          return NextResponse.json(
            { error: "Falta ?eventoId=... (usa el id que te devolvió 'crear')" },
            { status: 400 }
          );
        }
        const nuevoInicio = new Date();
        nuevoInicio.setDate(nuevoInicio.getDate() + 1);
        nuevoInicio.setHours(15, 0, 0, 0);
        const nuevoFin = new Date(nuevoInicio.getTime() + 30 * 60000);

        const evento = await moverEvento(session.accessToken, eventoId, {
          inicio: nuevoInicio.toISOString(),
          fin: nuevoFin.toISOString(),
        });
        return NextResponse.json({ evento });
      }

      case "eliminar": {
        const eventoId = searchParams.get("eventoId");
        if (!eventoId) {
          return NextResponse.json(
            { error: "Falta ?eventoId=..." },
            { status: 400 }
          );
        }
        await eliminarEvento(session.accessToken, eventoId);
        return NextResponse.json({ ok: true });
      }

      default:
        return NextResponse.json({
          error: "Usa ?accion=huecos | crear | mover | eliminar",
        });
    }
  } catch (error: any) {
    console.error("Error en test-calendar:", error);
    return NextResponse.json(
      { error: error.message ?? "Error desconocido" },
      { status: 500 }
    );
  }
}
