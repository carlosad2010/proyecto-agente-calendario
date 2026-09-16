import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { correrAgente, type MensajeAgente } from "@/lib/agent";
import { ejecutarHerramientaEscritura } from "@/lib/tools";

export async function POST(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.accessToken) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }

  const { mensajes, toolUseId, herramienta, input, confirmado } =
    (await request.json()) as {
      mensajes: MensajeAgente[]; // el array que devolvió /api/chat, YA incluye el tool_use pendiente
      toolUseId: string;
      herramienta: string;
      input: any;
      confirmado: boolean;
    };

  try {
    let contenidoResultado: string;

    if (confirmado) {
      contenidoResultado = await ejecutarHerramientaEscritura(
        herramienta,
        input,
        session.accessToken
      );
    } else {
      // El usuario canceló: le contamos al modelo para que no asuma
      // que la acción se hizo.
      contenidoResultado = JSON.stringify({
        cancelado: true,
        motivo: "El usuario decidió no confirmar esta acción.",
      });
    }

    const mensajesConResultado: MensajeAgente[] = [
      ...mensajes,
      {
        role: "user",
        content: [
          {
            type: "tool_result",
            tool_use_id: toolUseId,
            content: contenidoResultado,
          },
        ],
      },
    ];

    const resultado = await correrAgente(mensajesConResultado, session.accessToken);
    return NextResponse.json(resultado);
  } catch (error: any) {
    console.error("Error en /api/chat/confirm:", error);
    return NextResponse.json(
      { error: error.message ?? "Error desconocido" },
      { status: 500 }
    );
  }
}
