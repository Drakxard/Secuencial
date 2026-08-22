const STATE_FILE='esferas.json', BACKUP_KEY='esferas-respaldo-v1', SCROLL_KEY='esferas-scroll-v2', PAGE_KEY='esferas-pagina-v1', CATEGORY_KEY='esferas-categoria-v1', TEXT_SCALE_KEY='esferas-tamano-texto-v1', SIZE=168;
const board=document.querySelector('#board'), notice=document.querySelector('#folderNotice'), choose=document.querySelector('#chooseFolder'), errorText=document.querySelector('#folderError'), categoryBar=document.querySelector('#categoryBar'), categoryList=document.querySelector('#categoryList'), addCategory=document.querySelector('#addCategory'), mobileEditor=document.querySelector('#mobileEditor'), stopPaste=document.querySelector('#stopPaste'), progressState=document.querySelector('#progressState');
const nativeApp=Boolean(window.Capacitor?.isNativePlatform?.()),coarsePointer=navigator.maxTouchPoints>0||matchMedia('(pointer: coarse)').matches;
let directoryHandle=null, saveTimer=null, selectedId=null, editingId=null, selectedImageId=null, selectedArrowId=null, selectedIds=new Set(), selectedImageIds=new Set(), contracted=false, drag=null, imageDrag=null, imageResizeDrag=null, arrowDrag=null, connectorDrag=null, marquee=null, backgroundHold=null, elementHold=null, arrowHold=null, colorPalette=null, lastSphereClick=null, altNumericCode='', altKeyHeld=false;
let touchBackground=null,pinch=null,lastBackgroundTap=null,mobileSphereTapCandidate=null;
const touchPointers=new Map();
let mouse={x:innerWidth/2,y:innerHeight/2};
let copiedElement=null,elementPasteCount=0;
let history=[],historyIndex=-1,restoringHistory=false;
const caretPositions=new Map();
const selectionRanges=new Map();
let state={color:randomColor(),spheres:[]}, pages=[state], categories=[{name:'EO',pages}], currentCategory=0, currentPage=0, restoringScroll=false;
let categoryReorder=null,suppressCategoryClick=false;
let arrowMode=false;
let defaultFontScales=(()=>{try{const value=JSON.parse(localStorage.getItem(TEXT_SCALE_KEY));return{circle:Number.isFinite(value?.circle)?value.circle:1,square:Number.isFinite(value?.square)?value.square:1}}catch{return{circle:1,square:1}}})();

const progressStates=['pausa','duda','revision'];
function setArrowMode(enabled){arrowMode=Boolean(enabled);board.classList.toggle('arrow-mode',arrowMode)}
function setProgressState(name){
  const next=progressStates.includes(name)?name:'pausa';
  progressState.dataset.state=next;
  progressState.setAttribute('aria-label',`Estado: ${next}`);
  progressState.title=`Estado: ${next}`;
}
progressState.addEventListener('click',()=>setProgressState(progressStates[(progressStates.indexOf(progressState.dataset.state)+1)%progressStates.length]));

function normalizeDocument(value){
  const rawCategories=Array.isArray(value?.categories)?value.categories:[{name:'EO',pages:Array.isArray(value?.pages)?value.pages:Array.isArray(value?.spheres)?[value]:[]}];
  const normalizedCategories=rawCategories.map((category,index)=>{
    const validPages=(Array.isArray(category?.pages)?category.pages:[]).filter(page=>Array.isArray(page?.spheres)&&typeof page?.color==='string');
    validPages.forEach(page=>{if(!Array.isArray(page.arrows))page.arrows=[];if(!Array.isArray(page.images))page.images=[]});
    return{name:String(category?.name||`Categoría ${index+1}`),pages:validPages.length?validPages:[{color:randomColor(),spheres:[],arrows:[]}]};
  });
  return{categories:normalizedCategories.length?normalizedCategories:[{name:'EO',pages:[{color:randomColor(),spheres:[]}]}],updatedAt:value?.updatedAt??0};
}
function documentState(){return{categories,updatedAt:Math.max(0,...categories.flatMap(category=>category.pages.map(page=>page.updatedAt??0)))}}
function historySnapshot(){return{categories:structuredClone(categories),currentCategory,currentPage}}
function resetHistory(){history=[historySnapshot()];historyIndex=0}
function recordHistory(){
  if(restoringHistory)return;
  const snapshot=historySnapshot(),comparable=value=>JSON.stringify(value,(key,item)=>key==='updatedAt'?undefined:item),serialized=comparable(snapshot),current=history[historyIndex];
  if(current&&comparable(current)===serialized)return;
  history=history.slice(0,historyIndex+1);history.push(snapshot);if(history.length>100)history.shift();historyIndex=history.length-1;
}
function restoreHistory(direction){
  const next=historyIndex+direction;if(next<0||next>=history.length)return false;
  restoringHistory=true;historyIndex=next;
  const snapshot=structuredClone(history[historyIndex]);categories=snapshot.categories;
  currentCategory=Math.min(snapshot.currentCategory,categories.length-1);pages=categories[currentCategory].pages;
  currentPage=Math.min(snapshot.currentPage,pages.length-1);state=pages[currentPage];
  focusSphere(null);contracted=false;render();savePageIndex();localStorage.setItem(CATEGORY_KEY,String(currentCategory));saveBackup();clearTimeout(saveTimer);saveTimer=setTimeout(saveState,220);restoringHistory=false;return true;
}
function savedPageIndexes(){
  try{
    const value=JSON.parse(localStorage.getItem(PAGE_KEY));
    if(value&&typeof value==='object'&&!Array.isArray(value))return value;
    if(Number.isInteger(value)&&value>=0)return{0:value};
  }catch{}
  return{};
}
function savedPageIndex(){const value=Number(savedPageIndexes()[currentCategory]);return Number.isInteger(value)&&value>=0?value:0}
function savePageIndex(){const values=savedPageIndexes();values[currentCategory]=currentPage;localStorage.setItem(PAGE_KEY,JSON.stringify(values))}
function setDocument(value){
  const normalized=normalizeDocument(value);categories=normalized.categories;
  const savedCategory=Number(localStorage.getItem(CATEGORY_KEY));currentCategory=Number.isInteger(savedCategory)?Math.min(Math.max(0,savedCategory),categories.length-1):0;
  pages=categories[currentCategory].pages;
  currentPage=Math.min(savedPageIndex(),pages.length-1);state=pages[currentPage];
  removeEmptyHiddenPages();
}

function randomColor(){const row=Math.floor(Math.random()*8),col=Math.floor(Math.random()*16);return `hsl(${col*22.5} ${Math.max(55,92-row*5)}% ${Math.max(22,92-row*10)}%)`}
function textColorFor(color){return Number(color.match(/(\d+)%\)$/)?.[1]??60)<48?'#f8fafc':'#172033'}
function textColor(){return textColorFor(state.color)}
function sphereShape(sphere){return sphere?.shape==='square'?'square':'circle'}
function defaultFontScale(shape){return defaultFontScales[shape==='square'?'square':'circle']}
function setDefaultFontScale(shape,scale){defaultFontScales[shape==='square'?'square':'circle']=Math.max(.35,Math.min(4,scale??1));localStorage.setItem(TEXT_SCALE_KEY,JSON.stringify(defaultFontScales))}
function defaultArrowColor(color=state.color){
  const match=String(color).match(/hsl\(\s*([\d.]+)(?:deg)?\s+([\d.]+)%\s+([\d.]+)%\s*\)/i);
  if(!match)return '#475569';
  const[,hue,saturation,lightness]=match;
  return `hsl(${hue} ${Math.max(52,Number(saturation))}% ${Math.max(20,Math.min(42,Number(lightness)-28))}%)`;
}
function selected(){return state.spheres.find(s=>s.id===selectedId)}
function editableSelected(){const sphere=selected();return sphere?.id===editingId?sphere:null}
function images(){return state.images??(state.images=[])}
function rangeFor(sphere){const caret=Math.max(0,Math.min(sphere.text.length,caretPositions.get(sphere.id)??sphere.text.length));return selectionRanges.get(sphere.id)??{anchor:caret,focus:caret}}
function caretFor(sphere){return rangeFor(sphere).focus}
function setRange(sphere,anchor,focus=anchor){const limit=sphere.text.length,range={anchor:Math.max(0,Math.min(limit,anchor)),focus:Math.max(0,Math.min(limit,focus))};selectionRanges.set(sphere.id,range);caretPositions.set(sphere.id,range.focus)}
function arrows(){return state.arrows??(state.arrows=[])}
function focusSphere(id,edit=false){selectedArrowId=null;selectedImageId=null;selectedImageIds=new Set();selectedId=id;editingId=edit?id:null;selectedIds=new Set(id?[id]:[]);const sphere=selected();if(sphere){const shape=sphereShape(sphere);setDefaultFontScale(shape,sphere.fontScale??1);if(!caretPositions.has(id))setRange(sphere,sphere.text.length)}}
function focusImage(id){selectedArrowId=null;selectedId=null;editingId=null;selectedIds=new Set();selectedImageId=id;selectedImageIds=new Set(id?[id]:[])}
function removeSphere(id){state.spheres=state.spheres.filter(sphere=>sphere.id!==id);state.arrows=arrows().filter(arrow=>arrow.fromId!==id&&arrow.toId!==id);caretPositions.delete(id);selectionRanges.delete(id);selectedIds.delete(id);if(selectedId===id)selectedId=null;if(editingId===id)editingId=null}
function sphereSize(s){return SIZE*(s.scale??1)}
function sphereWidth(s){return s.shape==='square'?(s.width??sphereSize(s)):sphereSize(s)}
function sphereHeight(s){return s.shape==='square'?(s.height??sphereSize(s)):sphereSize(s)}
function spherePadding(s){return s.shape==='square'?8:Math.min(sphereWidth(s),sphereHeight(s))*.15}
function squareMinHeight(s){return Math.ceil(17*(s.fontScale??1)*1.25+spherePadding(s)*2+2)}
function position(index,s){const size=sphereSize(s);if(!contracted)return{x:s.x,y:s.y};const n=Math.min(index,8);return{x:Math.max(12,(innerWidth-size)/2)+n*3,y:Math.max(12,(innerHeight-size)/2)+n*3}}
function canvasHeight(){
  const sphereBottom=state.spheres.reduce((bottom,sphere)=>Math.max(bottom,sphere.y+sphereHeight(sphere)+Math.round(innerHeight*.7)),innerHeight);
  return Math.max(innerHeight*3,sphereBottom,images().reduce((bottom,image)=>Math.max(bottom,image.y+image.height+Math.round(innerHeight*.7)),innerHeight));
}

function borderPoint(sphere,x,y){
  const w=sphereWidth(sphere),h=sphereHeight(sphere),cx=sphere.x+w/2,cy=sphere.y+h/2,dx=x-cx,dy=y-cy;
  if(sphere.shape!=='square'){const length=Math.hypot(dx/(w/2),dy/(h/2))||1;return{x:cx+dx/length,y:cy+dy/length}}
  const scale=1/Math.max(Math.abs(dx)/(w/2),Math.abs(dy)/(h/2),.0001);return{x:cx+dx*scale,y:cy+dy*scale};
}
function imageBorderPoint(image,x,y){return{x:Math.max(image.x,Math.min(image.x+image.width,x)),y:Math.max(image.y,Math.min(image.y+image.height,y))}}
function arrowEndpoint(arrow,end){
  const sphere=state.spheres.find(item=>item.id===arrow[`${end}Id`]),image=images().find(item=>item.id===arrow[`${end}ImageId`]);
  if(!sphere&&!image)return{x:arrow[`${end}X`],y:arrow[`${end}Y`]};
  const otherEnd=end==='from'?'to':'from',otherSphere=state.spheres.find(item=>item.id===arrow[`${otherEnd}Id`]),otherImage=images().find(item=>item.id===arrow[`${otherEnd}ImageId`]);
  const target=otherSphere?{x:otherSphere.x+sphereWidth(otherSphere)/2,y:otherSphere.y+sphereHeight(otherSphere)/2}:otherImage?{x:otherImage.x+otherImage.width/2,y:otherImage.y+otherImage.height/2}:{x:arrow[`${otherEnd}X`],y:arrow[`${otherEnd}Y`]};
  if(image){const anchor=arrow[`${end}ImageAnchor`];return anchor?{x:image.x+anchor.x*image.width,y:image.y+anchor.y*image.height}:imageBorderPoint(image,target.x,target.y)}
  const anchor=arrow[`${end}Anchor`];if(anchor)return{x:sphere.x+anchor.x*sphereWidth(sphere),y:sphere.y+anchor.y*sphereHeight(sphere)};
  return borderPoint(sphere,target.x,target.y);
}
function localAnchor(sphere,point){return{x:(point.x-sphere.x)/sphereWidth(sphere),y:(point.y-sphere.y)/sphereHeight(sphere)}}
function localImageAnchor(image,point){return{x:(point.x-image.x)/image.width,y:(point.y-image.y)/image.height}}
function nearbyImageAt(x,y,excludeId=null,padding=22){
  let best=null,bestDistance=Infinity;
  images().forEach(image=>{if(image.id===excludeId||x<image.x-padding||x>image.x+image.width+padding||y<image.y-padding||y>image.y+image.height+padding)return;const distance=Math.hypot(x-(image.x+image.width/2),y-(image.y+image.height/2));if(distance<bestDistance){best=image;bestDistance=distance}});
  return best;
}
function nearbySphereAt(x,y,excludeId=null,padding=34){
  let best=null,bestDistance=Infinity;
  state.spheres.forEach(sphere=>{
    if(sphere.id===excludeId)return;
    const w=sphereWidth(sphere),h=sphereHeight(sphere),cx=sphere.x+w/2,cy=sphere.y+h/2,dx=x-cx,dy=y-cy;
    const inside=sphere.shape==='square'?x>=sphere.x-padding&&x<=sphere.x+w+padding&&y>=sphere.y-padding&&y<=sphere.y+h+padding:Math.hypot(dx/(w/2+padding),dy/(h/2+padding))<=1;
    const distance=Math.hypot(dx,dy);if(inside&&distance<bestDistance){best=sphere;bestDistance=distance}
  });
  return best;
}
function shortenArrowEnd(from,to,distance=7){
  const dx=to.x-from.x,dy=to.y-from.y,length=Math.hypot(dx,dy)||1;
  return{x:to.x-dx/length*distance,y:to.y-dy/length*distance};
}
function curvedArrowPath(from,to){
  return`M ${from.x} ${from.y} L ${to.x} ${to.y}`;
}
function renderArrows(){
  const ns='http://www.w3.org/2000/svg',svg=document.createElementNS(ns,'svg');svg.classList.add('arrows-layer');
  svg.style.setProperty('--arrow-color',state.arrowColor??defaultArrowColor());
  const defs=document.createElementNS(ns,'defs'),marker=document.createElementNS(ns,'marker'),tip=document.createElementNS(ns,'path');
  marker.setAttribute('id','arrow-tip');marker.setAttribute('viewBox','0 0 14 14');marker.setAttribute('refX','11.5');marker.setAttribute('refY','7');marker.setAttribute('markerWidth','2.7');marker.setAttribute('markerHeight','2.7');marker.setAttribute('orient','auto');tip.setAttribute('d','M 2 2 L 12 7 L 2 12');tip.setAttribute('fill','none');tip.setAttribute('stroke','context-stroke');tip.setAttribute('stroke-width','3.4');tip.setAttribute('stroke-linecap','round');tip.setAttribute('stroke-linejoin','round');marker.append(tip);defs.append(marker);svg.append(defs);
  arrows().forEach(arrow=>{const borderFrom=arrowEndpoint(arrow,'from'),borderTo=arrowEndpoint(arrow,'to'),from=shortenArrowEnd(borderTo,borderFrom,6),to=shortenArrowEnd(borderFrom,borderTo,10),group=document.createElementNS(ns,'g'),hit=document.createElementNS(ns,'path'),line=document.createElementNS(ns,'path'),d=curvedArrowPath(from,to);group.classList.add('arrow-item');if(arrow.id===selectedArrowId)group.classList.add('selected');group.dataset.arrowId=arrow.id;hit.classList.add('arrow-hit');line.classList.add('arrow-line');hit.setAttribute('d',d);line.setAttribute('d',d);line.setAttribute('marker-end','url(#arrow-tip)');group.append(hit,line);svg.append(group)});
  if(connectorDrag){const borderFrom=connectorDrag.from,rawTo=connectorDrag.to,from=shortenArrowEnd(rawTo,borderFrom,6),to=shortenArrowEnd(borderFrom,rawTo,7),preview=document.createElementNS(ns,'path');preview.classList.add('arrow-line','preview');preview.setAttribute('d',curvedArrowPath(from,to));preview.setAttribute('marker-end','url(#arrow-tip)');svg.append(preview)}
  board.append(svg);
}
function updateRenderedArrows(){
  arrows().forEach(arrow=>{
    const group=board.querySelector(`.arrow-item[data-arrow-id="${arrow.id}"]`);if(!group)return;
    const borderFrom=arrowEndpoint(arrow,'from'),borderTo=arrowEndpoint(arrow,'to'),from=shortenArrowEnd(borderTo,borderFrom,6),to=shortenArrowEnd(borderFrom,borderTo,10),path=curvedArrowPath(from,to);
    group.querySelectorAll('path').forEach(item=>item.setAttribute('d',path));
  });
}

function openPosition(size){
  const margin=18,radius=size/2,cursorGap=20,elementGap=12;
  const minX=margin,maxX=Math.max(minX,innerWidth-size-margin),minY=scrollY+margin;
  const visibleMaxY=Math.max(minY,scrollY+innerHeight-size-margin),candidates=[],seen=new Set();
  const addCandidate=(x,y)=>{
    if(x<minX||x>maxX||y<minY)return;
    const key=`${Math.round(x)},${Math.round(y)}`;if(seen.has(key))return;
    seen.add(key);candidates.push({x,y});
  };
  const isFree=({x,y})=>{
    const cx=x+radius,cy=y+radius;
    if(Math.hypot(cx-mouse.x,cy-mouse.y)<radius+cursorGap)return false;
    return state.spheres.every(item=>{
      const width=sphereWidth(item),height=sphereHeight(item);
      if(item.shape==='square'){
        const nearestX=Math.max(item.x,Math.min(cx,item.x+width)),nearestY=Math.max(item.y,Math.min(cy,item.y+height));
        return Math.hypot(cx-nearestX,cy-nearestY)>=radius+elementGap;
      }
      const itemRadius=Math.max(width,height)/2,itemX=item.x+width/2,itemY=item.y+height/2;
      return Math.hypot(cx-itemX,cy-itemY)>=radius+itemRadius+elementGap;
    });
  };

  // Primero intenta ponerlo realmente a la par del clic; derecha e izquierda
  // tienen prioridad para que los elementos queden alineados naturalmente.
  addCandidate(mouse.x+cursorGap,mouse.y-radius);
  addCandidate(mouse.x-size-cursorGap,mouse.y-radius);
  addCandidate(mouse.x-radius,mouse.y+cursorGap);
  addCandidate(mouse.x-radius,mouse.y-size-cursorGap);
  for(const candidate of candidates)if(isFree(candidate))return candidate;

  // Si esos cuatro lugares están ocupados, busca desde el cursor hacia afuera.
  // La grilla está anclada al clic, no a la página, para no saltar a una punta.
  const step=18,maxDistance=Math.hypot(innerWidth,innerHeight*2);
  for(let ring=1;ring*step<=maxDistance;ring++){
    const offset=ring*step;
    for(let n=-ring;n<=ring;n++){
      const cross=n*step;
      addCandidate(mouse.x+offset-radius,mouse.y+cross-radius);
      addCandidate(mouse.x-offset-radius,mouse.y+cross-radius);
      if(Math.abs(n)<ring){
        addCandidate(mouse.x+cross-radius,mouse.y+offset-radius);
        addCandidate(mouse.x+cross-radius,mouse.y-offset-radius);
      }
    }
    const ringCandidates=candidates.splice(0);
    ringCandidates.sort((a,b)=>Math.hypot(a.x+radius-mouse.x,a.y+radius-mouse.y)-Math.hypot(b.x+radius-mouse.x,b.y+radius-mouse.y));
    for(const candidate of ringCandidates)if(isFree(candidate))return candidate;
    if(mouse.y+offset-radius>visibleMaxY&&offset>innerHeight)break;
  }
  // En una página excepcionalmente llena, continúa cerca de la misma columna
  // hacia abajo hasta encontrar un lugar válido, sin superponer por fuerza.
  const fallback={x:Math.max(minX,Math.min(maxX,mouse.x+cursorGap)),y:Math.max(minY,mouse.y+cursorGap)};
  while(!isFree(fallback))fallback.y+=size+elementGap;
  return fallback;
}

function closingBrace(source,open){
  if(source[open]!=='{')return -1;
  let depth=1;
  for(let i=open+1;i<source.length;i++){
    if(source[i]==='{')depth++;
    else if(source[i]==='}'&&!--depth)return i;
  }
  return -1;
}

function appendMathText(parent,source,bullets=false,startsLine=true,showTrailingBullet=false){
  let plain='';
  const symbols={alpha:'α',beta:'β',gamma:'γ',delta:'δ',theta:'θ',lambda:'λ',mu:'μ',pi:'π',sigma:'σ',phi:'φ',omega:'ω',Delta:'Δ',Sigma:'Σ',Omega:'Ω',infty:'∞',sum:'∑',int:'∫',sqrt:'√',times:'×',cdot:'·',neq:'≠',le:'≤',ge:'≥',approx:'≈'};
  const flush=()=>{if(plain){parent.append(document.createTextNode(plain.replace(/\\([A-Za-z]+)/g,(match,name)=>symbols[name]??match)));plain=''}};
  for(let i=0;i<source.length;i++){
    if(bullets&&startsLine){
      let level=0;while(source[i+level]==='\t')level++;
      const marks=['•','◦','▪'],mark=level?marks[level-1]??'':'';
      plain+='    '.repeat(Math.max(0,level-1))+(mark?`${mark}  `:'');
      i+=level;if(i>=source.length)break;startsLine=false;
    }
    const marker=source[i];
    if(marker==='\n'){plain+='\n';startsLine=true;continue}
    if(marker==='{'){
      const numeratorClose=closingBrace(source,i),slash=numeratorClose+1,denominatorOpen=slash+1;
      if(numeratorClose>i+1&&source[slash]==='/'&&source[denominatorOpen]==='{'){
        const denominatorClose=closingBrace(source,denominatorOpen);
        if(denominatorClose>denominatorOpen+1){
          flush();
          const fraction=document.createElement('span'),top=document.createElement('span'),bottom=document.createElement('span');
          fraction.className='math-fraction';top.className='fraction-top';bottom.className='fraction-bottom';
          appendMathText(top,source.slice(i+1,numeratorClose));
          appendMathText(bottom,source.slice(denominatorOpen+1,denominatorClose));
          fraction.append(top,bottom);parent.append(fraction);i=denominatorClose;continue;
        }
      }
    }
    if(marker==='/'){
      const numeratorMatch=plain.match(/\{([^{}]+)\}$/),close=source[i+1]==='{'?source.indexOf('}',i+2):-1;
      if(numeratorMatch&&close>i+2){
        const numerator=numeratorMatch[1],denominator=source.slice(i+2,close);
        plain=plain.slice(0,-numeratorMatch[0].length);flush();
        const fraction=document.createElement('span'),top=document.createElement('span'),bottom=document.createElement('span');
        fraction.className='math-fraction';top.className='fraction-top';bottom.className='fraction-bottom';
        appendMathText(top,numerator);appendMathText(bottom,denominator);fraction.append(top,bottom);parent.append(fraction);i=close;continue;
      }
    }
    if((marker!=='_'&&marker!=='^')||i+1>=source.length){plain+=marker;continue}
    let value='';
    if(source[i+1]==='{'){
      let depth=1,j=i+2;
      for(;j<source.length&&depth;j++){
        if(source[j]==='{')depth++;
        else if(source[j]==='}')depth--;
        if(depth)value+=source[j];
      }
      if(depth){plain+=marker;continue}
      i=j-1;
    }else{value=source[++i]}
    flush();
    const script=document.createElement(marker==='_'?'sub':'sup');
    appendMathText(script,value,false,false);parent.append(script);
  }
  flush();
}

function fitSquareToText(sphere,el,text){
  if(sphere.shape!=='square')return;
  const padding=spherePadding(sphere),textStyle=getComputedStyle(text),measure=text.cloneNode(true);
  measure.querySelectorAll('.text-caret').forEach(caret=>caret.remove());
  Object.assign(measure.style,{position:'fixed',left:'-10000px',top:'0',width:'max-content',minWidth:'0',maxWidth:'none',height:'max-content',visibility:'hidden',whiteSpace:'pre',font:textStyle.font,lineHeight:textStyle.lineHeight,letterSpacing:textStyle.letterSpacing,pointerEvents:'none'});
  document.body.append(measure);
  const bounds=measure.getBoundingClientRect();
  const nextWidth=Math.max(90,Math.ceil(Math.max(bounds.width,measure.scrollWidth)+padding*2+2));
  const nextHeight=Math.max(squareMinHeight(sphere),Math.ceil(Math.max(bounds.height,measure.scrollHeight)+padding*2+2));
  measure.remove();
  const changed=Math.abs(nextWidth-sphereWidth(sphere))>.5||Math.abs(nextHeight-sphereHeight(sphere))>.5;
  if(!changed)return;
  sphere.width=nextWidth;sphere.height=nextHeight;
  el.style.setProperty('--sphere-width',`${nextWidth}px`);el.style.setProperty('--sphere-height',`${nextHeight}px`);
  board.style.height=`${canvasHeight()}px`;updateRenderedArrows();scheduleSave();
}

function render(){
  board.replaceChildren();
  board.style.height=`${canvasHeight()}px`;
  renderArrows();
  images().forEach((image,index)=>{
    const frame=document.createElement('figure'),content=document.createElement('img');
    frame.className=`board-image${selectedImageIds.has(image.id)?' selected':''}${image.id===selectedImageId&&selectedImageIds.size===1?' resizable':''}`;frame.dataset.imageId=image.id;
    Object.assign(frame.style,{left:`${image.x}px`,top:`${image.y}px`,width:`${image.width}px`,height:`${image.height}px`,zIndex:selectedImageIds.has(image.id)?state.spheres.length+images().length+4:index+1});
    content.src=image.src;content.alt=image.name||'Imagen pegada';content.draggable=false;frame.append(content);
    ['nw','n','ne','e','se','s','sw','w'].forEach(direction=>{const handle=document.createElement('span');handle.className=`image-handle ${direction}`;handle.setAttribute('aria-hidden','true');frame.append(handle)});
    board.append(frame);
  });
  state.spheres.forEach((sphere,index)=>{
    const el=document.createElement('article'),pos=position(index,sphere),text=document.createElement('div');
    el.className=`sphere${sphere.shape==='square'?' square':''}${selectedIds.has(sphere.id)?' selected':''}${sphere.id===editingId?' focused':''}`; el.dataset.id=sphere.id;
    Object.assign(el.style,{left:`${pos.x}px`,top:`${pos.y}px`,zIndex:sphere.id===selectedId?state.spheres.length+2:index+1});
    el.style.setProperty('--sphere-color',state.color); el.style.setProperty('--sphere-text',textColor()); el.style.setProperty('--sphere-width',`${sphereWidth(sphere)}px`);el.style.setProperty('--sphere-height',`${sphereHeight(sphere)}px`); el.style.setProperty('--sphere-padding',`${spherePadding(sphere)}px`);el.style.setProperty('--sphere-font-size',`${17*(sphere.fontScale??1)}px`);
    text.className='sphere-text';
    if(sphere.id===editingId){
      const range=rangeFor(sphere),start=Math.min(range.anchor,range.focus),end=Math.max(range.anchor,range.focus),caret=document.createElement('span'),highlight=document.createElement('span');caret.className='text-caret';highlight.className='selected-text';highlight.textContent=sphere.text.slice(start,end);
      const bullets=sphere.shape==='square';
      highlight.replaceChildren();appendMathText(highlight,sphere.text.slice(start,end),bullets,start===0||sphere.text[start-1]==='\n');
      appendMathText(text,sphere.text.slice(0,start),bullets,true,false);
      if(range.focus===start)text.append(caret,highlight);else text.append(highlight,caret);
      appendMathText(text,sphere.text.slice(end),bullets,end===0||sphere.text[end-1]==='\n');
      if(!sphere.text){const placeholder=document.createElement('span');placeholder.className='text-placeholder';placeholder.textContent='Escribe…';text.append(placeholder)}
    }else{if(sphere.text)appendMathText(text,sphere.text,sphere.shape==='square',true,false);else{text.textContent='Escribe…';text.style.opacity='.48'}}
    el.append(text);
    if(coarsePointer&&selectedIds.size===1&&selectedIds.has(sphere.id)){
      const tools=document.createElement('div'),copy=document.createElement('button');tools.className='sphere-tools';
      copy.type='button';copy.className='sphere-tool';copy.title='Copiar esfera';copy.setAttribute('aria-label','Copiar esfera');copy.textContent='⧉';
      copy.addEventListener('pointerdown',event=>event.stopPropagation());
      copy.addEventListener('click',()=>{copiedElement=structuredClone(sphere);elementPasteCount=0;stopPaste.hidden=false});
      tools.append(copy);el.append(tools);
    }
    board.append(el);
    fitSquareToText(sphere,el,text);
  });
}

function openMobileEditor(sphere,caret=sphere.text.length){
  editingId=sphere.id;setRange(sphere,caret);mobileEditor.value=sphere.text;mobileEditor.focus({preventScroll:true});
  mobileEditor.setSelectionRange(caret,caret);render();
}
function syncMobileEditor(){
  const sphere=editableSelected();if(!sphere)return;
  sphere.text=mobileEditor.value;setRange(sphere,mobileEditor.selectionStart??sphere.text.length,mobileEditor.selectionEnd??sphere.text.length);render();scheduleSave();
}
mobileEditor.addEventListener('input',syncMobileEditor);
mobileEditor.addEventListener('select',()=>{const sphere=editableSelected();if(sphere){setRange(sphere,mobileEditor.selectionStart??0,mobileEditor.selectionEnd??0);render()}});
stopPaste.addEventListener('pointerdown',event=>event.stopPropagation());
stopPaste.addEventListener('click',()=>{copiedElement=null;elementPasteCount=0;stopPaste.hidden=true});

function pasteCopiedElementAt(point){
  if(!copiedElement)return false;
  elementPasteCount++;
  const copy={...structuredClone(copiedElement),id:crypto.randomUUID()},width=sphereWidth(copy),height=sphereHeight(copy);
  copy.x=Math.max(0,Math.min(innerWidth-width,point.x-width/2));copy.y=Math.max(0,point.y-height/2);
  state.spheres.push(copy);focusSphere(copy.id,false);render();scheduleSave();return true;
}

function imageResizeDirection(frame,event){
  const rect=frame.getBoundingClientRect(),x=(event.clientX-rect.left)/rect.width,y=(event.clientY-rect.top)/rect.height;
  const horizontal=x<=.2?'w':x>=.8?'e':'',vertical=y<=.2?'n':y>=.8?'s':'';
  return vertical+horizontal;
}

function fileDataUrl(file){return new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=()=>reject(reader.error);reader.readAsDataURL(file)})}
function naturalImageSize(src){return new Promise((resolve,reject)=>{const image=new Image();image.onload=()=>resolve({width:image.naturalWidth,height:image.naturalHeight});image.onerror=reject;image.src=src})}
async function pasteImage(file,targetState,point){
  try{
    const src=await fileDataUrl(file),natural=await naturalImageSize(src),maxWidth=Math.min(innerWidth*.62,760),maxHeight=innerHeight*.68,scale=Math.min(1,maxWidth/natural.width,maxHeight/natural.height),width=Math.max(48,Math.round(natural.width*scale)),height=Math.max(48,Math.round(natural.height*scale));
    const image={id:crypto.randomUUID(),src,name:file.name||'Imagen pegada',x:Math.max(0,Math.min(innerWidth-width,point.x-width/2)),y:Math.max(0,point.y-height/2),width,height};
    (targetState.images??(targetState.images=[])).push(image);
    if(state===targetState){focusImage(image.id);render()}
    targetState.updatedAt=Date.now();recordHistory();saveBackup();clearTimeout(saveTimer);saveTimer=setTimeout(saveState,220);
  }catch(error){console.error('No se pudo pegar la imagen.',error)}
}

function escapeXml(value){return String(value).replace(/[&<>"']/g,character=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[character]))}
function svgNumber(value){return Math.round(Number(value)*100)/100}
function exportTextHtml(sphere){
  const text=document.createElement('div');text.setAttribute('xmlns','http://www.w3.org/1999/xhtml');text.className=`export-text ${sphere.shape==='square'?'square':'circle'}`;
  text.style.fontSize=`${svgNumber(17*(sphere.fontScale??1))}px`;text.style.color=textColor();
  if(sphere.text)appendMathText(text,sphere.text,sphere.shape==='square',true,false);
  return new XMLSerializer().serializeToString(text);
}
function exportShape(sphere){
  const x=svgNumber(sphere.x),y=svgNumber(sphere.y),width=svgNumber(sphereWidth(sphere)),height=svgNumber(sphereHeight(sphere)),padding=svgNumber(spherePadding(sphere)),shape=sphere.shape==='square'
    ?`<rect x="${x}" y="${y}" width="${width}" height="${height}" rx="18" ry="18"`:`<ellipse cx="${svgNumber(sphere.x+sphereWidth(sphere)/2)}" cy="${svgNumber(sphere.y+sphereHeight(sphere)/2)}" rx="${svgNumber(sphereWidth(sphere)/2)}" ry="${svgNumber(sphereHeight(sphere)/2)}"`;
  const textX=svgNumber(sphere.x+padding),textY=svgNumber(sphere.y+padding),textWidth=Math.max(1,svgNumber(sphereWidth(sphere)-padding*2)),textHeight=Math.max(1,svgNumber(sphereHeight(sphere)-padding*2));
  return `<g filter="url(#sphere-shadow)">${shape} fill="${escapeXml(state.color)}"/>${shape} fill="url(#sphere-shade)"/></g><foreignObject x="${textX}" y="${textY}" width="${textWidth}" height="${textHeight}">${exportTextHtml(sphere)}</foreignObject>`;
}
function exportArrow(arrow){
  const borderFrom=arrowEndpoint(arrow,'from'),borderTo=arrowEndpoint(arrow,'to'),from=shortenArrowEnd(borderTo,borderFrom,6),to=shortenArrowEnd(borderFrom,borderTo,10),path=curvedArrowPath(from,to);
  return `<path d="${escapeXml(path)}" fill="none" stroke="${escapeXml(state.arrowColor??'#202020')}" stroke-width="9" stroke-linecap="round" stroke-linejoin="round" marker-end="url(#export-arrow-tip)"/>`;
}
function exportImage(image){return `<image x="${svgNumber(image.x)}" y="${svgNumber(image.y)}" width="${svgNumber(image.width)}" height="${svgNumber(image.height)}" href="${escapeXml(image.src)}" preserveAspectRatio="none"/>`}
function buildExportSvg(){
  const width=Math.max(1,Math.round(innerWidth)),height=Math.max(1,Math.round(canvasHeight())),arrowColor=escapeXml(state.arrowColor??'#202020');
  const arrowMarkup=arrows().map(exportArrow).join(''),contentMarkup=[...images().map((image,index)=>({z:index+1,order:0,markup:exportImage(image)})),...state.spheres.map((sphere,index)=>({z:index+1,order:1,markup:exportShape(sphere)}))].sort((a,b)=>a.z-b.z||a.order-b.order).map(item=>item.markup).join('');
  const svg=`<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <defs>
    <linearGradient id="blob-pink" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#fbcfe8"/><stop offset="1" stop-color="#f472b6"/></linearGradient>
    <linearGradient id="blob-blue" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#bae6fd"/><stop offset="1" stop-color="#38bdf8"/></linearGradient>
    <linearGradient id="blob-violet" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#ddd6fe"/><stop offset="1" stop-color="#a78bfa"/></linearGradient>
    <radialGradient id="sphere-shade" cx="65%" cy="72%" r="62%"><stop stop-color="#000" stop-opacity=".16"/><stop offset=".54" stop-color="#000" stop-opacity="0"/></radialGradient>
    <filter id="background-blur" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="90"/></filter>
    <filter id="sphere-shadow" x="-30%" y="-30%" width="160%" height="180%"><feDropShadow dx="0" dy="17" stdDeviation="17" flood-color="#334155" flood-opacity=".2"/></filter>
    <marker id="export-arrow-tip" viewBox="0 0 14 14" refX="11.5" refY="7" markerWidth="2.7" markerHeight="2.7" orient="auto"><path d="M 2 2 L 12 7 L 2 12" fill="none" stroke="${arrowColor}" stroke-width="3.4" stroke-linecap="round" stroke-linejoin="round"/></marker>
    <style><![CDATA[
      .export-text{box-sizing:border-box;width:100%;height:100%;margin:0;display:flex;align-items:center;justify-content:center;font-family:Inter,ui-rounded,system-ui,-apple-system,"Segoe UI",sans-serif;line-height:1.25;text-align:center;white-space:pre-wrap;overflow-wrap:anywhere}
      .export-text.square{display:block;text-align:left;white-space:pre;overflow-wrap:normal}
      .export-text sub,.export-text sup{font-size:.7em;line-height:0}.export-text sub{vertical-align:-.35em}.export-text sup{vertical-align:.55em}
      .math-fraction{display:inline-flex;flex-direction:column;align-items:stretch;margin:0 .16em;vertical-align:middle;line-height:1.05;text-align:center}.fraction-top{padding:0 .16em .08em;border-bottom:1.5px solid currentColor}.fraction-bottom{padding:.08em .16em 0}
    ]]></style>
  </defs>
  <rect width="${width}" height="${height}" fill="#f8fafc"/>
  <g filter="url(#background-blur)" opacity=".6">
    <ellipse cx="${svgNumber(width*.07)}" cy="${svgNumber(height*.08)}" rx="${svgNumber(Math.max(200,width*.16))}" ry="${svgNumber(Math.max(200,height*.07))}" fill="url(#blob-pink)"/>
    <ellipse cx="${svgNumber(width*.94)}" cy="${svgNumber(height*.91)}" rx="${svgNumber(Math.max(175,width*.14))}" ry="${svgNumber(Math.max(175,height*.065))}" fill="url(#blob-blue)"/>
    <ellipse cx="${svgNumber(width*.78)}" cy="${svgNumber(height*.48)}" rx="${svgNumber(Math.max(150,width*.12))}" ry="${svgNumber(Math.max(150,height*.055))}" fill="url(#blob-violet)"/>
  </g>
  ${arrowMarkup}${contentMarkup}
</svg>`;
  return svg;
}
function exportSvg(){
  const svg=buildExportSvg(),safeCategory=(categories[currentCategory]?.name||`categoria-${currentCategory+1}`).trim().replace(/[<>:"/\\|?*\u0000-\u001f]/g,'-').replace(/\s+/g,'-')||`categoria-${currentCategory+1}`,blob=new Blob([svg],{type:'image/svg+xml;charset=utf-8'}),url=URL.createObjectURL(blob),link=document.createElement('a');
  link.href=url;link.download=`${safeCategory}-pagina-${currentPage+1}.svg`;document.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);
}

function addSphere(selectSphere=true,shape='circle',edit=false){
  contracted=false;
  const place=openPosition(SIZE);
  const normalizedShape=shape==='square'?'square':'circle',sphere={id:crypto.randomUUID(),text:'',shape:normalizedShape,fontScale:defaultFontScale(normalizedShape),scale:1,x:place.x,y:place.y};
  state.spheres.push(sphere);
  if(selectSphere){focusSphere(sphere.id,edit);setRange(sphere,0)}else focusSphere(null);
  contracted=false; render(); scheduleSave();return sphere;
}

function isConnectorBorder(sphere,event,el){
  const rect=el.getBoundingClientRect(),x=event.clientX-rect.left,y=event.clientY-rect.top,w=rect.width,h=rect.height;
  if(sphere.shape!=='square'){const radius=Math.hypot((x-w/2)/(w/2),(y-h/2)/(h/2));return radius>=.8&&radius<=1.08}
  return x<w*.1||x>w*.9||y<h*.1||y>h*.9;
}

function closeColorPalette(){colorPalette?.restorePreview?.();colorPalette?.remove();colorPalette=null}
function openColorPalette(sphere,forArrows=false){
  closeColorPalette();
  const palette=document.createElement('div');palette.className='color-palette';palette.setAttribute('aria-label','Color de los elementos');
  const originalColor=forArrows?(state.arrowColor??defaultArrowColor()):state.color;
  const previewColor=color=>{
    if(forArrows)board.querySelector('.arrows-layer')?.style.setProperty('--arrow-color',color);
    else board.querySelectorAll('.sphere').forEach(item=>{item.style.setProperty('--sphere-color',color);item.style.setProperty('--sphere-text',textColorFor(color))});
  };
  palette.restorePreview=()=>previewColor(originalColor);
  for(let row=0;row<8;row++)for(let col=0;col<16;col++){
    const color=`hsl(${col*22.5} ${Math.max(55,92-row*5)}% ${Math.max(22,92-row*10)}%)`,swatch=document.createElement('button');
    swatch.type='button';swatch.className='color-swatch';swatch.style.background=color;swatch.title=color;
    swatch.addEventListener('pointerdown',event=>event.stopPropagation());
    swatch.addEventListener('pointerenter',()=>previewColor(color));
    swatch.addEventListener('click',event=>{event.stopPropagation();if(forArrows)state.arrowColor=color;else state.color=color;palette.restorePreview=null;closeColorPalette();render();scheduleSave()});
    palette.append(swatch);
  }
  palette.addEventListener('pointerleave',()=>previewColor(originalColor));
  board.append(palette);colorPalette=palette;
  const width=palette.offsetWidth,height=palette.offsetHeight,gap=12,itemWidth=sphere?sphereWidth(sphere):0;
  let left=sphere?sphere.x+itemWidth+gap:mouse.x+gap;if(left+width>innerWidth-8)left=Math.max(8,(sphere?sphere.x:mouse.x)-width-gap);
  const anchorY=sphere?sphere.y:mouse.y,top=Math.max(scrollY+8,Math.min(anchorY,scrollY+innerHeight-height-8));
  Object.assign(palette.style,{left:`${left}px`,top:`${top}px`});
}

function type(event){
  const sphere=editableSelected(); if(!sphere||event.ctrlKey||event.metaKey||event.altKey)return false;
  if(!sphere.text&&event.key==='Backspace'){
    if(coarsePointer)return true;
    removeSphere(sphere.id);render();scheduleSave();return true;
  }
  const range=rangeFor(sphere),start=Math.min(range.anchor,range.focus),end=Math.max(range.anchor,range.focus),hadSelection=start!==end;let caret=start;
  if(hadSelection)sphere.text=sphere.text.slice(0,start)+sphere.text.slice(end);
  if((event.key==='Backspace'||event.key==='Delete')&&hadSelection){}
  else if(event.key==='Backspace'){if(!caret)return true;sphere.text=sphere.text.slice(0,caret-1)+sphere.text.slice(caret);caret--}
  else if(event.key==='Delete'){if(caret>=sphere.text.length)return true;sphere.text=sphere.text.slice(0,caret)+sphere.text.slice(caret+1)}
  else if(event.key==='Enter'){
    const lineStart=sphere.text.lastIndexOf('\n',caret-1)+1;
    const indent=sphere.shape==='square'?(sphere.text.slice(lineStart).match(/^\t+/)?.[0]??''):'';
    sphere.text=sphere.text.slice(0,caret)+'\n'+indent+sphere.text.slice(caret);caret+=1+indent.length;
  }
  else if(event.key.length===1){sphere.text=sphere.text.slice(0,caret)+event.key+sphere.text.slice(caret);caret++}
  else return false;
  setRange(sphere,caret);
  render(); scheduleSave(); return true;
}

function moveCaretByVisibleRow(sphere,caret,direction){
  const visibleText=board.querySelector(`[data-id="${sphere.id}"] .sphere-text`);if(!visibleText||!sphere.text)return caret;
  const style=getComputedStyle(visibleText),measure=document.createElement('div'),textNode=document.createTextNode(sphere.text);
  Object.assign(measure.style,{position:'fixed',left:'0',top:'0',width:`${visibleText.clientWidth}px`,height:'auto',padding:'0',margin:'0',visibility:'hidden',pointerEvents:'none',whiteSpace:'pre-wrap',overflowWrap:'anywhere',textAlign:style.textAlign,font:style.font,lineHeight:style.lineHeight,letterSpacing:style.letterSpacing});
  measure.append(textNode);document.body.append(measure);
  const points=[];
  for(let index=0;index<=sphere.text.length;index++){
    const range=document.createRange();range.setStart(textNode,index);range.collapse(true);let rect=range.getBoundingClientRect();
    if(!rect.height&&index<sphere.text.length){range.setEnd(textNode,index+1);rect=range.getBoundingClientRect()}
    if(!rect.height&&index>0){range.setStart(textNode,index-1);rect=range.getBoundingClientRect();points.push({index,x:rect.right,y:rect.top});continue}
    points.push({index,x:rect.left,y:rect.top});
  }
  measure.remove();
  const current=points[caret],rows=[];
  for(const point of points){let row=rows.find(item=>Math.abs(item.y-point.y)<2);if(!row){row={y:point.y,points:[]};rows.push(row)}row.points.push(point)}
  rows.sort((a,b)=>a.y-b.y);const rowIndex=rows.findIndex(row=>Math.abs(row.y-current.y)<2),target=rows[rowIndex+direction];
  if(!target)return caret;
  return target.points.reduce((best,point)=>Math.abs(point.x-current.x)<Math.abs(best.x-current.x)?point:best).index;
}

function caretFromPoint(sphere,clientX,clientY){
  const visibleText=board.querySelector(`[data-id="${sphere.id}"] .sphere-text`);if(!visibleText||!sphere.text)return 0;
  const nativeCaret=document.caretPositionFromPoint?.(clientX,clientY),nativeRange=nativeCaret?null:document.caretRangeFromPoint?.(clientX,clientY),node=nativeCaret?.offsetNode??nativeRange?.startContainer,offset=nativeCaret?.offset??nativeRange?.startOffset;
  if(node&&visibleText.contains(node)){
    const range=document.createRange();range.setStart(visibleText,0);range.setEnd(node,offset);
    const position=range.toString().length;if(Number.isFinite(position))return Math.max(0,Math.min(sphere.text.length,position));
  }
  const rect=visibleText.getBoundingClientRect(),style=getComputedStyle(visibleText),measure=document.createElement('div'),textNode=document.createTextNode(sphere.text);
  Object.assign(measure.style,{position:'fixed',left:`${rect.left}px`,top:`${rect.top}px`,width:`${visibleText.clientWidth}px`,height:'auto',padding:'0',margin:'0',visibility:'hidden',pointerEvents:'none',whiteSpace:'pre-wrap',overflowWrap:'anywhere',textAlign:style.textAlign,font:style.font,lineHeight:style.lineHeight,letterSpacing:style.letterSpacing});
  measure.append(textNode);document.body.append(measure);let best={index:0,distance:Infinity};
  for(let index=0;index<=sphere.text.length;index++){
    const range=document.createRange();range.setStart(textNode,index);range.collapse(true);let point=range.getBoundingClientRect();
    if(!point.height&&index<sphere.text.length){range.setEnd(textNode,index+1);point=range.getBoundingClientRect()}
    if(!point.height&&index>0){range.setStart(textNode,index-1);point=range.getBoundingClientRect();point={left:point.right,top:point.top,height:point.height}}
    const x=point.left,y=point.top+point.height/2,distance=Math.hypot(x-clientX,(y-clientY)*1.8);if(distance<best.distance)best={index,distance};
  }
  measure.remove();return best.index;
}

function skipListMarkers(sphere,position,direction){
  if(sphere.shape!=='square')return position;
  const lineStart=sphere.text.lastIndexOf('\n',position-1)+1;
  let contentStart=lineStart;while(sphere.text[contentStart]==='\t')contentStart++;
  return position>lineStart&&position<contentStart?(direction>0?contentStart:lineStart):position;
}

function moveCaret(event){
  const sphere=editableSelected();if(!sphere)return false;
  const range=rangeFor(sphere),start=Math.min(range.anchor,range.focus),end=Math.max(range.anchor,range.focus);let caret=range.focus,next=caret;
  if(event.key==='ArrowLeft')next=!event.shiftKey&&start!==end?start:Math.max(0,caret-1);
  else if(event.key==='ArrowRight')next=!event.shiftKey&&start!==end?end:Math.min(sphere.text.length,caret+1);
  else if(event.key==='Home')next=sphere.text.lastIndexOf('\n',caret-1)+1;
  else if(event.key==='End'){const end=sphere.text.indexOf('\n',caret);next=end<0?sphere.text.length:end}
  else if(event.key==='ArrowUp')next=moveCaretByVisibleRow(sphere,caret,-1);
  else if(event.key==='ArrowDown')next=moveCaretByVisibleRow(sphere,caret,1);
  else return false;
  next=skipListMarkers(sphere,next,event.key==='ArrowRight'||event.key==='ArrowDown'?1:-1);
  setRange(sphere,event.shiftKey?range.anchor:next,next);render();return true;
}

function resizeSelection(grow){
  const sphere=selected();if(!sphere)return false;
  const range=rangeFor(sphere),start=Math.min(range.anchor,range.focus),end=Math.max(range.anchor,range.focus);
  const allTextSelected=editingId===sphere.id&&sphere.text.length>0&&start===0&&end===sphere.text.length;
  if(allTextSelected){
    sphere.fontScale=Math.max(.35,Math.min(4,(sphere.fontScale??1)*(grow?1.06:.94)));
    setDefaultFontScale(sphereShape(sphere),sphere.fontScale);
  }else{
    state.spheres.filter(item=>selectedIds.has(item.id)).forEach(item=>{
      if(item.shape==='square'){
        const factor=grow?1.05:.95;
        item.width=Math.max(90,Math.min(innerWidth,sphereWidth(item)*factor));
        item.height=Math.max(squareMinHeight(item),sphereHeight(item)*factor);
      }else item.scale=Math.max(.4,Math.min(3,(item.scale??1)*(grow?1.05:.95)));
      item.x=Math.max(0,Math.min(innerWidth-sphereWidth(item),item.x));
      item.y=Math.max(0,item.y);
    });
  }
  render();scheduleSave();return true;
}

function changeListLevel(event){
  const sphere=editableSelected();if(event.key!=='Tab'||!sphere||sphere.shape!=='square')return false;
  const range=rangeFor(sphere),lineStart=sphere.text.lastIndexOf('\n',range.focus-1)+1;
  let level=0;while(sphere.text[lineStart+level]==='\t')level++;
  if(event.shiftKey){
    if(level>0){
      sphere.text=sphere.text.slice(0,lineStart)+sphere.text.slice(lineStart+1);
      setRange(sphere,range.anchor>lineStart?range.anchor-1:range.anchor,range.focus>lineStart?range.focus-1:range.focus);
    }
  }else if(level<3){
    sphere.text=sphere.text.slice(0,lineStart)+'\t'+sphere.text.slice(lineStart);
    setRange(sphere,range.anchor>=lineStart?range.anchor+1:range.anchor,range.focus>=lineStart?range.focus+1:range.focus);
  }
  render();scheduleSave();return true;
}

function finishAltNumericCode(){
  if(!altNumericCode)return;
  const code=Number(altNumericCode),character=code>=32&&code<=126?String.fromCharCode(code):'';
  altNumericCode='';
  if(character&&editableSelected())type({key:character,ctrlKey:false,metaKey:false,altKey:false});
}

document.addEventListener('keydown',event=>{
  if(!notice.hidden)return;
  if(!editingId&&!event.ctrlKey&&!event.metaKey&&!event.altKey&&event.key.toLowerCase()==='x'){event.preventDefault();setArrowMode(!arrowMode);return}
  if(!editingId&&!event.ctrlKey&&!event.metaKey&&!event.altKey&&event.key.toLowerCase()==='t'){event.preventDefault();const sphere=addSphere(true,'square',true);if(coarsePointer)openMobileEditor(sphere,0);return}
  if(event.key==='|'&&!editingId){event.preventDefault();exportSvg();return}
  if((event.ctrlKey||event.metaKey)&&!event.altKey&&event.key.toLowerCase()==='z'){if(restoreHistory(-1))event.preventDefault();return}
  if((event.ctrlKey||event.metaKey)&&!event.altKey&&event.key.toLowerCase()==='y'){if(restoreHistory(1))event.preventDefault();return}
  if(selectedArrowId&&(event.key==='Delete'||event.key==='Backspace')){event.preventDefault();state.arrows=arrows().filter(arrow=>arrow.id!==selectedArrowId);selectedArrowId=null;render();scheduleSave();return}
  if(!editingId&&(selectedIds.size||selectedImageIds.size)&&(event.key==='Delete'||event.key==='Backspace')){event.preventDefault();[...selectedIds].forEach(removeSphere);state.images=images().filter(image=>!selectedImageIds.has(image.id));state.arrows=arrows().filter(arrow=>!selectedImageIds.has(arrow.fromImageId)&&!selectedImageIds.has(arrow.toImageId));selectedId=null;selectedImageId=null;selectedImageIds=new Set();render();scheduleSave();return}
  if(event.key==='Alt'||event.code==='AltLeft'||event.code==='AltRight'){
    altKeyHeld=true;event.preventDefault();return;
  }
  const altDigit=event.code.match(/^(?:Numpad|Digit)(\d)$/)?.[1];
  if((altKeyHeld||event.altKey)&&altDigit!==undefined){
    if(!event.repeat)altNumericCode+=altDigit;
    event.preventDefault();return;
  }
  const growKey=event.key==='+'||event.key==='='||event.code==='NumpadAdd';
  const shrinkKey=event.key==='-'||event.code==='Minus'||event.code==='NumpadSubtract';
  if(!selected()&&!selectedImageIds.size&&!event.ctrlKey&&!event.metaKey&&!event.altKey&&event.key==='ArrowUp'&&scrollY<=0){event.preventDefault();showCategoryBar();return}
  if(!selected()&&!selectedImageIds.size&&!event.ctrlKey&&!event.metaKey&&!event.altKey&&event.key==='ArrowDown'&&!categoryBar.hidden){event.preventDefault();categoryBar.hidden=true;return}
  if(!selected()&&!selectedImageIds.size&&!event.ctrlKey&&!event.metaKey&&!event.altKey&&(event.key==='ArrowRight'||event.key==='ArrowLeft')){
    event.preventDefault();switchPage(event.key==='ArrowRight'?1:-1);return;
  }
  if((event.ctrlKey||event.metaKey)&&event.key.toLowerCase()==='a'){
    const sphere=editableSelected();if(!sphere)return;
    event.preventDefault();setRange(sphere,0,sphere.text.length);render();return;
  }
  if((event.ctrlKey||event.metaKey)&&(growKey||shrinkKey)){
    if(resizeSelection(!shrinkKey))event.preventDefault();return;
  }
  if(changeListLevel(event)){event.preventDefault();return}
  if(moveCaret(event)){event.preventDefault();return}
  if(type(event))event.preventDefault();
});

document.addEventListener('keyup',event=>{
  if(event.key!=='Alt'&&event.code!=='AltLeft'&&event.code!=='AltRight')return;
  altKeyHeld=false;finishAltNumericCode();event.preventDefault();
});

window.addEventListener('blur',()=>{altKeyHeld=false;finishAltNumericCode()});

document.addEventListener('wheel',event=>{
  if(notice.hidden&&!event.ctrlKey&&event.deltaY<0&&scrollY<=0){showCategoryBar();return}
  if(notice.hidden&&!event.ctrlKey&&event.deltaY>0&&!categoryBar.hidden){categoryBar.hidden=true;return}
  if(!notice.hidden||!event.ctrlKey||!selected())return;
  event.preventDefault();resizeSelection(event.deltaY<0);
},{passive:false});

document.addEventListener('copy',event=>{
  const sphere=selected();if(!sphere)return;
  const range=rangeFor(sphere),start=Math.min(range.anchor,range.focus),end=Math.max(range.anchor,range.focus);
  if(editingId===sphere.id&&start!==end){event.clipboardData.setData('text/plain',sphere.text.slice(start,end));copiedElement=null;event.preventDefault();return}
  copiedElement=structuredClone(sphere);elementPasteCount=0;
  event.clipboardData.setData('application/x-esferas-element',JSON.stringify(copiedElement));
  event.clipboardData.setData('text/plain','');event.preventDefault();
});

document.addEventListener('paste',event=>{
  if(!notice.hidden)return;
  const imageFile=[...event.clipboardData.items].find(item=>item.kind==='file'&&item.type.startsWith('image/'))?.getAsFile();
  if(imageFile){event.preventDefault();pasteImage(imageFile,state,{...mouse});return}
  const encodedElement=event.clipboardData.getData('application/x-esferas-element'),clipboardText=event.clipboardData.getData('text/plain');
  let elementToPaste=null;try{elementToPaste=encodedElement?JSON.parse(encodedElement):(!clipboardText?copiedElement:null)}catch{}
  if(elementToPaste&&typeof elementToPaste==='object'&&typeof elementToPaste.text==='string'){
    event.preventDefault();elementPasteCount++;
    const offset=28*elementPasteCount,copy={...structuredClone(elementToPaste),id:crypto.randomUUID()};
    copy.x=Math.max(0,Math.min(innerWidth-sphereWidth(copy),(elementToPaste.x??0)+offset));copy.y=Math.max(0,(elementToPaste.y??0)+offset);
    state.spheres.push(copy);focusSphere(copy.id);setRange(copy,copy.text.length);render();scheduleSave();return;
  }
  const sphere=selected(),pastedText=clipboardText;
  if(!sphere||!pastedText)return;
  event.preventDefault();
  const range=rangeFor(sphere),start=Math.min(range.anchor,range.focus),end=Math.max(range.anchor,range.focus);
  sphere.text=sphere.text.slice(0,start)+pastedText+sphere.text.slice(end);
  setRange(sphere,start+pastedText.length);
  render();scheduleSave();
});

function beginPinch(){
  if(touchPointers.size<2||!selectedIds.size)return false;
  const points=[...touchPointers.values()].slice(0,2),distance=Math.hypot(points[0].x-points[1].x,points[0].y-points[1].y);if(distance<12)return false;
  const center={x:(points[0].x+points[1].x)/2,y:(points[0].y+points[1].y)/2+scrollY};
  const items=state.spheres.filter(sphere=>selectedIds.has(sphere.id)).map(sphere=>({sphere,x:sphere.x,y:sphere.y,scale:sphere.scale??1,width:sphereWidth(sphere),height:sphereHeight(sphere)}));if(!items.length)return false;
  [backgroundHold,elementHold,arrowHold].forEach(hold=>{if(hold)clearTimeout(hold.timer)});backgroundHold=null;elementHold=null;arrowHold=null;drag=null;marquee?.element.remove();marquee=null;touchBackground=null;mobileSphereTapCandidate=null;
  pinch={distance,center,items};return true;
}
function updatePinch(){
  if(!pinch||touchPointers.size<2)return;
  const points=[...touchPointers.values()].slice(0,2),distance=Math.hypot(points[0].x-points[1].x,points[0].y-points[1].y),factor=Math.max(.4,Math.min(3,distance/pinch.distance));
  pinch.items.forEach(item=>{
    const sphere=item.sphere;sphere.x=Math.max(0,pinch.center.x+(item.x-pinch.center.x)*factor);sphere.y=Math.max(0,pinch.center.y+(item.y-pinch.center.y)*factor);
    if(sphere.shape==='square'){sphere.width=Math.max(90,Math.min(innerWidth,item.width*factor));sphere.height=Math.max(squareMinHeight(sphere),item.height*factor)}else sphere.scale=Math.max(.4,Math.min(3,item.scale*factor));
    sphere.x=Math.min(Math.max(0,innerWidth-sphereWidth(sphere)),sphere.x);
  });render();
}

board.addEventListener('pointerdown',event=>{
  if(event.pointerType==='touch'){
    touchPointers.set(event.pointerId,{x:event.clientX,y:event.clientY});
    if(touchPointers.size===2&&beginPinch()){board.setPointerCapture(event.pointerId);event.preventDefault();return}
  }
  if(event.target.closest('.color-palette'))return;
  closeColorPalette();
  if(arrowMode){
    const point={x:event.clientX,y:event.clientY+scrollY},sourceSphere=state.spheres.find(item=>item.id===event.target.closest('.sphere')?.dataset.id),sourceImage=images().find(item=>item.id===event.target.closest('.board-image')?.dataset.imageId);
    connectorDrag={id:event.pointerId,fromId:sourceSphere?.id??null,fromImageId:sourceImage?.id??null,from:sourceSphere?borderPoint(sourceSphere,point.x,point.y):sourceImage?imageBorderPoint(sourceImage,point.x,point.y):point,to:point,toId:null,toImageId:null};
    board.setPointerCapture(event.pointerId);event.preventDefault();render();return;
  }
  const imageEl=event.target.closest('.board-image');
  if(imageEl){
    const image=images().find(item=>item.id===imageEl.dataset.imageId);if(!image)return;
    lastSphereClick=null;const direction=image.id===selectedImageId&&selectedImageIds.size===1?imageResizeDirection(imageEl,event):'';
    if(direction){focusImage(image.id);imageResizeDrag={id:event.pointerId,image,direction,startX:event.clientX,startY:event.clientY,x:image.x,y:image.y,width:image.width,height:image.height}}
    else{
      if(!selectedImageIds.has(image.id)){focusImage(image.id);event.preventDefault();render();return}
      const imageItems=images().filter(item=>selectedImageIds.has(item.id)).map(item=>({image:item,x:item.x,y:item.y})),sphereItems=state.spheres.filter(sphere=>selectedIds.has(sphere.id)).map(sphere=>({sphere,x:sphere.x,y:sphere.y}));
      imageDrag={id:event.pointerId,startX:event.clientX,startY:event.clientY,imageItems,sphereItems};
    }
    event.preventDefault();render();const active=board.querySelector(`[data-image-id="${image.id}"]`);active.setPointerCapture(event.pointerId);active.classList.add('dragging');return;
  }
  const arrowEl=event.target.closest('.arrow-item');
  if(arrowEl){
    const arrow=arrows().find(item=>item.id===arrowEl.dataset.arrowId);if(!arrow)return;
    focusSphere(null);selectedArrowId=arrow.id;const from=arrowEndpoint(arrow,'from'),to=arrowEndpoint(arrow,'to');
    const point={x:event.clientX,y:event.clientY+scrollY},end=Math.hypot(point.x-from.x,point.y-from.y)<=Math.hypot(point.x-to.x,point.y-to.y)?'from':'to';
    mouse=point;arrowDrag={id:event.pointerId,arrow,end,startX:event.clientX,startY:event.clientY,from,to};
    arrowHold={id:event.pointerId,startX:event.clientX,startY:event.clientY,timer:setTimeout(()=>{if(!arrowHold||arrowHold.id!==event.pointerId)return;arrowHold=null;arrowDrag=null;openColorPalette(null,true)},700)};
    board.setPointerCapture(event.pointerId);event.preventDefault();render();return;
  }
  const el=event.target.closest('.sphere');
  if(!el){
    if(event.pointerType==='touch'){
      focusSphere(null);categoryBar.hidden=true;lastSphereClick=null;render();
      touchBackground={id:event.pointerId,startX:event.clientX,startY:event.clientY+scrollY,lastX:event.clientX,lastY:event.clientY+scrollY,longPressed:false,moved:false,timer:setTimeout(()=>{
        if(!touchBackground||touchBackground.id!==event.pointerId)return;
        touchBackground.longPressed=true;marquee={id:event.pointerId,startX:touchBackground.startX,startY:touchBackground.startY,element:document.createElement('div')};marquee.element.className='selection-box';board.append(marquee.element);updateMarquee(touchBackground.lastX,touchBackground.lastY);
      },650)};
      board.setPointerCapture(event.pointerId);return;
    }
    selectedImageId=null;
    selectedArrowId=null;board.querySelectorAll('.arrow-item.selected').forEach(item=>item.classList.remove('selected'));
    categoryBar.hidden=true;
    lastSphereClick=null;
    marquee={id:event.pointerId,startX:event.clientX,startY:event.clientY+scrollY,element:document.createElement('div')};
    marquee.element.className='selection-box'; board.append(marquee.element); board.setPointerCapture(event.pointerId);
    backgroundHold={id:event.pointerId,startX:event.clientX,startY:event.clientY,timer:setTimeout(()=>{
      if(!backgroundHold||backgroundHold.id!==event.pointerId)return;
      marquee?.element.remove();marquee=null;backgroundHold=null;deleteCurrentPage();
    },700)};
    updateMarquee(event.clientX,event.clientY+scrollY); return;
  }
  const now=performance.now(),previous=lastSphereClick;
  if(!coarsePointer&&previous&&previous.id===el.dataset.id&&now-previous.time<420&&Math.hypot(event.clientX-previous.x,event.clientY-previous.y)<7){
    const sphere=state.spheres.find(item=>item.id===el.dataset.id);if(!sphere)return;
    lastSphereClick=null;focusSphere(sphere.id);editingId=sphere.id;setRange(sphere,caretFromPoint(sphere,event.clientX,event.clientY));
    event.preventDefault();render();return;
  }
  lastSphereClick={id:el.dataset.id,time:now,x:event.clientX,y:event.clientY};
  mouse={x:event.clientX,y:event.clientY+scrollY};
  const objectSelection=selectedIds.has(el.dataset.id)&&editingId!==el.dataset.id;
  const clickedSphereBeforeFocus=state.spheres.find(item=>item.id===el.dataset.id),clickedCaret=caretFromPoint(clickedSphereBeforeFocus,event.clientX,event.clientY);
  if(event.pointerType==='touch')mobileSphereTapCandidate={id:event.pointerId,sphereId:el.dataset.id,wasSelected:selectedIds.has(el.dataset.id),caret:clickedCaret,startX:event.clientX,startY:event.clientY};
  if(!selectedIds.has(el.dataset.id))focusSphere(el.dataset.id);
  else selectedId=el.dataset.id;
  const clickedSphere=selected();
  elementHold={id:event.pointerId,startX:event.clientX,startY:event.clientY,timer:setTimeout(()=>{
    if(!elementHold||elementHold.id!==event.pointerId)return;
    elementHold=null;drag=null;lastSphereClick=null;el.classList.remove('dragging');openColorPalette(clickedSphere);
  },700)};
  contracted=false;
  const movingSpheres=state.spheres.filter(sphere=>selectedIds.has(sphere.id)),movingImages=images().filter(image=>selectedImageIds.has(image.id));
  drag={id:event.pointerId,startX:event.clientX,startY:event.clientY,items:movingSpheres.map(sphere=>({sphere,x:sphere.x,y:sphere.y})),imageItems:movingImages.map(image=>({image,x:image.x,y:image.y}))};render();
  const active=board.querySelector(`[data-id="${selectedId}"]`); active.setPointerCapture(event.pointerId); active.classList.add('dragging');if(event.pointerType==='touch')event.preventDefault();
});
board.addEventListener('dblclick',event=>{
  if(coarsePointer)return;
  const el=event.target.closest('.sphere');
  if(el){
    const sphere=state.spheres.find(item=>item.id===el.dataset.id);if(!sphere)return;
    focusSphere(sphere.id);editingId=sphere.id;setRange(sphere,caretFromPoint(sphere,event.clientX,event.clientY));
    event.preventDefault();render();return;
  }
  mouse={x:event.clientX,y:event.clientY+scrollY};
  event.preventDefault();addSphere();
});
board.addEventListener('pointermove',event=>{
  mouse={x:event.clientX,y:event.clientY+scrollY};
  if(event.pointerType==='touch'&&touchPointers.has(event.pointerId))touchPointers.set(event.pointerId,{x:event.clientX,y:event.clientY});
  if(pinch){updatePinch();event.preventDefault();return}
  if(mobileSphereTapCandidate&&event.pointerId===mobileSphereTapCandidate.id&&Math.hypot(event.clientX-mobileSphereTapCandidate.startX,event.clientY-mobileSphereTapCandidate.startY)>7)mobileSphereTapCandidate=null;
  if(touchBackground&&event.pointerId===touchBackground.id){
    touchBackground.lastX=event.clientX;touchBackground.lastY=event.clientY+scrollY;
    const dx=event.clientX-touchBackground.startX,dy=event.clientY+scrollY-touchBackground.startY;touchBackground.moved ||= Math.hypot(dx,dy)>7;
    if(touchBackground.longPressed&&marquee)updateMarquee(touchBackground.lastX,touchBackground.lastY);
    else if(scrollY<=0&&dy>64)showCategoryBar();
    return;
  }
  if(imageResizeDrag&&event.pointerId===imageResizeDrag.id){
    const item=imageResizeDrag,dx=event.clientX-item.startX,dy=event.clientY-item.startY,minSize=48;let left=item.x,right=item.x+item.width,top=item.y,bottom=item.y+item.height;
    if(item.direction.includes('e'))right=Math.min(innerWidth,Math.max(left+minSize,right+dx));
    if(item.direction.includes('w'))left=Math.max(0,Math.min(right-minSize,left+dx));
    if(item.direction.includes('s'))bottom=Math.max(top+minSize,bottom+dy);
    if(item.direction.includes('n'))top=Math.max(0,Math.min(bottom-minSize,top+dy));
    Object.assign(item.image,{x:left,y:top,width:right-left,height:bottom-top});const active=board.querySelector(`[data-image-id="${item.image.id}"]`);Object.assign(active.style,{left:`${left}px`,top:`${top}px`,width:`${right-left}px`,height:`${bottom-top}px`});board.style.height=`${canvasHeight()}px`;return;
  }
  if(imageDrag&&event.pointerId===imageDrag.id){
    let dx=event.clientX-imageDrag.startX,dy=event.clientY-imageDrag.startY;
    const horizontal=[...imageDrag.imageItems.map(item=>({x:item.x,width:item.image.width})),...imageDrag.sphereItems.map(item=>({x:item.x,width:sphereWidth(item.sphere)}))],vertical=[...imageDrag.imageItems.map(item=>({y:item.y,height:item.image.height})),...imageDrag.sphereItems.map(item=>({y:item.y,height:sphereHeight(item.sphere)}))];
    dx=Math.max(Math.max(...horizontal.map(item=>-item.x)),Math.min(Math.min(...horizontal.map(item=>innerWidth-item.width-item.x)),dx));dy=Math.max(Math.max(...vertical.map(item=>-item.y)),dy);
    imageDrag.imageItems.forEach(item=>{item.image.x=item.x+dx;item.image.y=item.y+dy;const active=board.querySelector(`[data-image-id="${item.image.id}"]`);active.style.left=`${item.image.x}px`;active.style.top=`${item.image.y}px`});
    imageDrag.sphereItems.forEach(item=>{item.sphere.x=item.x+dx;item.sphere.y=item.y+dy;const active=board.querySelector(`[data-id="${item.sphere.id}"]`);active.style.left=`${item.sphere.x}px`;active.style.top=`${item.sphere.y}px`});board.style.height=`${canvasHeight()}px`;updateRenderedArrows();return;
  }
  if(!drag&&!imageDrag&&!imageResizeDrag&&!arrowDrag&&!connectorDrag){
    const hoveredImage=document.elementFromPoint(event.clientX,event.clientY)?.closest('.board-image');
    if(hoveredImage){const canResize=hoveredImage.dataset.imageId===selectedImageId&&selectedImageIds.size===1,direction=canResize?imageResizeDirection(hoveredImage,event):'';hoveredImage.style.cursor=direction?`${direction}-resize`:'grab'}
    board.querySelectorAll('.sphere.connector-ready').forEach(item=>item.classList.remove('connector-ready'));
  }
  if(connectorDrag&&event.pointerId===connectorDrag.id){
    const point={x:event.clientX,y:event.clientY+scrollY},imageTarget=nearbyImageAt(point.x,point.y,connectorDrag.fromImageId),target=imageTarget?null:nearbySphereAt(point.x,point.y,connectorDrag.fromId);
    const sourceSphere=state.spheres.find(sphere=>sphere.id===connectorDrag.fromId),sourceImage=images().find(image=>image.id===connectorDrag.fromImageId);
    if(sourceSphere)connectorDrag.from=borderPoint(sourceSphere,point.x,point.y);else if(sourceImage)connectorDrag.from=imageBorderPoint(sourceImage,point.x,point.y);
    if(target&&target.id!==connectorDrag.fromId){connectorDrag.toId=target.id;connectorDrag.toImageId=null;connectorDrag.to=borderPoint(target,point.x,point.y)}
    else if(imageTarget){connectorDrag.toId=null;connectorDrag.toImageId=imageTarget.id;connectorDrag.to=imageBorderPoint(imageTarget,point.x,point.y)}
    else{connectorDrag.toId=null;connectorDrag.toImageId=null;connectorDrag.to=point}
    render();return;
  }
  if(arrowDrag&&event.pointerId===arrowDrag.id){
    const dx=event.clientX-arrowDrag.startX,dy=event.clientY-arrowDrag.startY;if(Math.hypot(dx,dy)<7)return;if(arrowHold){clearTimeout(arrowHold.timer);arrowHold=null}
    const item=arrowDrag,arrow=item.arrow,end=item.end,other=end==='from'?'to':'from',point={x:event.clientX,y:event.clientY+scrollY},imageTarget=nearbyImageAt(point.x,point.y),target=imageTarget?null:nearbySphereAt(point.x,point.y,arrow[`${other}Id`]);item.moved=true;
    if(target){const attached=borderPoint(target,point.x,point.y);arrow[`${end}Id`]=target.id;arrow[`${end}Anchor`]=localAnchor(target,attached);arrow[`${end}ImageId`]=null;arrow[`${end}ImageAnchor`]=null;arrow[`${end}X`]=attached.x;arrow[`${end}Y`]=attached.y}
    else if(imageTarget){const attached=imageBorderPoint(imageTarget,point.x,point.y);arrow[`${end}Id`]=null;arrow[`${end}Anchor`]=null;arrow[`${end}ImageId`]=imageTarget.id;arrow[`${end}ImageAnchor`]=localImageAnchor(imageTarget,attached);arrow[`${end}X`]=attached.x;arrow[`${end}Y`]=attached.y}
    else{arrow[`${end}Id`]=null;arrow[`${end}Anchor`]=null;arrow[`${end}ImageId`]=null;arrow[`${end}ImageAnchor`]=null;arrow[`${end}X`]=point.x;arrow[`${end}Y`]=point.y}
    render();return;
  }
  if(backgroundHold&&event.pointerId===backgroundHold.id&&Math.hypot(event.clientX-backgroundHold.startX,event.clientY-backgroundHold.startY)>7){clearTimeout(backgroundHold.timer);backgroundHold=null}
  if(elementHold&&event.pointerId===elementHold.id&&Math.hypot(event.clientX-elementHold.startX,event.clientY-elementHold.startY)>7){clearTimeout(elementHold.timer);elementHold=null}
  if(marquee&&event.pointerId===marquee.id){updateMarquee(event.clientX,event.clientY+scrollY);return}
  if(!drag||event.pointerId!==drag.id)return;
  if(Math.hypot(event.clientX-drag.startX,event.clientY-drag.startY)>=7)lastSphereClick=null;
  let dx=event.clientX-drag.startX,dy=event.clientY-drag.startY;
  const horizontal=[...drag.items.map(item=>({x:item.x,width:sphereWidth(item.sphere)})),...drag.imageItems.map(item=>({x:item.x,width:item.image.width}))],vertical=[...drag.items.map(item=>({y:item.y,height:sphereHeight(item.sphere)})),...drag.imageItems.map(item=>({y:item.y,height:item.image.height}))];
  const minDx=Math.max(...horizontal.map(item=>-item.x)),maxDx=Math.min(...horizontal.map(item=>innerWidth-item.width-item.x));
  const minDy=Math.max(...vertical.map(item=>-item.y)),maxDy=Math.min(...vertical.map(item=>canvasHeight()-item.height-item.y));
  dx=Math.max(minDx,Math.min(maxDx,dx));dy=Math.max(minDy,Math.min(maxDy,dy));
  drag.items.forEach(item=>{
    item.sphere.x=item.x+dx;item.sphere.y=item.y+dy;
    const el=board.querySelector(`[data-id="${item.sphere.id}"]`);el.style.left=`${item.sphere.x}px`;el.style.top=`${item.sphere.y}px`;
  });
  drag.imageItems.forEach(item=>{item.image.x=item.x+dx;item.image.y=item.y+dy;const el=board.querySelector(`[data-image-id="${item.image.id}"]`);el.style.left=`${item.image.x}px`;el.style.top=`${item.image.y}px`});
  updateRenderedArrows();
});
function updateMarquee(x,y){
  const left=Math.min(marquee.startX,x), top=Math.min(marquee.startY,y), width=Math.abs(x-marquee.startX), height=Math.abs(y-marquee.startY);
  Object.assign(marquee.element.style,{left:`${left}px`,top:`${top}px`,width:`${width}px`,height:`${height}px`});
  selectedIds=new Set(state.spheres.filter(s=>{
    const p=position(state.spheres.indexOf(s),s),itemWidth=sphereWidth(s),itemHeight=sphereHeight(s);
    return p.x<left+width&&p.x+itemWidth>left&&p.y<top+height&&p.y+itemHeight>top;
  }).map(s=>s.id));
  selectedImageIds=new Set(images().filter(image=>image.x<left+width&&image.x+image.width>left&&image.y<top+height&&image.y+image.height>top).map(image=>image.id));
  editingId=null;selectedImageId=null;selectedId=[...selectedIds][0]??null;const selectedSphere=selected();if(selectedSphere){const shape=sphereShape(selectedSphere);setDefaultFontScale(shape,selectedSphere.fontScale??1);if(!caretPositions.has(selectedId))caretPositions.set(selectedId,selectedSphere.text.length)}
  board.querySelectorAll('.sphere').forEach(el=>el.classList.toggle('selected',selectedIds.has(el.dataset.id)));
  board.querySelectorAll('.sphere').forEach(el=>el.classList.remove('focused'));
  board.querySelectorAll('.board-image').forEach(el=>el.classList.toggle('selected',selectedImageIds.has(el.dataset.imageId)));
}
function endDrag(event){
  if(event.pointerType==='touch')touchPointers.delete(event.pointerId);
  if(pinch){
    if(touchPointers.size<2){pinch=null;render();scheduleSave()}
    return;
  }
  if(touchBackground&&event.pointerId===touchBackground.id){
    const gesture=touchBackground;clearTimeout(gesture.timer);touchBackground=null;
    if(gesture.longPressed){marquee?.element.remove();marquee=null;render();return}
    if(event.type==='pointercancel')return;
    const dx=event.clientX-gesture.startX,dy=event.clientY+scrollY-gesture.startY;
    if(Math.abs(dx)>=72&&Math.abs(dx)>Math.abs(dy)*1.35){switchPage(dx<0?1:-1);return}
    if(!gesture.moved){
      const now=performance.now(),previous=lastBackgroundTap,point={x:event.clientX,y:event.clientY+scrollY};
      if(previous&&now-previous.time<420&&Math.hypot(point.x-previous.x,point.y-previous.y)<28){lastBackgroundTap=null;mouse=point;if(!pasteCopiedElementAt(point))addSphere();return}
      lastBackgroundTap={time:now,...point};
    }
    return;
  }
  if(mobileSphereTapCandidate&&event.pointerId===mobileSphereTapCandidate.id){
    const candidate=mobileSphereTapCandidate;mobileSphereTapCandidate=null;
    if(event.type!=='pointercancel'&&candidate.wasSelected){const sphere=state.spheres.find(item=>item.id===candidate.sphereId);if(sphere){drag=null;if(elementHold){clearTimeout(elementHold.timer);elementHold=null}openMobileEditor(sphere,candidate.caret);return}}
  }
  if(backgroundHold&&event.pointerId===backgroundHold.id){clearTimeout(backgroundHold.timer);backgroundHold=null}
  if(elementHold&&event.pointerId===elementHold.id){clearTimeout(elementHold.timer);elementHold=null}
  if(arrowHold&&event.pointerId===arrowHold.id){clearTimeout(arrowHold.timer);arrowHold=null}
  if(connectorDrag&&event.pointerId===connectorDrag.id){
    const item=connectorDrag,fromSphere=state.spheres.find(sphere=>sphere.id===item.fromId),fromImage=images().find(image=>image.id===item.fromImageId),target=state.spheres.find(sphere=>sphere.id===item.toId),imageTarget=images().find(image=>image.id===item.toImageId);
    if(event.type!=='pointercancel'&&Math.hypot(item.to.x-item.from.x,item.to.y-item.from.y)>7){
      const arrow={id:crypto.randomUUID(),fromId:fromSphere?.id??null,fromImageId:fromImage?.id??null,toId:target?.id??null,toImageId:imageTarget?.id??null,fromX:item.from.x,fromY:item.from.y,toX:item.to.x,toY:item.to.y};
      if(fromSphere)arrow.fromAnchor=localAnchor(fromSphere,item.from);else if(fromImage)arrow.fromImageAnchor=localImageAnchor(fromImage,item.from);
      if(target)arrow.toAnchor=localAnchor(target,item.to);else if(imageTarget)arrow.toImageAnchor=localImageAnchor(imageTarget,item.to);
      arrows().push(arrow);
    }
    connectorDrag=null;render();scheduleSave();return;
  }
  if(arrowDrag&&event.pointerId===arrowDrag.id){const changed=arrowDrag.moved;arrowDrag=null;render();if(changed)scheduleSave();return}
  if(imageResizeDrag&&event.pointerId===imageResizeDrag.id){imageResizeDrag=null;render();scheduleSave();return}
  if(imageDrag&&event.pointerId===imageDrag.id){imageDrag=null;render();scheduleSave();return}
  if(marquee&&event.pointerId===marquee.id){marquee.element.remove();marquee=null;render();return}
  if(!drag||event.pointerId!==drag.id)return;drag=null;scheduleSave();render()
}
board.addEventListener('pointerup',endDrag); board.addEventListener('pointercancel',endDrag);
window.addEventListener('pointermove',event=>{mouse={x:event.clientX,y:event.clientY+scrollY}});
window.addEventListener('resize',()=>{state.spheres.forEach(s=>{s.x=Math.max(0,Math.min(innerWidth-sphereWidth(s),s.x));s.y=Math.max(0,s.y)});images().forEach(image=>{image.x=Math.max(0,Math.min(innerWidth-image.width,image.x));image.y=Math.max(0,image.y)});render();scheduleSave()});
let scrollTimer=null;
function scrollPositions(){
  try{
    const value=JSON.parse(localStorage.getItem(SCROLL_KEY));
    if(value&&typeof value==='object')return value;
    const legacy=Number(localStorage.getItem('esferas-scroll-v1'));return Number.isFinite(legacy)?{0:legacy}:{};
  }catch{return{}}
}
function scrollKey(page=currentPage,category=currentCategory){return`${category}:${page}`}
function saveScroll(){const positions=scrollPositions();positions[scrollKey()]=scrollY;localStorage.setItem(SCROLL_KEY,JSON.stringify(positions))}
window.addEventListener('scroll',()=>{if(restoringScroll)return;clearTimeout(scrollTimer);scrollTimer=setTimeout(saveScroll,100)},{passive:true});
function restoreScroll(){
  const positions=scrollPositions(),saved=Number(positions[scrollKey()]??(currentCategory===0?positions[currentPage]:0)??0);restoringScroll=true;
  requestAnimationFrame(()=>requestAnimationFrame(()=>{
    scrollTo(0,Number.isFinite(saved)?saved:0);restoringScroll=false;
    document.documentElement.classList.remove('restoring-view');
  }));
}
function replacePages(nextPages,activeState){
  const oldPages=pages,oldScrolls=scrollPositions(),nextScrolls={};
  Object.entries(oldScrolls).forEach(([key,value])=>{if(!key.startsWith(`${currentCategory}:`)&&!/^\d+$/.test(key))nextScrolls[key]=value});
  nextPages.forEach((page,index)=>{const previousIndex=oldPages.indexOf(page),value=oldScrolls[scrollKey(previousIndex)]??(currentCategory===0?oldScrolls[previousIndex]:undefined);if(previousIndex>=0&&value!==undefined)nextScrolls[scrollKey(index)]=value});
  pages=nextPages.length?nextPages:[{color:randomColor(),spheres:[],updatedAt:Date.now()}];
  categories[currentCategory].pages=pages;
  currentPage=Math.max(0,pages.indexOf(activeState));if(currentPage<0)currentPage=0;
  state=pages[currentPage];localStorage.setItem(SCROLL_KEY,JSON.stringify(nextScrolls));savePageIndex();
}
function removeEmptyHiddenPages(){
  const remaining=pages.filter(page=>page===state||page.spheres.length||(page.images?.length??0));
  if(remaining.length!==pages.length)replacePages(remaining,state);
}
function deleteCurrentPage(){
  const count=state.spheres.length+images().length;if(!confirm(`¿Eliminar esta página y sus ${count} elemento${count===1?'':'s'}?`))return;
  const removedIndex=currentPage,nextPages=pages.filter(page=>page!==state),nextState=nextPages[Math.min(removedIndex,nextPages.length-1)];
  replacePages(nextPages,nextState);focusSphere(null);contracted=false;render();restoreScroll();scheduleSave();
}
function switchPage(direction){
  const next=currentPage+direction;if(next<0)return;
  if(next>=pages.length&&!state.spheres.length&&!images().length)return;
  saveScroll();
  if(next>=pages.length)pages.push({color:randomColor(),spheres:[],updatedAt:Date.now()});
  currentPage=next;state=pages[currentPage];savePageIndex();
  removeEmptyHiddenPages();
  focusSphere(null);contracted=false;render();restoreScroll();scheduleSave();
}

function renderCategoryBar(){
  categoryList.replaceChildren();
  categories.forEach((category,index)=>{
    const button=document.createElement('button');button.type='button';button.className=`category-button${index===currentCategory?' active':''}`;
    button.textContent=category.name;
    button.addEventListener('click',()=>{if(suppressCategoryClick){suppressCategoryClick=false;return}switchCategory(index)});
    button.addEventListener('pointerdown',event=>{
      if(event.button!==undefined&&event.button!==0)return;
      categoryReorder={id:event.pointerId,from:index,to:index,startX:event.clientX,startY:event.clientY,moved:false,button};
      button.setPointerCapture(event.pointerId);
    });
    button.addEventListener('pointermove',event=>{
      const drag=categoryReorder;if(!drag||drag.id!==event.pointerId)return;
      if(!drag.moved&&Math.hypot(event.clientX-drag.startX,event.clientY-drag.startY)>7){drag.moved=true;drag.button.classList.add('reordering')}
      if(!drag.moved)return;
      const target=document.elementFromPoint(event.clientX,event.clientY)?.closest('.category-button');if(!target)return;
      const targetIndex=[...categoryList.children].indexOf(target);if(targetIndex<0||targetIndex===drag.to)return;
      categoryList.querySelectorAll('.reorder-target').forEach(item=>item.classList.remove('reorder-target'));
      target.classList.add('reorder-target');drag.to=targetIndex;event.preventDefault();
    });
    button.addEventListener('pointerup',event=>finishCategoryReorder(event));
    button.addEventListener('pointercancel',event=>finishCategoryReorder(event,true));
    categoryList.append(button);
  });
}
function finishCategoryReorder(event,cancelled=false){
  const drag=categoryReorder;if(!drag||drag.id!==event.pointerId)return;
  categoryReorder=null;categoryList.querySelectorAll('.reordering,.reorder-target').forEach(item=>item.classList.remove('reordering','reorder-target'));
  if(!drag.moved||cancelled)return;
  suppressCategoryClick=true;
  if(drag.to===drag.from)return;
  const activeCategory=categories[currentCategory],[moved]=categories.splice(drag.from,1);categories.splice(drag.to,0,moved);
  currentCategory=categories.indexOf(activeCategory);pages=categories[currentCategory].pages;state=pages[currentPage];
  localStorage.setItem(CATEGORY_KEY,String(currentCategory));renderCategoryBar();recordHistory();saveBackup();clearTimeout(saveTimer);saveTimer=setTimeout(saveState,220);
}
function showCategoryBar(){closeColorPalette();renderCategoryBar();categoryBar.hidden=false}
function switchCategory(index){
  if(index<0||index>=categories.length)return;
  saveScroll();savePageIndex();currentCategory=index;localStorage.setItem(CATEGORY_KEY,String(currentCategory));
  pages=categories[currentCategory].pages;currentPage=Math.min(savedPageIndex(),pages.length-1);state=pages[currentPage];
  removeEmptyHiddenPages();focusSphere(null);contracted=false;categoryBar.hidden=true;render();restoreScroll();scheduleSave();
}
function createCategory(){
  const suggested=`P${categories.length+1}`,name=prompt('Nombre de la nueva categoría:',suggested)?.trim();if(!name)return;
  categories.push({name,pages:[{color:randomColor(),spheres:[],updatedAt:Date.now()}]});switchCategory(categories.length-1);
}
addCategory.addEventListener('click',createCategory);

function saveBackup(){
  try{localStorage.setItem(BACKUP_KEY,JSON.stringify(documentState()))}catch(error){console.warn('No se pudo guardar el respaldo local.',error)}
}
function stateTextLength(value){return normalizeDocument(value).categories.reduce((total,category)=>total+category.pages.reduce((pageTotal,page)=>pageTotal+page.spheres.reduce((sum,sphere)=>sum+(sphere.text?.length??0),0),0),0)}
function shouldUseFolderState(folderState,backupState){
  if(!backupState)return true;
  const folderText=stateTextLength(folderState), backupText=stateTextLength(backupState);
  if(backupText>folderText)return false;
  return (folderState.updatedAt??0)>=(backupState.updatedAt??0);
}
function restoreBackup(){
  try{const stored=localStorage.getItem(BACKUP_KEY);if(!stored)return false;const loaded=JSON.parse(stored);if(!Array.isArray(loaded.categories)&&!Array.isArray(loaded.pages)&&!Array.isArray(loaded.spheres))return false;setDocument(loaded);return true}
  catch(error){console.warn('No se pudo recuperar el respaldo local.',error);return false}
}
function scheduleSave(){state.updatedAt=Date.now();recordHistory();saveBackup();clearTimeout(saveTimer);saveTimer=setTimeout(saveState,220)}
async function saveState(){
  if(nativeApp){
    try{await window.Capacitor.Plugins.Filesystem.writeFile({path:STATE_FILE,data:JSON.stringify(documentState()),directory:'DATA',encoding:'utf8'})}
    catch(error){console.error('No se pudo guardar el estado privado de Android.',error)}
    return;
  }
  if(!directoryHandle)return;
  try{const handle=await directoryHandle.getFileHandle(STATE_FILE,{create:true}),writable=await handle.createWritable();await writable.write(JSON.stringify(documentState(),null,2));await writable.close()}
  catch(error){console.error(error);notice.hidden=false;errorText.textContent='Se perdió el acceso a la carpeta. Vuelve a seleccionarla.'}
}
async function loadNativeState(){
  try{
    const result=await window.Capacitor.Plugins.Filesystem.readFile({path:STATE_FILE,directory:'DATA',encoding:'utf8'}),loaded=JSON.parse(result.data);
    if(Array.isArray(loaded.categories)||Array.isArray(loaded.pages)||Array.isArray(loaded.spheres))setDocument(loaded);
  }catch(error){if(!String(error?.message??error).toLowerCase().includes('not exist'))console.warn('No se pudo leer el estado privado de Android.',error)}
  saveBackup();focusSphere(null);render();resetHistory();restoreScroll();
}
async function loadState(){
  const backupState=structuredClone(documentState());
  try{const handle=await directoryHandle.getFileHandle(STATE_FILE),file=await handle.getFile(),loaded=JSON.parse(await file.text());if((Array.isArray(loaded.categories)||Array.isArray(loaded.pages)||Array.isArray(loaded.spheres))&&shouldUseFolderState(loaded,backupState))setDocument(loaded)}
  catch(error){if(error.name!=='NotFoundError')console.warn('No se pudo leer la carpeta; se usará el respaldo local.',error);restoreBackup();}
  saveBackup();focusSphere(null);render();resetHistory();restoreScroll();
}
function openDb(){return new Promise((resolve,reject)=>{const req=indexedDB.open('esferas-local',1);req.onupgradeneeded=()=>req.result.createObjectStore('handles');req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error)})}
async function storeHandle(handle){const db=await openDb(),tx=db.transaction('handles','readwrite');tx.objectStore('handles').put(handle,'directory');await new Promise((resolve,reject)=>{tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error)});db.close()}
async function recoverHandle(){const db=await openDb(),tx=db.transaction('handles','readonly'),req=tx.objectStore('handles').get('directory');const handle=await new Promise((resolve,reject)=>{req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error)});db.close();return handle}

choose.addEventListener('click',async()=>{
  errorText.textContent='';
  try{directoryHandle=await window.showDirectoryPicker({mode:'readwrite'});await storeHandle(directoryHandle);notice.hidden=true;await loadState();if(!state.spheres.length&&!images().length)addSphere(false);await saveState()}
  catch(error){if(error.name!=='AbortError')errorText.textContent='No fue posible acceder a esa carpeta.'}
});

async function init(){
  restoreBackup();resetHistory();
  if(nativeApp){notice.hidden=true;await loadNativeState();if(!state.spheres.length&&!images().length)addSphere(false);document.documentElement.classList.remove('restoring-view');return}
  if(coarsePointer){notice.hidden=true;render();if(!state.spheres.length&&!images().length)addSphere(false);resetHistory();restoreScroll();return}
  if(!('showDirectoryPicker'in window)){
    notice.hidden=false;choose.disabled=true;errorText.textContent='Este navegador no admite acceso local a carpetas. Usa Chrome o Edge.';document.documentElement.classList.remove('restoring-view');return;
  }
  try{const stored=await recoverHandle();if(stored&&await stored.queryPermission({mode:'readwrite'})==='granted'){directoryHandle=stored;await loadState();if(!state.spheres.length&&!images().length)addSphere(false);return}}catch(error){console.error(error)}
  notice.hidden=false;render();resetHistory();restoreScroll();
}
window.addEventListener('beforeunload',()=>{saveScroll();saveBackup()});
resetHistory();init();
