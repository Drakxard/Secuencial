const { test, expect } = require('@playwright/test');

test('escritorio conserva el selector de carpeta',async({page})=>{
  await page.goto('/');
  await expect(page.getByRole('heading',{name:'Carpeta de almacenamiento'})).toBeVisible();
  await expect(page.getByRole('button',{name:'Elegir carpeta'})).toBeEnabled();
});

test('el botón de estado alterna pausa, duda y revisión',async({page})=>{
  await page.goto('/');
  const button=page.locator('#progressState');
  await expect(button).toHaveAttribute('data-state','pausa');
  await button.click();await expect(button).toHaveAttribute('data-state','duda');
  await button.click();await expect(button).toHaveAttribute('data-state','revision');
  await button.click();await expect(button).toHaveAttribute('data-state','pausa');
});

test('escritorio crea, mueve, edita y cambia forma desde el botón',async({page})=>{
  await page.addInitScript(()=>{window.showDirectoryPicker=async()=>{throw Object.assign(new Error('cancelado'),{name:'AbortError'})}});
  await page.goto('/');await page.evaluate(()=>document.querySelector('#folderNotice').hidden=true);
  await page.locator('#board').dblclick({position:{x:300,y:250}});
  const sphere=page.locator('.sphere').first();await expect(sphere).toHaveCount(1);
  await sphere.click();
  await page.getByRole('button',{name:'Cambiar forma'}).click();await expect(sphere).toHaveClass(/square/);
  await sphere.dblclick();await expect(sphere).toHaveClass(/focused/);
  const before=await sphere.boundingBox();await sphere.dragTo(page.locator('#board'),{targetPosition:{x:500,y:450}});const after=await sphere.boundingBox();expect(after.x).not.toBe(before.x);
});
