export const metadata = {
  title: "Política de Privacidad — Agente de calendario",
};

export default function PoliticaPrivacidad() {
  return (
    <main className="mx-auto max-w-2xl p-6 text-slate-800">
      <h1 className="mb-4 text-2xl font-semibold">Política de Privacidad</h1>
      <p className="mb-4 text-sm text-slate-500">Última actualización: 2026</p>

      <div className="space-y-4 text-sm leading-relaxed">
        <p>
          Agente de calendario es una aplicación personal desarrollada por
          Carlos Zapata para uso propio de gestión de su calendario de Google
          Calendar mediante inteligencia artificial.
        </p>

        <h2 className="pt-2 font-semibold text-slate-900">
          Qué datos se acceden
        </h2>
        <p>
          La aplicación accede únicamente a los eventos del Google Calendar
          de la cuenta que autoriza el acceso, con el fin de leer, crear,
          mover y eliminar eventos a solicitud explícita del usuario.
        </p>

        <h2 className="pt-2 font-semibold text-slate-900">
          Cómo se usan los datos
        </h2>
        <p>
          Los datos del calendario se envían de forma temporal a la API de
          Anthropic (Claude) únicamente para interpretar solicitudes en
          lenguaje natural y decidir qué acción de calendario ejecutar. No se
          almacenan datos del calendario en ninguna base de datos permanente
          de la aplicación.
        </p>

        <h2 className="pt-2 font-semibold text-slate-900">
          Con quién se comparten los datos
        </h2>
        <p>
          Los datos no se venden ni se comparten con terceros distintos a
          Google (proveedor del calendario) y Anthropic (proveedor del
          modelo de IA que interpreta las solicitudes), ambos utilizados
          exclusivamente para el funcionamiento de la aplicación.
        </p>

        <h2 className="pt-2 font-semibold text-slate-900">
          Revocar el acceso
        </h2>
        <p>
          El usuario puede revocar el acceso de esta aplicación a su cuenta
          de Google en cualquier momento desde{" "}
          <a
            href="https://myaccount.google.com/permissions"
            className="text-blue-600 underline"
          >
            myaccount.google.com/permissions
          </a>
          .
        </p>

        <h2 className="pt-2 font-semibold text-slate-900">Contacto</h2>
        <p>Para cualquier pregunta sobre esta política: carlosad@gmail.com</p>
      </div>
    </main>
  );
}