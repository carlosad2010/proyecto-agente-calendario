import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { correrAgente, type MensajeAgente } from "@/lib/agent";

export async function POST(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.accessToken) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }

  try {
    const { mensajes } = (await request.json()) as { mensajes: MensajeAgente[] };

    if (!Array.isArray(mensajes) || mensajes.length === 0) {
      return NextResponse.json(
        { error: "mensajes debe ser un array no vacío" },
        { status: 400 }
      );
    }

    const resultado = await correrAgente(mensajes, session.accessToken);
    return NextResponse.json(resultado);
  } catch (error: any) {
    console.error("Error en /api/chat:", error);
    return NextResponse.json(
      { error: error.message ?? "Error desconocido" },
      { status: 500 }
    );
  }
}
