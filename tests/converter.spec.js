const { test, expect } = require('@playwright/test');
const { readFile } = require('node:fs/promises');

// Real, self-contained PDF: a red portrait page and a blue landscape page.
function pdfFile(name = 'documento.pdf', pageCount = 2) {
  const streams = ['1 0 0 rg 0 0 200 300 re f', '0 0 1 rg 0 0 300 200 re f'];
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    `<< /Type /Pages /Kids [3 0 R ${pageCount === 2 ? '5 0 R' : ''}] /Count ${pageCount} >>`,
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 200 300] /Resources << >> /Contents 4 0 R >>',
    `<< /Length ${streams[0].length} >>\nstream\n${streams[0]}\nendstream`,
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 200] /Resources << >> /Contents 6 0 R >>',
    `<< /Length ${streams[1].length} >>\nstream\n${streams[1]}\nendstream`
  ];
  if (pageCount === 1) objects.splice(4);
  let source = '%PDF-1.4\n';
  const offsets = [0];
  objects.forEach((object, index) => {
    offsets.push(Buffer.byteLength(source));
    source += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });
  const xref = Buffer.byteLength(source);
  source += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets.slice(1).map(offset => `${String(offset).padStart(10, '0')} 00000 n \n`).join('')}trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return { name, mimeType: 'application/pdf', buffer: Buffer.from(source) };
}

test('solo iconos, selector múltiple y datos antiguos intactos', async ({ page }, testInfo) => {
  await page.addInitScript(() => localStorage.setItem('esferas-respaldo-v1', 'respaldo antiguo'));
  await page.goto('/');
  await expect(page.locator('body')).toHaveJSProperty('innerText', '');
  await expect(page.getByRole('button', { name: 'Agregar PDF' })).toBeVisible();
  await expect(page.locator('#downloadAll')).toBeHidden();
  const plus = await page.locator('#addFiles').boundingBox();
  expect(plus.width).toBeGreaterThanOrEqual(160);
  expect(Math.abs(plus.x + plus.width / 2 - page.viewportSize().width / 2)).toBeLessThan(1);
  expect(Math.abs(plus.y + plus.height / 2 - page.viewportSize().height / 2)).toBeLessThan(1);
  await page.screenshot({ path: testInfo.outputPath('empty.png') });
  const chooserPromise = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'Agregar PDF' }).click();
  expect((await chooserPromise).isMultiple()).toBe(true);
  expect(await page.evaluate(() => localStorage.getItem('esferas-respaldo-v1'))).toBe('respaldo antiguo');
});

test('convierte PDF real, conserva páginas y permite descargar repetidamente', async ({ page }) => {
  await page.goto('/');
  await page.locator('#fileInput').setInputFiles(pdfFile('Álgebra.pdf'));
  const row = page.locator('.file-row');
  await expect(row).toHaveAttribute('data-state', 'ready');
  const button = row.getByRole('button', { name: 'Descargar SVG de Álgebra.pdf' });
  await expect(button).toBeEnabled();
  await expect(button).toHaveCSS('background-color', 'rgb(22, 128, 75)');
  for (let attempt = 0; attempt < 2; attempt++) {
    const downloadPromise = page.waitForEvent('download');
    await button.click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toBe('Álgebra.svg');
    const source = await readFile(await download.path(), 'utf8');
    const result = await page.evaluate(async svg => {
      const xml = new DOMParser().parseFromString(svg, 'image/svg+xml');
      const root = xml.documentElement;
      const images = [...xml.querySelectorAll('image')];
      const colors = [];
      for (const element of images) {
        const image = new Image();
        image.src = element.getAttribute('href');
        await image.decode();
        const canvas = document.createElement('canvas');
        canvas.width = canvas.height = 1;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(image, 0, 0, 1, 1);
        colors.push([...ctx.getImageData(0, 0, 1, 1).data]);
      }
      const exported = new Image();
      exported.src = `data:image/svg+xml;base64,${btoa(svg)}`;
      await exported.decode();
      return {
        error: Boolean(xml.querySelector('parsererror')),
        width: root.getAttribute('width'), height: root.getAttribute('height'),
        images: images.map(element => ({ y: element.getAttribute('y'), height: element.getAttribute('height') })),
        colors
      };
    }, source);
    const width = Math.round(Math.min(page.viewportSize().width * .78, 900));
    const firstHeight = Math.round(Math.min(page.viewportSize().width * .78, 900) * 1.5);
    const secondHeight = Math.round(Math.min(page.viewportSize().width * .78, 900) * 2 / 3);
    expect(result.error).toBe(false);
    expect(result.width).toBe(String(width));
    expect(result.height).toBe(String(firstHeight + 16 + secondHeight));
    expect(result.images).toEqual([{ y: '0', height: String(firstHeight) }, { y: String(firstHeight + 16), height: String(secondHeight) }]);
    expect(result.colors[0][0]).toBeGreaterThan(245);
    expect(result.colors[0][2]).toBeLessThan(10);
    expect(result.colors[1][2]).toBeGreaterThan(245);
    expect(result.colors[1][0]).toBeLessThan(10);
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('crea filas inmediatamente, encola nuevas cargas y conserva duplicados', async ({ page }) => {
  let releaseWorker;
  const workerGate = new Promise(resolve => { releaseWorker = resolve; });
  await page.route('**/pdf.worker.min.js', async route => {
    await workerGate;
    await route.continue();
  });
  await page.goto('/');
  await page.locator('#fileInput').setInputFiles([pdfFile('uno.pdf'), pdfFile('dos.pdf')]);
  const rows = page.locator('.file-row');
  await expect(rows).toHaveCount(2);
  await expect(rows.nth(0)).toHaveAttribute('data-state', 'processing');
  await expect(rows.nth(1)).toHaveAttribute('data-state', 'queued');
  await expect(rows.nth(0).locator('.download')).toBeDisabled();
  await expect(rows.nth(1).locator('.download')).toHaveCSS('background-color', 'rgb(241, 243, 246)');
  const spinner = await page.evaluate(async () => {
    const element = document.querySelector('.file-status[data-state="processing"] svg');
    const animation = element.getAnimations()[0];
    await animation.ready;
    const time = animation.currentTime;
    const transform = getComputedStyle(element).transform;
    updateStatus(jobs[0], 'processing', 'Página 1 de 3');
    updateStatus(jobs[0], 'processing', 'Página 2 de 3');
    await new Promise(resolve => setTimeout(resolve, 150));
    return {
      sameElement: element === document.querySelector('.file-status[data-state="processing"] svg'),
      sameAnimation: element.getAnimations()[0] === animation,
      advances: animation.currentTime > time,
      rotates: getComputedStyle(element).transform !== transform
    };
  });
  expect(spinner).toEqual({ sameElement: true, sameAnimation: true, advances: true, rotates: true });
  await page.evaluate(() => {
    window.completed = [];
    new MutationObserver(records => {
      for (const record of records) {
        if (record.target.matches('.file-row[data-state="ready"]')) window.completed.push(record.target.querySelector('.file-name').textContent);
      }
    }).observe(document.querySelector('#files'), { subtree: true, attributes: true, attributeFilter: ['data-state'] });
  });
  await page.locator('#fileInput').setInputFiles(pdfFile('uno.pdf'));
  await expect(rows).toHaveCount(3);
  await expect(rows.nth(2)).toHaveAttribute('data-state', 'queued');
  releaseWorker();
  await expect(page.locator('.file-row[data-state="ready"]')).toHaveCount(3);
  expect(await page.evaluate(() => window.completed)).toEqual(['uno.pdf', 'dos.pdf', 'uno.pdf']);
});

test('PDF de una página sin espacio sobrante y vista adaptable', async ({ page }, testInfo) => {
  await page.goto('/');
  await page.locator('#fileInput').setInputFiles(pdfFile('Una página.pdf', 1));
  await expect(page.locator('.file-row')).toHaveAttribute('data-state', 'ready');
  const plus = await page.locator('#addFiles').boundingBox();
  expect(plus.width).toBe(48);
  expect(plus.y).toBeLessThan(24);
  expect(page.viewportSize().width - plus.x - plus.width).toBeLessThan(24);
  const promise = page.waitForEvent('download');
  await page.locator('.download').click();
  const svg = await readFile(await (await promise).path(), 'utf8');
  expect(svg.match(/<image /g)).toHaveLength(1);
  const width = Math.round(Math.min(page.viewportSize().width * .78, 900));
  const height = Math.round(Math.min(page.viewportSize().width * .78, 900) * 1.5);
  expect(svg).toContain(`viewBox="0 0 ${width} ${height}"`);
  await page.screenshot({ path: testInfo.outputPath('converter.png'), fullPage: true });
});

test('rechaza formatos y PDF corruptos sin detener los válidos', async ({ page }) => {
  await page.goto('/');
  await page.locator('#fileInput').setInputFiles([
    { name: '<img>.txt', mimeType: 'text/plain', buffer: Buffer.from('texto') },
    { name: 'roto.pdf', mimeType: 'application/pdf', buffer: Buffer.from('esto no es un PDF') },
    pdfFile('válido.pdf')
  ]);
  await expect(page.locator('.file-row[data-state="error"]')).toHaveCount(2);
  await expect(page.locator('.file-row[data-state="ready"]')).toHaveCount(1);
  await expect(page.locator('.file-error').first()).toBeHidden();
  await page.getByRole('button', { name: 'Ver error de <img>.txt' }).click();
  await expect(page.locator('.file-error').first()).toHaveText('Solo se admiten archivos PDF.');
  await page.getByRole('button', { name: 'Ver error de roto.pdf' }).click();
  await expect(page.locator('.file-error').nth(1)).toBeVisible();
  await expect(page.locator('.file-row[data-state="error"] .download')).toHaveCount(2);
  await expect(page.locator('.file-row[data-state="error"] .download').first()).toBeDisabled();
});

test('contraseña: informa el error y destruye la tarea antes de continuar', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => {
    const original = pdfjsLib.getDocument;
    let calls = 0;
    window.destroyed = false;
    window.pdfjsLib = { ...pdfjsLib, getDocument: (...args) => {
      if (calls++ > 0) return original(...args);
      return {
        promise: Promise.reject(Object.assign(new Error('password'), { name: 'PasswordException' })),
        destroy: async () => { window.destroyed = true; }
      };
    } };
  });
  await page.locator('#fileInput').setInputFiles([pdfFile('privado.pdf'), pdfFile('siguiente.pdf')]);
  await expect(page.locator('.file-row[data-state="ready"]')).toHaveCount(1);
  await page.getByRole('button', { name: 'Ver error de privado.pdf' }).click();
  await expect(page.locator('.file-error')).toContainText('requiere contraseña');
  expect(await page.evaluate(() => window.destroyed)).toBe(true);
});

test('carga por arrastre y limpia el indicador de arrastre', async ({ page }) => {
  const file = pdfFile('arrastrado.pdf');
  await page.goto('/');
  const transfer = await page.evaluateHandle(bytes => {
    const data = new DataTransfer();
    data.items.add(new File([new Uint8Array(bytes)], 'arrastrado.pdf', { type: 'application/pdf' }));
    return data;
  }, [...file.buffer]);
  await page.dispatchEvent('body', 'dragenter', { dataTransfer: transfer });
  await expect(page.locator('body')).toHaveClass('dragging');
  await page.dispatchEvent('body', 'drop', { dataTransfer: transfer });
  await expect(page.locator('body')).not.toHaveClass('dragging');
  await expect(page.locator('.file-row')).toHaveAttribute('data-state', 'ready');
  await expect(page.locator('.file-name')).toHaveText('arrastrado.pdf');
  await page.dispatchEvent('body', 'dragenter', { dataTransfer: transfer });
  await expect(page.locator('body')).toHaveClass(/dragging/);
  await page.dispatchEvent('body', 'drop', { dataTransfer: transfer });
  await expect(page.locator('.file-row[data-state="ready"]')).toHaveCount(2);
  await expect(page.locator('.file-name')).toHaveText(['arrastrado.pdf', 'arrastrado.pdf']);
  await expect(page.locator('body')).not.toHaveClass(/dragging/);
});

test('ALL descarga 12 SVG individuales, completos y con nombres únicos', async ({ page }) => {
  await page.goto('/');
  await page.locator('#fileInput').setInputFiles(Array.from({ length: 12 }, () => pdfFile('repetido.pdf', 1)));
  await expect(page.locator('.file-row[data-state="ready"]')).toHaveCount(12, { timeout: 15000 });
  const all = page.locator('#downloadAll');
  const plus = await page.locator('#addFiles').boundingBox();
  const bulk = await all.boundingBox();
  expect(bulk.x + bulk.width).toBeLessThan(plus.x);
  expect(bulk.y).toBe(plus.y);
  const downloads = [];
  page.on('download', download => downloads.push(download));
  await all.click();
  await expect(all).toBeDisabled();
  // Even a manually dispatched second click must not start an overlapping batch.
  await all.dispatchEvent('click');
  await expect(all).toBeEnabled({ timeout: 15000 });
  expect(downloads).toHaveLength(12);
  expect(new Set(downloads.map(item => item.suggestedFilename())).size).toBe(12);
  expect(downloads[0].suggestedFilename()).toBe('repetido.svg');
  expect(downloads[11].suggestedFilename()).toBe('repetido (12).svg');
  for (const download of downloads) {
    expect(await download.failure()).toBeNull();
    const source = await readFile(await download.path(), 'utf8');
    expect(source).toContain('<svg xmlns=');
    expect(source.match(/<image /g)).toHaveLength(1);
    expect(source).toContain('data:image/jpeg;base64,');
  }
});

test('ALL toma solo los verdes al pulsar y usa la lista actual en la siguiente descarga', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => {
    const original = convertPdf;
    const gate = new Promise(resolve => { window.finishPending = resolve; });
    convertPdf = async job => {
      if (job.name === 'pendiente.pdf') await gate;
      return original(job);
    };
  });
  await page.locator('#fileInput').setInputFiles([
    pdfFile('primero.pdf', 1), pdfFile('segundo.pdf', 1), pdfFile('pendiente.pdf', 1)
  ]);
  await expect(page.locator('.file-row[data-state="ready"]')).toHaveCount(2);
  await expect(page.locator('.file-row[data-state="processing"]')).toHaveCount(1);
  const all = page.locator('#downloadAll');
  const downloads = [];
  page.on('download', download => downloads.push(download));
  await all.click();
  await page.evaluate(() => window.finishPending());
  await page.locator('#fileInput').setInputFiles(pdfFile('nuevo.pdf', 1));
  await expect(page.locator('.file-row[data-state="ready"]')).toHaveCount(4);
  await expect(all).toBeEnabled();
  expect(downloads.map(item => item.suggestedFilename())).toEqual(['primero.svg', 'segundo.svg']);
  downloads.length = 0;
  await all.click();
  await expect(all).toBeEnabled({ timeout: 10000 });
  expect(downloads.map(item => item.suggestedFilename())).toEqual(['primero.svg', 'segundo.svg', 'pendiente.svg', 'nuevo.svg']);
});
