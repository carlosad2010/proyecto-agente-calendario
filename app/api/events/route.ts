import { NextResponse } from "next/server";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/lib/auth";
import { listarEventos } from "@/lib/google-calendar";

export async function GET(request: Request) {
  const session = await getServerSession(authOptions);

  if (!session?.accessToken) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }

  if (session.error === "RefreshAccessTokenError") {
    return NextResponse.json(
      { error: "La sesión con Google expiró. Vuelve a conectar tu cuenta." },
      { status: 401 }
    );
  }

  const { searchParams } = new URL(request.url);
  const dias = Number(searchParams.get("dias") ?? 7);

  try {
    const eventos = await listarEventos(session.accessToken, {
      desde: new Date(),
      hasta: new Date(Date.now() + dias * 24 * 60 * 60 * 1000),
    });
    return NextResponse.json({ eventos });
  } catch (error) {
    console.error("Error consultando Google Calendar:", error);
    return NextResponse.json(
      { error: "No se pudo leer el calendario" },
      { status: 500 }
    );
  }
}
