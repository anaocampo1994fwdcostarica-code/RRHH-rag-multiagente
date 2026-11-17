export const policyCategories = [
  'Todas',
  'Vacaciones',
  'Permisos',
  'Incapacidades',
  'Horarios',
  'Teletrabajo',
  'Beneficios',
  'Código de conducta',
]

export const policies = [
  { id: 'vacaciones-solicitud', title: 'Solicitud de vacaciones', category: 'Vacaciones', description: 'Guía ilustrativa para planificar y registrar una solicitud de vacaciones.', updatedAt: '15 de enero de 2026', content: ['Esta es una política de demostración para la interfaz.', 'En una versión futura, el contenido se obtendrá de fuentes documentales autorizadas.', 'Las solicitudes deberán revisarse de acuerdo con el proceso interno vigente.'] },
  { id: 'vacaciones-saldo', title: 'Consulta de saldo de vacaciones', category: 'Vacaciones', description: 'Referencia de muestra sobre la consulta del saldo disponible.', updatedAt: '10 de enero de 2026', content: ['El saldo mostrado en este ejemplo no corresponde a una persona real.', 'La integración con los sistemas de gestión se implementará en una fase posterior.'] },
  { id: 'permisos-personales', title: 'Permisos personales', category: 'Permisos', description: 'Orientación demostrativa sobre solicitudes de permisos personales.', updatedAt: '8 de enero de 2026', content: ['Este documento ilustra la estructura de una política de permisos.', 'La aprobación y los criterios reales deberán definirse con Recursos Humanos.'] },
  { id: 'permisos-estudio', title: 'Permisos de estudio', category: 'Permisos', description: 'Resumen de ejemplo para permisos vinculados con actividades académicas.', updatedAt: '4 de enero de 2026', content: ['El texto no constituye una norma oficial ni un beneficio vigente.', 'Las condiciones reales deben publicarse desde una fuente institucional validada.'] },
  { id: 'incapacidades-reporte', title: 'Reporte de incapacidades', category: 'Incapacidades', description: 'Flujo ilustrativo para comunicar una incapacidad.', updatedAt: '22 de diciembre de 2025', content: ['Los datos médicos y personales requieren tratamiento confidencial.', 'Este contenido es una muestra de interfaz y no recopila información.'] },
  { id: 'horarios-flexibles', title: 'Horarios flexibles', category: 'Horarios', description: 'Descripción ficticia de modalidades de horario flexible.', updatedAt: '18 de diciembre de 2025', content: ['La disponibilidad de horarios depende de las necesidades de cada organización.', 'La versión definitiva deberá contar con validación administrativa.'] },
  { id: 'registro-jornada', title: 'Registro de jornada', category: 'Horarios', description: 'Material de muestra sobre el registro de horas de trabajo.', updatedAt: '12 de diciembre de 2025', content: ['Este ejemplo no está conectado a un sistema de asistencia.', 'La política real podrá incluir procedimientos, plazos y responsables.'] },
  { id: 'teletrabajo-modalidad', title: 'Modalidad de teletrabajo', category: 'Teletrabajo', description: 'Consulta demostrativa para condiciones de trabajo remoto.', updatedAt: '5 de diciembre de 2025', content: ['La modalidad de teletrabajo debe formalizarse conforme a las reglas de la organización.', 'Este catálogo no representa condiciones laborales reales.'] },
  { id: 'beneficios-bienestar', title: 'Programa de bienestar', category: 'Beneficios', description: 'Información de ejemplo sobre iniciativas de bienestar.', updatedAt: '28 de noviembre de 2025', content: ['Los beneficios descritos en una futura versión deberán provenir de documentos aprobados.', 'Este registro se usa solo para demostrar navegación y búsqueda.'] },
  { id: 'conducta-respetuosa', title: 'Convivencia y conducta respetuosa', category: 'Código de conducta', description: 'Contenido ilustrativo para un entorno laboral respetuoso.', updatedAt: '20 de noviembre de 2025', content: ['La organización definirá y aprobará su código de conducta oficial.', 'Este contenido no sustituye políticas, procedimientos ni asesoría institucional.'] },
]

export function getPolicyById(id) {
  return policies.find((policy) => policy.id === id)
}
