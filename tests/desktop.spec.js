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

test('T crea un nodo cuadrado cerca del cursor',async({page})=>{
  await page.addInitScript(()=>{window.showDirectoryPicker=async()=>{throw Object.assign(new Error('cancelado'),{name:'AbortError'})}});
  await page.goto('/');await page.evaluate(()=>document.querySelector('#folderNotice').hidden=true);
  await page.mouse.move(320,260);await page.keyboard.press('t');
  const sphere=page.locator('.sphere');await expect(sphere).toHaveCount(1);await expect(sphere).toHaveClass(/square/);await expect(sphere).toHaveClass(/focused/);
  const box=await sphere.boundingBox();expect(Math.abs((box.x+box.width/2)-320)).toBeLessThan(210);expect(Math.abs((box.y+box.height/2)-260)).toBeLessThan(210);
});

test('una flecha puede conectarse a una imagen',async({page})=>{
  await page.addInitScript(()=>{window.showDirectoryPicker=async()=>{throw Object.assign(new Error('cancelado'),{name:'AbortError'})}});
  await page.goto('/');await page.evaluate(()=>document.querySelector('#folderNotice').hidden=true);
  await page.locator('#board').dblclick({position:{x:180,y:200}});
  await page.evaluate(()=>{state.images=[{id:'test-image',src:'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==',name:'Imagen',x:410,y:180,width:100,height:100}];render()});
  const sphere=page.locator('.sphere');await sphere.click();const box=await sphere.boundingBox();
  await page.mouse.move(box.x+box.width-4,box.y+box.height/2);await page.mouse.down();await page.mouse.move(430,230);await page.mouse.up();
  await expect.poll(()=>page.evaluate(()=>state.arrows[0]?.toImageId)).toBe('test-image');
});
