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

test('escritorio crea, mueve y edita con doble clic',async({page})=>{
  await page.addInitScript(()=>{window.showDirectoryPicker=async()=>{throw Object.assign(new Error('cancelado'),{name:'AbortError'})}});
  await page.goto('/');await page.evaluate(()=>document.querySelector('#folderNotice').hidden=true);
  await page.locator('#board').dblclick({position:{x:300,y:250}});
  const sphere=page.locator('.sphere').first();await expect(sphere).toHaveCount(1);
  await sphere.click();
  await expect(page.getByRole('button',{name:'Cambiar forma'})).toHaveCount(0);
  await sphere.dblclick();await expect(sphere).toHaveClass(/focused/);
});

test('la forma seleccionada se usa en nodos nuevos, incluso en otra página',async({page})=>{
  await page.addInitScript(()=>{window.showDirectoryPicker=async()=>{throw Object.assign(new Error('cancelado'),{name:'AbortError'})}});
  await page.goto('/');await page.evaluate(()=>document.querySelector('#folderNotice').hidden=true);
  await page.locator('#board').dblclick({position:{x:300,y:250}});
  await page.evaluate(()=>{const sphere=state.spheres[0];sphere.shape='square';focusSphere(sphere.id);switchPage(1);addSphere()});
  await expect(page.locator('.sphere').first()).toHaveClass(/square/);
});
