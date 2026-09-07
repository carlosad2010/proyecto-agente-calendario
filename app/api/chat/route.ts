import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { correrAgente, type MensajeAgente, type AccionEscritura } from "@/lib/agent";
import { ejecutarHerramientaEscritura } from "@/lib/tools";

export async function POST(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.accessToken) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }

  const { mensajes, herramientas, confirmado } = (await request.json()) as {
    mensajes: MensajeAgente[];
    herramientas: AccionEscritura[];
    confirmado: boolean;
  };

  try {
    let resultadosConsolidados: any;

    if (confirmado) {
      // Ejecuta TODAS las herramientas y agrupa los resultados
      const resultados = await Promise.all(
        herramientas.map(async (accion) => {
          try {
            const contenido = await ejecutarHerramientaEscritura(
              accion.herramienta,
              accion.input,
              session.accessToken!
            );
            return {
              herramienta: accion.herramienta,
              exitosa: true,
              resultado: contenido,
            };
          } catch (error: any) {
            return {
              herramienta: accion.herramienta,
              exitosa: false,
              error: error.message,
            };
          }
        })
      );

      resultadosConsolidados = {
        acciones_ejecutadas: herramientas.length,
        resultados,
        confirmado: true,
      };
    } else {
      // El usuario canceló: reporta todas como canceladas
      resultadosConsolidados = {
        acciones_ejecutadas: 0,
        resultados: herramientas.map((accion) => ({
          herramienta: accion.herramienta,
          exitosa: false,
          cancelada: true,
        })),
        confirmado: false,
        motivo: "El usuario decidió no confirmar estas acciones.",
      };
    }

    // Construye un ÚNICO tool_result con todos los resultados consolidados
    const mensajesConResultados: MensajeAgente[] = [
      ...mensajes,
      {
        role: "user",
        content: [
          {
            type: "tool_result",
            tool_use_id: herramientas[0].toolUseId, // Usar el ID del primero como referencia
            content: JSON.stringify(resultadosConsolidados),
          },
        ],
      },
    ];

    // Continúa el loop del agente con los resultados consolidados
    const resultado = await correrAgente(mensajesConResultados, session.accessToken);
    return NextResponse.json(resultado);
  } catch (error: any) {
    console.error("Error en /api/chat/confirm:", error);
    return NextResponse.json(
      { error: error.message ?? "Error desconocido" },
      { status: 500 }
    );
  }
}
