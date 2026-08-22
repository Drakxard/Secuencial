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

test('escritorio crea, mueve y edita con un clic',async({page})=>{
  await page.addInitScript(()=>{window.showDirectoryPicker=async()=>{throw Object.assign(new Error('cancelado'),{name:'AbortError'})}});
  await page.goto('/');await page.evaluate(()=>document.querySelector('#folderNotice').hidden=true);
  await page.locator('#board').dblclick({position:{x:300,y:250}});
  const sphere=page.locator('.sphere').first();await expect(sphere).toHaveCount(1);
  await sphere.click();
  await expect(page.getByRole('button',{name:'Cambiar forma'})).toHaveCount(0);
  await sphere.click();await expect(sphere).toHaveClass(/focused/);
});

test('las flechas navegan el texto y el arrastre mueve sin editar',async({page})=>{
  await page.addInitScript(()=>{window.showDirectoryPicker=async()=>{throw Object.assign(new Error('cancelado'),{name:'AbortError'})}});
  await page.goto('/');await page.evaluate(()=>document.querySelector('#folderNotice').hidden=true);
  await page.locator('#board').dblclick({position:{x:300,y:250}});const sphere=page.locator('.sphere').first();
  await page.keyboard.type('abc');await page.keyboard.press('ArrowLeft');await page.keyboard.type('X');
  await expect(sphere.locator('.sphere-text')).toContainText('abXc');
  const before=await sphere.boundingBox();await sphere.dragTo(page.locator('#board'),{targetPosition:{x:520,y:420}});const after=await sphere.boundingBox();
  expect(Math.hypot(after.x-before.x,after.y-before.y)).toBeGreaterThan(40);
});

test('el doble clic crea círculos aunque se haya seleccionado un cuadro',async({page})=>{
  await page.addInitScript(()=>{window.showDirectoryPicker=async()=>{throw Object.assign(new Error('cancelado'),{name:'AbortError'})}});
  await page.goto('/');await page.evaluate(()=>document.querySelector('#folderNotice').hidden=true);
  await page.locator('#board').dblclick({position:{x:300,y:250}});
  await expect(page.locator('.sphere').first()).toHaveClass(/focused/);
  await page.evaluate(()=>{const sphere=state.spheres[0];sphere.shape='square';focusSphere(sphere.id)});
  await page.locator('#board').dblclick({position:{x:520,y:260}});
  await expect(page.locator('.sphere').nth(1)).not.toHaveClass(/square/);
});

test('el tamaño de texto se conserva por forma en nuevos nodos',async({page})=>{
  await page.addInitScript(()=>{window.showDirectoryPicker=async()=>{throw Object.assign(new Error('cancelado'),{name:'AbortError'})}});
  await page.goto('/');await page.evaluate(()=>document.querySelector('#folderNotice').hidden=true);
  await page.locator('#board').dblclick({position:{x:240,y:240}});
  await page.evaluate(()=>{const sphere=state.spheres[0];sphere.fontScale=1.6;focusSphere(sphere.id);switchPage(1);addSphere()});
  await expect.poll(()=>page.evaluate(()=>state.spheres[0].fontScale)).toBe(1.6);
  await page.evaluate(()=>{const square=addSphere(true,'square');square.fontScale=.8;focusSphere(square.id);switchPage(1);addSphere(true,'square')});
  await expect.poll(()=>page.evaluate(()=>state.spheres[0].fontScale)).toBe(.8);
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
  const sphere=page.locator('.sphere');const box=await sphere.boundingBox();
  await page.evaluate(()=>{editingId=null;render()});
  await page.keyboard.press('x');await expect(page.locator('#board')).toHaveClass(/arrow-mode/);
  await page.mouse.move(box.x+box.width/2,box.y+box.height/2);await page.mouse.down();await page.mouse.move(430,230);await page.mouse.up();
  await expect.poll(()=>page.evaluate(()=>state.arrows[0]?.toImageId)).toBe('test-image');
  await expect.poll(()=>page.evaluate(()=>state.arrows[0]?.toImageAnchor?.x)).toBe(0);
  await page.keyboard.press('x');await expect(page.locator('#board')).not.toHaveClass(/arrow-mode/);
});

test('Ctrl+C copia una imagen seleccionada al portapapeles',async({page})=>{
  await page.addInitScript(()=>{window.showDirectoryPicker=async()=>{throw Object.assign(new Error('cancelado'),{name:'AbortError'})};window.ClipboardItem=class{constructor(data){Object.assign(this,data)}};Object.defineProperty(navigator,'clipboard',{value:{write:async items=>{window.copiedImageTypes=Object.keys(items[0])}}})});
  await page.goto('/');await page.evaluate(()=>{document.querySelector('#folderNotice').hidden=true;state.images=[{id:'copy-image',src:'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==',name:'Imagen',x:200,y:180,width:100,height:100}];focusImage('copy-image');render()});
  await page.keyboard.press('Control+c');await expect.poll(()=>page.evaluate(()=>window.copiedImageTypes?.[0])).toBe('image/gif');
});

test('un cuadro se ajusta al escribir sin desplazar el scroll',async({page})=>{
  await page.addInitScript(()=>{window.showDirectoryPicker=async()=>{throw Object.assign(new Error('cancelado'),{name:'AbortError'})}});
  await page.goto('/');await page.evaluate(()=>document.querySelector('#folderNotice').hidden=true);
  await page.keyboard.press('t');const square=page.locator('.sphere');const before=await square.boundingBox();
  await page.evaluate(()=>scrollTo(0,360));await page.keyboard.type('texto largo que alcanza y supera el borde interno');const after=await square.boundingBox();expect(after.width).toBeGreaterThan(before.width);await expect.poll(()=>page.evaluate(()=>scrollY)).toBe(360);
});

test('T crea una lÃ­nea que crece y se contrae con lÃ­neas en blanco',async({page})=>{
  await page.addInitScript(()=>{window.showDirectoryPicker=async()=>{throw Object.assign(new Error('cancelado'),{name:'AbortError'})}});
  await page.goto('/');await page.evaluate(()=>document.querySelector('#folderNotice').hidden=true);
  await page.keyboard.press('t');const square=page.locator('.sphere');await page.waitForTimeout(220);const initial=await square.boundingBox();
  expect(initial.height).toBeLessThan(initial.width/2);
  await page.keyboard.type('texto');await page.keyboard.press('Enter');await page.keyboard.press('Enter');await page.waitForTimeout(220);const expanded=await square.boundingBox();
  expect(expanded.height).toBeGreaterThan(initial.height*2);
  await page.keyboard.press('Backspace');await page.keyboard.press('Backspace');await page.waitForTimeout(220);const contracted=await square.boundingBox();
  expect(contracted.height).toBeLessThan(expanded.height);
});
