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

test('solo iconos, selector múltiple y datos antiguos intactos', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('esferas-respaldo-v1', 'respaldo antiguo'));
  await page.goto('/');
  await expect(page.locator('body')).toHaveText('');
  await expect(page.getByRole('button', { name: 'Agregar PDF' })).toBeVisible();
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
});
