const { test, expect } = require('@playwright/test');

async function touchSequence(page,steps){
  const client=await page.context().newCDPSession(page);
  for(const {type,points=[],wait=0} of steps){
    await client.send('Input.dispatchTouchEvent',{type,touchPoints:points.map(({x,y,id=0})=>({x,y,id,radiusX:5,radiusY:5,force:1}))});
    if(wait)await page.waitForTimeout(wait);
  }
  await client.detach();
}
async function gesture(page,from,to,duration=120){
  await touchSequence(page,[{type:'touchStart',points:[from],wait:duration},{type:'touchMove',points:[to]},{type:'touchEnd'}]);
}

test.beforeEach(async({page})=>{await page.goto('/');await expect(page.locator('.sphere')).toBeVisible();await expect(page.locator('html')).not.toHaveClass(/restoring-view/)});

test('@mobile selecciona y edita con un toque',async({page})=>{
  const sphere=page.locator('.sphere').first(),box=await sphere.boundingBox(),point={x:box.x+box.width/2,y:box.y+box.height/2};
  await page.touchscreen.tap(point.x,point.y);
  await expect(sphere).toHaveClass(/selected/);
  await expect(page.locator('#mobileEditor')).toBeFocused();
  await page.locator('#mobileEditor').fill('Texto móvil');
  await expect(page.locator('.sphere-text')).toContainText('Texto móvil');
  await expect(page.getByRole('button',{name:'Cambiar forma'})).toHaveCount(0);
});

test('@mobile activa copia, pega con doble toque y la desactiva',async({page})=>{
  const sphere=page.locator('.sphere').first(),box=await sphere.boundingBox();
  await page.touchscreen.tap(box.x+box.width/2,box.y+box.height/2);
  await page.getByRole('button',{name:'Copiar esfera'}).click();
  await expect(page.getByRole('button',{name:'Desactivar pegado'})).toBeVisible();
  await page.touchscreen.tap(340,600);await page.touchscreen.tap(340,600);
  await expect(page.locator('.sphere')).toHaveCount(2);
  await page.getByRole('button',{name:'Desactivar pegado'}).click();
  await expect(page.getByRole('button',{name:'Desactivar pegado'})).toBeHidden();
});

test('@mobile navega páginas horizontalmente y abre categorías desde arriba',async({page})=>{
  await gesture(page,{x:360,y:500},{x:70,y:510});
  await expect(page.locator('.sphere')).toHaveCount(0);
  await gesture(page,{x:200,y:180},{x:200,y:290});
  await expect(page.locator('#categoryBar')).toBeVisible();
});

test('@mobile selecciona por pulsación larga y redimensiona con pellizco',async({page})=>{
  const sphere=page.locator('.sphere').first(),before=await sphere.boundingBox();
  await touchSequence(page,[{type:'touchStart',points:[{x:10,y:500}],wait:700},{type:'touchMove',points:[{x:before.x+before.width+10,y:before.y+before.height+10}]},{type:'touchEnd'}]);
  await expect(sphere).toHaveClass(/selected/);
  const center={x:before.x+before.width/2,y:before.y+before.height/2};
  await touchSequence(page,[{type:'touchStart',points:[{id:1,x:center.x-25,y:center.y},{id:2,x:center.x+25,y:center.y}]},{type:'touchMove',points:[{id:1,x:center.x-55,y:center.y},{id:2,x:center.x+55,y:center.y}]},{type:'touchEnd'}]);
  const after=await sphere.boundingBox();expect(after.width).toBeGreaterThan(before.width);
  const viewport=page.viewportSize();expect(await page.evaluate(()=>window.visualViewport.scale)).toBe(1);expect(viewport.width).toBeGreaterThan(0);
});
