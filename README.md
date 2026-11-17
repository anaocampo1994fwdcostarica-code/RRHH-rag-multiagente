# RRHH RAG Multiagente

Base inicial para un portal de Recursos Humanos que integrará consultas sobre políticas y procesos asistidos por inteligencia artificial.

## Tecnologías actuales

- React con Vite y JavaScript (JSX).
- Tailwind CSS v4 mediante `@tailwindcss/vite`.
- ESLint para validación de código.
- Git para control de versiones.

Las integraciones de backend, Supabase, autenticación, Google Drive, RAG y agentes se incorporarán en fases posteriores.

## Estructura

```text
frontend/
├── public/             # Recursos públicos
├── src/
│   ├── assets/         # Recursos de la aplicación
│   ├── components/     # Componentes reutilizables
│   │   └── layout/     # Componentes de estructura visual
│   ├── pages/          # Vistas de la aplicación
│   ├── App.jsx         # Componente raíz
│   ├── index.css       # Estilos globales y entrada de Tailwind
│   └── main.jsx        # Punto de entrada de React
├── package.json
└── vite.config.js
```

## Comandos principales

Desde `frontend/`:

```bash
npm run dev
npm run lint
npm run build
```
