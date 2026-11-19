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

## Problemas comunes

### "Port 5173 is already in use" o el backend dice que el puerto 3001 está en uso

El frontend corre siempre en `http://localhost:5173` (`strictPort` en `frontend/vite.config.js`), porque el
backend solo acepta CORS desde `FRONTEND_URL=http://localhost:5173`. Si el puerto está ocupado, Vite se detiene
con un error en lugar de pasar a 5174 o 5175, donde el login y el chat fallarían por CORS. Lo mismo para el
backend en el puerto 3001.

Casi siempre es un servidor viejo que quedó abierto en otra terminal. En Windows (PowerShell o CMD):

```bash
netstat -ano | findstr :5173
taskkill /PID <pid> /F
```

- La última columna de `netstat` es el PID; puede haber más de uno (IPv4 e IPv6).
- Para el backend usa `:3001` en lugar de `:5173`.
- Antes de cerrar un proceso, verifica que no sea uno que necesitas: `tasklist /FI "PID eq <pid>"`.

Si de verdad necesitas otro puerto, cambia `FRONTEND_URL` en `backend/.env` y el `port` de
`frontend/vite.config.js`, o `PORT` en `backend/.env` y `VITE_API_BASE_URL` en `frontend/.env`.
