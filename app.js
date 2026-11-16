'use strict';

const fileInput = document.querySelector('#fileInput');
const filesList = document.querySelector('#files');
const announcement = document.querySelector('#announcement');
const downloadAll = document.querySelector('#downloadAll');
const jobs = [];
let processing = false;
let downloadingAll = false;

function updateDownloadAll() {
  const count = jobs.filter(job => job.state === 'ready' && job.url).length;
  downloadAll.disabled = downloadingAll || count === 0;
  downloadAll.setAttribute('aria-busy', String(downloadingAll));
  downloadAll.setAttribute('aria-label', downloadingAll
    ? 'Descargando SVG'
    : `Descargar todos los SVG listos (${count})`);
}

function downloadSvg(url, name) {
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  document.body.append(link);
  try {
    link.click();
  } finally {
    link.remove();
  }
}

function svgFilename(name) {
  return `${name.replace(/\.pdf$/i, '') || 'documento'}.svg`;
}

downloadAll.addEventListener('click', async () => {
  if (downloadingAll) return;
  // Capture immutable URLs and names now: later queue completions belong to the next click.
  const names = new Set();
  const batch = jobs.filter(job => job.state === 'ready' && job.url).map(job => {
    const original = svgFilename(job.name).replace(/[<>:"/\\|?*\u0000-\u001f]/g, '-');
    const stem = original.slice(0, -4);
    let name = original;
    let suffix = 2;
    while (names.has(name.normalize('NFC').toLowerCase())) name = `${stem} (${suffix++}).svg`;
    names.add(name.normalize('NFC').toLowerCase());
    return { url: job.url, name };
  });
  if (!batch.length) return;
  downloadingAll = true;
  updateDownloadAll();
  let started = 0;
  try {
    for (const file of batch) {
      downloadSvg(file.url, file.name);
      started++;
      announcement.textContent = `Descarga iniciada: ${started} de ${batch.length}`;
      // Give the browser time to accept each independent download, including the last.
      await new Promise(resolve => setTimeout(resolve, 500));
    }
  } catch {
    window.alert(`Se iniciaron ${started} de ${batch.length} descargas. Volvé a pulsar ALL para repetir el lote.`);
  } finally {
    downloadingAll = false;
    updateDownloadAll();
  }
});

const icons = {
  queued: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  processing: '<path d="M21 12a9 9 0 1 1-9-9"/>',
  ready: '<path d="m5 12 4 4L19 6"/>',
  error: '<path d="m10.3 3.9-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.7-3.1l-8-14a2 2 0 0 0-3.4 0Z"/><path d="M12 9v4m0 4h.01"/>',
  download: '<path d="M12 3v12m-5-5 5 5 5-5M5 16v5h14v-5"/>'
};
const icon = name => `<svg viewBox="0 0 24 24" aria-hidden="true">${icons[name]}</svg>`;
const svgNumber = value => Math.round(value * 100) / 100;

function updateStatus(job, state, label) {
  // Keep the same animated element across page progress updates.
  if (job.status.dataset.state !== state) job.status.innerHTML = icon(state);
  job.state = state;
  job.row.dataset.state = state;
  job.status.dataset.state = state;
  job.status.setAttribute('aria-label', `${label}: ${job.name}`);
  job.status.title = label;
  job.row.setAttribute('aria-busy', String(state === 'processing'));
  job.download.disabled = state !== 'ready';
  announcement.textContent = `${job.name}: ${label}`;
  updateDownloadAll();
}

function failJob(job, message) {
  updateStatus(job, 'error', 'Error');
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'file-status icon-button';
  button.dataset.state = 'error';
  button.innerHTML = icon('error');
  button.setAttribute('aria-label', `Ver error de ${job.name}`);
  button.setAttribute('aria-expanded', 'false');
  const detail = document.createElement('p');
  detail.id = `error-${jobs.indexOf(job)}`;
  detail.className = 'file-error';
  detail.hidden = true;
  detail.textContent = message;
  button.setAttribute('aria-controls', detail.id);
  button.addEventListener('click', () => {
    detail.hidden = !detail.hidden;
    button.setAttribute('aria-expanded', String(!detail.hidden));
  });
  job.status.replaceWith(button);
  job.status = button;
  job.row.append(detail);
}

function addFiles(files) {
  for (const file of files) {
    const row = document.createElement('li');
    row.className = 'file-row';
    const name = document.createElement('span');
    name.className = 'file-name';
    name.textContent = file.name;
    name.title = file.name;
    const status = document.createElement('span');
    status.className = 'file-status';
    status.setAttribute('role', 'img');
    const download = document.createElement('button');
    download.type = 'button';
    download.className = 'icon-button download';
    download.innerHTML = icon('download');
    download.setAttribute('aria-label', `Descargar SVG de ${file.name}`);
    row.append(name, status, download);
    filesList.append(row);
    document.body.classList.add('has-files');
    const job = { file, name: file.name, row, status, download, state: 'queued', url: null };
    jobs.push(job);
    updateStatus(job, 'queued', 'En espera');
    download.addEventListener('click', () => {
      if (!job.url) return;
      downloadSvg(job.url, svgFilename(job.name));
    });
    if (!/\.pdf$/i.test(file.name) && file.type !== 'application/pdf') {
      failJob(job, 'Solo se admiten archivos PDF.');
      job.file = null;
    }
  }
  void processQueue();
}

async function processQueue() {
  if (processing) return;
  processing = true;
  try {
    let job;
    while ((job = jobs.find(item => item.state === 'queued'))) {
      updateStatus(job, 'processing', 'Procesando');
      try {
        const svg = await convertPdf(job);
        job.url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml;charset=utf-8' }));
        updateStatus(job, 'ready', 'Listo');
      } catch (error) {
        failJob(job, error.name === 'PasswordException'
          ? 'El PDF requiere contraseña. Guardá una copia sin contraseña y volvé a cargarla.'
          : 'No se pudo convertir este PDF. Comprobá que sea un archivo PDF válido y volvé a cargarlo.');
      } finally {
        job.file = null;
      }
    }
  } finally {
    processing = false;
  }
}

async function convertPdf(job) {
  if (!window.pdfjsLib) throw new Error('PDF.js no está disponible.');
  pdfjsLib.GlobalWorkerOptions.workerSrc = 'pdf.worker.min.js';
  const data = new Uint8Array(await job.file.arrayBuffer());
  const loadingTask = pdfjsLib.getDocument({ data, isEvalSupported: false });
  const pages = [];
  // Preserve the existing display scale and raster quality, fixed for this job.
  const displayWidth = Math.min(innerWidth * .78, 900);
  let y = 0;
  try {
    const pdf = await loadingTask.promise;
    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber++) {
      updateStatus(job, 'processing', `Página ${pageNumber} de ${pdf.numPages}`);
      const page = await pdf.getPage(pageNumber);
      const canvas = document.createElement('canvas');
      try {
        const base = page.getViewport({ scale: 1 });
        const displayScale = displayWidth / base.width;
        const width = Math.round(base.width * displayScale);
        const height = Math.round(base.height * displayScale);
        const viewport = page.getViewport({ scale: Math.min(2.2, 1600 / base.width) });
        canvas.width = Math.ceil(viewport.width);
        canvas.height = Math.ceil(viewport.height);
        await page.render({ canvasContext: canvas.getContext('2d', { alpha: false }), viewport }).promise;
        const blob = await new Promise((resolve, reject) => {
          canvas.toBlob(value => value ? resolve(value) : reject(new Error('No se pudo crear la imagen.')), 'image/jpeg', .92);
        });
        const src = await new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result);
          reader.onerror = () => reject(reader.error);
          reader.readAsDataURL(blob);
        });
        pages.push({ width, height, y, src });
        y += height + 16;
      } finally {
        canvas.width = canvas.height = 0;
        page.cleanup();
      }
    }
    return buildSvg(pages);
  } finally {
    await loadingTask.destroy();
  }
}

function buildSvg(pages) {
  const width = Math.max(...pages.map(page => page.width));
  const height = pages.at(-1).y + pages.at(-1).height;
  const images = pages.map(page => `<image x="0" y="${page.y}" width="${page.width}" height="${page.height}" href="${page.src}" preserveAspectRatio="none"/>`).join('');
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <defs>
    <linearGradient id="blob-pink" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#fbcfe8"/><stop offset="1" stop-color="#f472b6"/></linearGradient>
    <linearGradient id="blob-blue" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#bae6fd"/><stop offset="1" stop-color="#38bdf8"/></linearGradient>
    <linearGradient id="blob-violet" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#ddd6fe"/><stop offset="1" stop-color="#a78bfa"/></linearGradient>
    <filter id="background-blur" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="90"/></filter>
  </defs>
  <rect width="${width}" height="${height}" fill="#f8fafc"/>
  <g filter="url(#background-blur)" opacity=".6">
    <ellipse cx="${svgNumber(width * .07)}" cy="${svgNumber(height * .08)}" rx="${svgNumber(Math.max(200, width * .16))}" ry="${svgNumber(Math.max(200, height * .07))}" fill="url(#blob-pink)"/>
    <ellipse cx="${svgNumber(width * .94)}" cy="${svgNumber(height * .91)}" rx="${svgNumber(Math.max(175, width * .14))}" ry="${svgNumber(Math.max(175, height * .065))}" fill="url(#blob-blue)"/>
    <ellipse cx="${svgNumber(width * .78)}" cy="${svgNumber(height * .48)}" rx="${svgNumber(Math.max(150, width * .12))}" ry="${svgNumber(Math.max(150, height * .055))}" fill="url(#blob-violet)"/>
  </g>
  ${images}
</svg>`;
}

document.querySelector('#addFiles').addEventListener('click', () => fileInput.click());
fileInput.addEventListener('change', () => {
  addFiles(fileInput.files);
  fileInput.value = '';
});
let dragDepth = 0;
document.addEventListener('dragenter', event => {
  if (!Array.from(event.dataTransfer.types).includes('Files')) return;
  event.preventDefault();
  dragDepth++;
  document.body.classList.add('dragging');
});
document.addEventListener('dragover', event => {
  if (Array.from(event.dataTransfer.types).includes('Files')) event.preventDefault();
});
document.addEventListener('dragleave', () => {
  if (--dragDepth <= 0) {
    dragDepth = 0;
    document.body.classList.remove('dragging');
  }
});
document.addEventListener('drop', event => {
  event.preventDefault();
  dragDepth = 0;
  document.body.classList.remove('dragging');
  addFiles(event.dataTransfer.files);
});
window.addEventListener('pagehide', event => {
  if (event.persisted) return;
  for (const job of jobs) if (job.url) URL.revokeObjectURL(job.url);
});
