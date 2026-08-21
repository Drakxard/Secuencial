# Secuencial

Pizarra visual de esferas, cuadros, imágenes y conexiones. La misma interfaz se ejecuta
directamente en Chrome o Edge y dentro de la aplicación Android. Funciona sin conexión y
no envía el contenido a ningún servidor.

## Uso en navegador

Abre `index.html` con Chrome o Edge. En una PC, selecciona una carpeta cuando la aplicación
lo solicite; allí se guarda `esferas.json` y también se mantiene un respaldo local del
navegador. En un navegador móvil el guardado es automático y local porque Android no
ofrece el mismo selector de carpetas.

En PC se conservan los atajos existentes: flechas izquierda/derecha cambian de página,
`Ctrl` + rueda o `Ctrl` + `+`/`-` cambia el tamaño, `Ctrl+Z`/`Ctrl+Y` deshace o rehace y
`|` exporta la página como SVG.

## Gestos en celular

- Desliza verticalmente sobre el fondo para recorrer la pizarra. Al tirar hacia abajo
  cuando ya estás al inicio aparece la barra de categorías.
- Desliza horizontalmente sobre el fondo para cambiar de página.
- Mantén pulsado el fondo y arrastra para seleccionar varios elementos.
- Toca una esfera para seleccionarla; vuelve a tocarla después de una pausa breve para
  abrir el teclado y editarla. Arrastrarla la mueve sin abrir el teclado.
- Los botones que aparecen debajo de una esfera seleccionada cambian su forma o activan
  su copia. Con la copia activa, cada doble toque en el fondo pega otra esfera. El botón
  **Copiando ×** de la esquina superior derecha apaga ese modo.
- Pellizca sobre la selección para cambiar su tamaño sin ampliar la página.
- Arrastra desde el borde de una esfera para conectarla. Mantén pulsada una esfera o una
  flecha para elegir su color.
- Las imágenes se mueven arrastrándolas y se redimensionan desde sus tiradores.

La interfaz móvil no permite borrar ni importar/exportar por ahora. Desinstalar la APK o
borrar sus datos elimina el contenido guardado en el teléfono. La PC y el celular usan el
mismo formato, pero no se sincronizan automáticamente.

## Desarrollo

Requiere Node.js 22 o posterior. Instala dependencias y ejecuta las pruebas con:

```powershell
npm.cmd ci
npm.cmd run test:install
npm.cmd test
```

`index.html`, `fondo.css` y `app.js` son la única fuente web. Antes de sincronizar Android,
el script de preparación los copia a `www/`, que es generado y no se confirma en Git:

```powershell
npm.cmd run android:sync
```

Capacitor 8 requiere Android SDK 36 y una instalación moderna de Java/Android Studio para
compilar localmente. GitHub Actions instala esas herramientas en la nube, por lo que no son
necesarias para publicar desde esta PC.

## Compilación y publicación del APK

La APK oficial siempre se compila y publica mediante GitHub Actions. No se sube un APK
creado manualmente y nunca se reutiliza una etiqueta publicada.

El repositorio necesita cuatro secretos asociados siempre a la misma firma:

- `SECUENCIAL_KEYSTORE_BASE64`
- `SECUENCIAL_STORE_PASSWORD`
- `SECUENCIAL_KEY_ALIAS`
- `SECUENCIAL_KEY_PASSWORD`

La copia privada inicial se guarda fuera del repositorio en
`Documentos\SecuencialSigning`. Conserva un respaldo seguro de esa carpeta: Android exige
la misma firma para instalar una versión nueva sobre la anterior.

Para publicar una versión posterior:

1. Incrementa `version` en `package.json` y `versionCode`/`versionName` en
   `android/app/build.gradle`.
2. Confirma y sube esos cambios a `main`.
3. Crea una etiqueta nueva `vX.Y.Z` que coincida exactamente con `versionName`.
4. Sube la etiqueta y espera a que **Android Release** termine correctamente.

Ejemplo:

```powershell
git switch main
git pull --ff-only origin main
git tag -a v0.1.1 -m "Release 0.1.1"
git push origin v0.1.1
```

El workflow ejecuta pruebas web, lint y compilación Android firmada, y crea un GitHub
Release con `Secuencial.apk`. No existe actualización automática dentro de la aplicación.

## Descargar e instalar

Abre la [última publicación de Secuencial](https://github.com/Drakxard/Secuencial/releases/latest),
descarga `Secuencial.apk` e instálala manualmente. Android puede pedir autorización para
instalar aplicaciones desde el navegador o gestor de archivos utilizado. En versiones
futuras basta descargar la nueva APK firmada y confirmar la actualización.
