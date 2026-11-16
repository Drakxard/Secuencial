# Secuencial · PDF → SVG

Conversor web local: permite seleccionar o arrastrar uno o varios PDF y descargar un SVG por archivo. La interfaz utiliza iconos y nombres de archivo, sin instrucciones visibles.

El «+» grande centrado abre el selector múltiple; después de cargar archivos queda pequeño en la esquina superior derecha. También se pueden arrastrar PDF a la pantalla y las nuevas filas se agregan debajo. El borde inferior de cada fila muestra el avance en verde: comienza vacío, crece al completar páginas sin retroceder y queda completo cuando el SVG está listo. El avance corresponde al trabajo por páginas, no a una estimación del tiempo restante; se reserva el último 5 % para generar el SVG y liberar recursos. El botón de descarga está gris hasta que el resultado está listo y pasa a verde. Si ocurre un error, aparece un icono de advertencia que permite consultar el detalle.

Los archivos se procesan de uno en uno, en orden de carga. Se pueden agregar más durante la conversión. Un PDF inválido o protegido con contraseña no detiene los demás.

`ALL ↓`, junto al «+», descarga SVG individuales a través del navegador. Hay que permitir las descargas múltiples para este sitio en el navegador. El botón toma exactamente los archivos que estén en verde al pulsarlo y lanza sus descargas en orden, con medio segundo entre archivos. Los que terminen después se incluirán al volver a pulsarlo. El botón se bloquea durante el lote para evitar superposiciones; los nombres repetidos reciben un sufijo para conservar cada archivo. Las descargas individuales de cada fila siguen disponibles. La aplicación inicia las descargas; el navegador controla los permisos y su guardado final.

## Exportación

Cada PDF produce un único SVG con sus páginas apiladas verticalmente, separadas por 16 píxeles. Se conserva el método anterior: páginas renderizadas mediante PDF.js como imágenes JPEG de calidad 0,92 dentro del SVG, con el fondo de exportación original y el recorte al contenido. No es una conversión a trazos o texto vectorial. La escala visible conserva el cálculo anterior según el ancho del navegador al comenzar cada archivo; la resolución de renderizado también conserva el límite anterior.

Los PDF se procesan en el navegador y no se envían a un servidor. Los resultados permanecen en memoria durante la sesión y se pierden al recargar. No se solicita una carpeta ni se modifica el almacenamiento de la antigua pizarra. Las descargas usan el nombre del PDF con extensión `.svg`.

## Desarrollo

Requiere Node.js 22 o posterior.

```powershell
npm.cmd ci
npm.cmd run test:install
npm.cmd test
npm.cmd start
```

El servidor local escucha en `http://127.0.0.1:4173`. `npm start` prepara primero los archivos web y sirve la aplicación por HTTP; no es necesario abrir `index.html` directamente.

`index.html`, `fondo.css` y `app.js` son la fuente web. `npm run web:prepare` los copia a `www/` junto con PDF.js y su worker, sin depender de una CDN. `www/` es generado y no se confirma en Git. Vercel conserva ese comando de compilación y directorio de salida.

Las pruebas de Playwright ejecutan los mismos escenarios en Chromium de escritorio y con el perfil móvil Pixel 7: interfaz de iconos, conversión de PDF real, páginas y colores del SVG, cola, descargas repetidas, arrastre y manejo de errores. GitHub Actions ejecuta la verificación web. El proyecto ya no incluye aplicación Android ni publicación de APK.
