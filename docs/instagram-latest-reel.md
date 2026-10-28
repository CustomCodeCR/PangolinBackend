# Reel reciente de Instagram en Home

La sección de Instagram se muestra **antes de las tarjetas de contacto**, en formato 9:16, adaptable a teléfono y escritorio. Abre el reproductor oficial únicamente tras pulsar «Reproducir», y mantiene un enlace permanente al perfil si Meta no está disponible.

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
