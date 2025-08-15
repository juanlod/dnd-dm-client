# 🧙 D&D DM Online

Este proyecto permite jugar a rol estilo Dungeons & Dragons de forma
online, con un **DM** (Dungeon Master) y jugadores conectados en tiempo
real.

Incluye: - 🎲 Chat con tiradas de dados - ✨ Efectos visuales de combate
(daño, curación, crítico...) - 📜 Fichas de personaje compartidas en
mesa

------------------------------------------------------------------------

## 🚀 Cómo jugar (jugadores)

1.  Abre la URL del frontend (en GitHub Pages):\
    👉 **https://juanlod.github.io/dnd-dm-client**
2.  Escribe tu **nombre** y el **ID de mesa** que te dé el DM.
3.  ¡Ya estás dentro!
    -   Usa el chat para hablar.\
    -   Para tirar dados escribe: `1d20+5`\
    -   Palabras clave disparan efectos:
        -   `daño 12`, `damage 12` → 💥 daño\
        -   `cura 10`, `heal 10` → ✨ curación\
        -   `crit`, `crítico` → ⚔️ crítico\
        -   `fallo`, `miss` → ❌ fallo\
4.  El DM puede mandar mensajes privados con `@dm ...`.

------------------------------------------------------------------------

## 📋 Fichas de personaje

-   Cada jugador puede crear/editar su ficha en la pestaña **Ficha de
    Personaje**.
-   La ficha incluye: nombre, clase, nivel, habilidades, inventario...
-   Botones principales:
    -   **Guardar local**: guarda en tu navegador.\
    -   **Compartir con mesa**: la ficha se envía a todos.

👉 Puedes **duplicar** tu ficha desde el botón `Copiar personaje` y
reiniciar experiencia a 0.

------------------------------------------------------------------------

## 🛠 Instalación (para quien hospeda la partida)

### 1. Backend (Render)

1.  Sube el proyecto a GitHub.
2.  En [Render](https://render.com) → **New Web Service**.
    -   Root: `/server`\
    -   Build Command: `npm ci && npm run build`\
    -   Start Command: `node dist/index.js`\
    -   Env vars:
        -   `NODE_ENV=production`\
        -   `CLIENT_ORIGINS=https://TU_USUARIO.github.io/TU_REPO`

Render te dará la URL de API, por ejemplo:\
`https://dnd-backend.onrender.com`

### 2. Frontend (GitHub Pages)

1.  Ajusta `client/src/environments/environment.prod.ts`:

``` ts
export const environment = {
  production: true,
  apiBase: 'https://dnd-backend.onrender.com',
  wsUrl: 'wss://dnd-backend.onrender.com'
};
```

2.  Haz build con:

``` bash
ng build --configuration production --base-href /TU_REPO/
```

3.  Sube la carpeta `dist/` a la rama `gh-pages` (o usa GitHub Actions).

La app quedará en:\
👉 `https://TU_USUARIO.github.io/TU_REPO/`

------------------------------------------------------------------------

## 💡 Tips rápidos

-   Refresca la página si no ves animaciones.
-   Si Render tarda en responder, es normal: los servicios free
    "duermen".
-   Si no conecta el chat → revisa la consola (CORS / URL incorrecta).
-   Si eres DM, comparte siempre el **ID de mesa** correcto.

¡Disfruta la aventura! 🐉⚔️
