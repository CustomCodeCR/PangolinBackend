# Propuestas de efectos de tracking (pendiente de definición)

Esta nota abre una **PR en borrador** para diseñar nuevas animaciones sobre la versión actual de `main-2`, que ya incluye el globo con océanos azules y continentes verdes.

## Estado
- **Aún no se han implementado efectos ni cambiado componentes.**
- Primero se recopilarán y revisarán las propuestas del equipo.
- El contenido y la técnica de cada efecto se acordarán antes de programarlos.

## Referencias para debatir (no son decisiones definitivas)
- Avión: dos estelas de condensación blancas, separadas y paralelas a la ruta.
- Barco: rastro de espuma y agua adaptado a su curva.
- Camión: polvo o humo ligero siguiendo su trayecto.

## Condiciones de seguridad
- Conservar la geometría de la ruta, el progreso, las escalas y la lógica multimodal.
- Conservar los modelos de transporte y los colores del nuevo globo de `main-2`.
- Validar licencias y tamaño de cualquier recurso externo antes de incorporarlo.
- No fusionar hasta realizar pruebas de regresión y revisión visual en ambos temas y móvil.

La rama antigua de experimentación (#164) no se fusiona ni se copia automáticamente.
