# Castro Fallas — rediseño basado en el PDF

## Qué incluye

La nueva versión reutiliza **imágenes extraídas del PDF “Copia de Rediseño Web”**, sin depender de URLs externas de imágenes. Mantiene el backend y el archivo Docker Compose originales.

### Direcciones

| Ruta | Vista | Funcionalidad |
| --- | --- | --- |
| `/` | Acceso provisional | Botón para pasar a Home, sin contraseñas ni autenticación |
| `/home` | Inicio | Hero, noticias, selector aéreo/terrestre/marítimo, estadísticas, globo 3D, experiencia, preguntas frecuentes |
| `/noticias` | Noticias | Noticias de ejemplo con imágenes y titulares demostrativos; no hay CMS ni publicación real |
| `/nosotros` | Sobre Nosotros | Años de experiencia (del mockup), información institucional de ejemplo, servicios complementarios, accesos |
| `/tracking` | Consulta tu embarque | Globo interactivo 3D. Sin conexión a seguimiento real |
| `/cotizaciones` | Cotizador existente | `POST /api/quotes` y `GET /api/quotes/{id}`, conservando el backend, PostgreSQL, Redis y MongoDB |

### Seguridad y funcionalidad

- El acceso inicial es **solo visual**, **no protege** `/home` ni `/cotizaciones` y no recoge credenciales. No debe presentarse como autenticación real.
- El cotizador **sí utiliza** la API original al disponer de un backend. Los datos no se envían por correo, se procesan con la API .NET y bases de datos de la demo.
- El globo presenta rutas ilustrativas: **no existe tracking** de números de embarque, BL, guía aérea ni estados reales.
- **Chatbot no implementado**, como se solicitó.
- Noticias, textos institucionales y cifras de la maqueta (`+25`, `+105`, `+48`, etc.) son **contenido provisional del diseño** a validar antes de publicar.
- `3d-world-map` puede estar sujeto a licencia comercial para uso productivo. Confirmar condiciones con el proveedor antes del despliegue público.
- El `docker-compose.yml` contiene credenciales de demostración y publica una API. Para producción se necesitan contraseñas seguras en secretos, HTTPS, autenticación/autorización y controles de acceso.

## Ejecución

En una instalación nueva, desde la raíz del proyecto:

```bash
docker compose up -d --build
```

**Si es una actualización:** revisá el `README.md` para conservar el nombre del proyecto Compose y los volúmenes ya existentes. Nunca uses `docker compose down -v` para actualizar, ya que elimina la información almacenada.

Abrí `http://localhost:8080`. El login de prueba muestra el botón **Entrar a la demostración**.

Para correr solo el frontend en VS Code:

```powershell
cd frontend
npm.cmd ci
npm.cmd run dev
```

Vite presentará una URL local. En ese modo el formulario necesita la API ejecutándose en Docker o un proxy configurado para `/api`; el resto del sitio funciona sin backend.

## Archivos relevantes

- `frontend/src/Root.vue`: asigna rutas a las vistas.
- `frontend/src/Home.vue`: inicio y secciones ordenadas según el mockup.
- `frontend/src/pages/`: login, noticias, nosotros y tracking.
- `frontend/src/components/WorldGlobe.vue`: motor 3D de `3d-world-map`.
- `frontend/src/App.vue`: cotizador original con campos y peticiones API intactas.
- `frontend/src/style.css`: diseño responsive.
- `frontend/public/images/`: fotografías y logotipo provenientes del PDF.

Para cambiar la portada del sitio y mostrar Home directamente, editá `Root.vue` para que la ruta `/` apunte a `<Home />` en vez de `<Login />`. No hace falta tocar el backend.
