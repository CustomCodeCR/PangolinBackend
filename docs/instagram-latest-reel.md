# Reel de Instagram en Home

La sección de Instagram aparece **antes de las cinco tarjetas de contacto**, en formato vertical 9:16. La publicación elegida en el administrador tiene prioridad y **no requiere ninguna conexión con Meta**.

## Método recomendado: seleccionar un Reel manualmente

1. Desde Instagram, copiá el enlace del Reel **público** de `@grupocastrofallas1`, en formato `https://www.instagram.com/reel/ABC123.../`. Podés pegarlo con parámetros `?igsh=...`; el servidor los elimina.
2. Entrá con un administrador real a **Administración → Contenido → Editor visual**.
3. Arriba del editor, buscá el campo **«Reel de Instagram del Home»**, pegá el enlace y pulsá **«Guardar y mostrar Reel»**.
4. Para reproducir **sin la interfaz de Instagram**, seleccioná o subí el MP4/WebM original de la empresa (máximo **20 MB**, requiere MinIO) antes de pulsar Guardar. Se reproducirá con el reproductor nativo a ancho y alto completos del cuadro, manteniendo el enlace al Reel original.
5. Si no tenés el archivo original, podés guardar únicamente el enlace; se utilizará el reproductor incrustado de Instagram, cuya interfaz no se puede ocultar desde nuestra web.
6. Para cambiarlo, pegá otro enlace (y, si corresponde, elegí otro video) y guardá. Para quitar el elegido, pulsá **«Quitar Reel»**.

### Alcance de seguridad y persistencia

- La escritura es `PUT /api/admin/content/instagram-reel` y está protegida por la política `admin` (JWT vigente). No se expone a usuarios anónimos ni a cuentas en modo previsualización.
- Solo se admiten enlaces HTTPS a `instagram.com/reel/{código}`, con validación en cliente y backend. Se eliminan fragmentos y parámetros antes de almacenar; no se admiten otros dominios ni enlaces acortados.
- El archivo de video opcional se sube mediante el mecanismo existente de medios de MinIO/S3 con límite de 20 MB, validación de formato y autenticación de administrador. Solo se puede asignar un video almacenado en la biblioteca. La URL pública solo se sirve cuando el video está publicado en el slot CMS del Reel. No se descarga ni extrae contenido de Instagram.
- El valor se almacena en la tabla existente `SiteCmsSlots` (`home.instagram.reel`), **sin migraciones de base de datos ni cambios en MinIO**. Guardar publica en un solo paso y envía un aviso `site` a las pestañas conectadas.
- `GET /api/social/instagram/latest-reel` sirve el elegido, sin caché del navegador en modo manual. Si no hay elegido, conserva la opción anterior de obtener el último Reel mediante un token de Meta, si estuviera configurado.
- Si solo se pega un enlace, el contenido sigue alojado en Instagram. **Solo los Reels públicos que permitan inserción podrán reproducirse dentro del Home**; los demás pueden abrirse desde el enlace directo. Para un reproductor a pantalla completa sin la interfaz de Instagram se necesita una copia autorizada del archivo original en MinIO.
- El reproductor oficial se carga bajo demanda al pulsar «Reproducir». No se realizan solicitudes de video a Instagram mientras el visitante no lo haya solicitado.
- Al quitar el enlace manual, si tampoco hay integración automática configurada, el Home vuelve a mostrar el acceso al perfil.

## Alternativa opcional: actualización automática

La integración de Meta es opcional y se puede configurar más adelante. La sección manual funciona sin token de Instagram.

## Conectar la cuenta @grupocastrofallas1

1. Comprobar que la cuenta de Instagram es **Profesional** (empresa o creador) y que tienes acceso administrativo.
2. Desde [Meta for Developers](https://developers.facebook.com/apps/), crear o configurar una app con **Instagram API with Instagram Login**. Este flujo no necesita vincular una página de Facebook.
3. Autorizar la cuenta de la empresa con **instagram_business_basic** (solo lectura) y obtener un token de acceso de larga duración. Comprobar que el token devuelve el nombre de usuario `grupocastrofallas1`.
4. Guardar ese token **solo en el entorno privado** del backend, no en un archivo versionado, ni como `VITE_...`:
   - Docker local (`compose.yaml`): `INSTAGRAM_ACCESS_TOKEN` en el `.env` privado.
   - Docker de producción (`compose.production.yaml`): `INSTAGRAM_ACCESS_TOKEN` en su entorno privado.
   - Pangolin con imágenes (`deploy/docker-compose.images.yml`): `PANGOLIN_INSTAGRAM_ACCESS_TOKEN` en `/opt/dhole/.env` privado.
5. Recrear **solo el servicio backend** correspondiente a la instalación para inyectar la nueva variable, respetando los otros servicios y el procedimiento de despliegue existente.
6. Comprobar `GET /api/social/instagram/latest-reel` y abrir Home. Con el token autorizado, debe devolver el Reel más nuevo con `reel.permalink` y `reel.thumbnailUrl` (si Meta lo incluye). Sin autorización devuelve `reel: null`, y la página ofrece el enlace al perfil.

## Seguridad y operación

- Solo el backend realiza consultas a `graph.instagram.com` por HTTPS; el cliente no recibe credenciales ni tokens. Las redirecciones de la llamada upstream están deshabilitadas.
- El backend verifica el nombre de usuario, no acepta un token de otra cuenta, normaliza los enlaces y filtra las miniaturas a dominios de distribución de Meta.
- Se consulta un máximo de 50 publicaciones recientes y se elige el Reel más reciente por fecha. Si no hay Reels entre esos elementos, la página ofrece el enlace al perfil.
- Caché en memoria del backend: **10 minutos** cuando hay Reel y **2 minutos** cuando no lo hay. El navegador puede guardar respuesta hasta 2 minutos. La actualización ocurre automáticamente sin editar el sitio.
- Si el token caduca o se revoca, el Home sigue operativo y muestra el enlace del perfil. **La renovación automática del token no forma parte de este cambio**: deberá implementarse y probarse con el flujo de autorización de Meta antes de prometer actualización indefinida.
- El reproductor insertado es el oficial de Instagram y se carga **solo después de hacer clic**. Depende de las reglas de acceso, cookies y disponibilidad del contenido en Meta.

## Validación recomendada

- Ejecutar el `npm run build` de `frontend` y `dotnet build` de `backend` en un entorno con dependencias instaladas.
- Probar Home en escritorio, móvil, tema claro/oscuro y lectores de pantalla.
- Probar sin token, con token válido, con token de una cuenta diferente y con Meta inaccesible.
- Verificar que los endpoints existentes de noticias, comentarios y rastreo no cambian.
