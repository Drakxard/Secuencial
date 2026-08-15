const STATE_FILE='esferas.json', BACKUP_KEY='esferas-respaldo-v1', SCROLL_KEY='esferas-scroll-v2', PAGE_KEY='esferas-pagina-v1', SIZE=168;
const board=document.querySelector('#board'), notice=document.querySelector('#folderNotice'), choose=document.querySelector('#chooseFolder'), errorText=document.querySelector('#folderError');
let directoryHandle=null, saveTimer=null, selectedId=null, selectedIds=new Set(), contracted=false, drag=null, resizeDrag=null, marquee=null, lastSphereClick=null, altNumericCode='', altKeyHeld=false;
let mouse={x:innerWidth/2,y:innerHeight/2};
const caretPositions=new Map();
const selectionRanges=new Map();
let state={color:randomColor(),spheres:[]}, pages=[state], currentPage=0, restoringScroll=false;

function normalizeDocument(value){
  const rawPages=Array.isArray(value?.pages)?value.pages:Array.isArray(value?.spheres)?[value]:[];
  const validPages=rawPages.filter(page=>Array.isArray(page?.spheres)&&typeof page?.color==='string');
  return{pages:validPages.length?validPages:[{color:randomColor(),spheres:[]}],updatedAt:value?.updatedAt??0};
}
function documentState(){return{pages,updatedAt:Math.max(0,...pages.map(page=>page.updatedAt??0))}}
function savedPageIndex(){const value=Number(localStorage.getItem(PAGE_KEY));return Number.isInteger(value)&&value>=0?value:0}
function setDocument(value){
  const normalized=normalizeDocument(value);pages=normalized.pages;
  currentPage=Math.min(savedPageIndex(),pages.length-1);state=pages[currentPage];
}

function randomColor(){const row=Math.floor(Math.random()*8),col=Math.floor(Math.random()*16);return `hsl(${col*22.5} ${Math.max(55,92-row*5)}% ${Math.max(22,92-row*10)}%)`}
function textColor(){return Number(state.color.match(/(\d+)%\)$/)?.[1]??60)<48?'#f8fafc':'#172033'}
function selected(){return state.spheres.find(s=>s.id===selectedId)}
function rangeFor(sphere){const caret=Math.max(0,Math.min(sphere.text.length,caretPositions.get(sphere.id)??sphere.text.length));return selectionRanges.get(sphere.id)??{anchor:caret,focus:caret}}
function caretFor(sphere){return rangeFor(sphere).focus}
function setRange(sphere,anchor,focus=anchor){const limit=sphere.text.length,range={anchor:Math.max(0,Math.min(limit,anchor)),focus:Math.max(0,Math.min(limit,focus))};selectionRanges.set(sphere.id,range);caretPositions.set(sphere.id,range.focus)}
function focusSphere(id){selectedId=id;selectedIds=new Set(id?[id]:[]);const sphere=selected();if(sphere&&!caretPositions.has(id))setRange(sphere,sphere.text.length)}
function removeSphere(id){state.spheres=state.spheres.filter(sphere=>sphere.id!==id);caretPositions.delete(id);selectionRanges.delete(id);selectedIds.delete(id);if(selectedId===id)selectedId=null}
function sphereSize(s){return SIZE*(s.scale??1)}
function sphereWidth(s){return s.shape==='square'?(s.width??sphereSize(s)):sphereSize(s)}
function sphereHeight(s){return s.shape==='square'?(s.height??sphereSize(s)):sphereSize(s)}
function spherePadding(s){return s.shape==='square'?8:Math.min(sphereWidth(s),sphereHeight(s))*.15}
function position(index,s){const size=sphereSize(s);if(!contracted)return{x:s.x,y:s.y};const n=Math.min(index,8);return{x:Math.max(12,(innerWidth-size)/2)+n*3,y:Math.max(12,(innerHeight-size)/2)+n*3}}
function canvasHeight(){return Math.max(innerHeight*3,state.spheres.reduce((bottom,sphere)=>Math.max(bottom,sphere.y+sphereHeight(sphere)+Math.round(innerHeight*.7)),innerHeight))}

function openPosition(size){
  const margin=18,maxX=Math.max(margin,innerWidth-size-margin),minY=scrollY+margin,maxY=Math.max(minY,scrollY+innerHeight-size-margin),candidates=[];
  for(let y=minY;y<=maxY;y+=28)for(let x=margin;x<=maxX;x+=28)candidates.push({x,y});
  candidates.push({x:maxX,y:maxY},{x:margin,y:maxY},{x:maxX,y:minY});
  const scored=candidates.map(candidate=>{
    const cx=candidate.x+size/2,cy=candidate.y+size/2;
    const distanceToMouse=Math.hypot(cx-mouse.x,cy-mouse.y),mouseGap=distanceToMouse-size/2-20;
    let sphereGap=Infinity,overlap=0;
    state.spheres.forEach(item=>{
      const itemWidth=sphereWidth(item),itemHeight=sphereHeight(item),ix=item.x+itemWidth/2,iy=item.y+itemHeight/2;
      const gap=Math.hypot(cx-ix,cy-iy)-size/2-Math.hypot(itemWidth,itemHeight)/2-12;
      sphereGap=Math.min(sphereGap,gap);if(gap<0)overlap+=-gap;
    });
    const free=mouseGap>=0&&sphereGap>=0;
    return{...candidate,free,score:free?-distanceToMouse:-(overlap+Math.max(0,-mouseGap)*2+distanceToMouse*.01)};
  });
  return scored.sort((a,b)=>Number(b.free)-Number(a.free)||b.score-a.score)[0]??{x:margin,y:margin};
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
  let changed=false;
  const padding=spherePadding(sphere),measure=text.cloneNode(true);
  measure.querySelectorAll('.text-caret').forEach(caret=>caret.remove());
  Object.assign(measure.style,{position:'fixed',left:'-10000px',top:'0',width:'max-content',maxWidth:'none',height:'auto',visibility:'hidden',whiteSpace:'pre',pointerEvents:'none'});
  document.body.append(measure);
  const naturalWidth=measure.scrollWidth+padding*2+8;measure.remove();
  const maxWidth=Math.max(90,innerWidth-sphere.x-18),nextWidth=Math.min(maxWidth,Math.max(sphereWidth(sphere),naturalWidth));
  if(nextWidth>sphereWidth(sphere)+.5){sphere.width=nextWidth;el.style.setProperty('--sphere-width',`${nextWidth}px`);changed=true}
  const neededHeight=text.scrollHeight+padding*2+12,nextHeight=Math.max(90,neededHeight);
  if(Math.abs(nextHeight-sphereHeight(sphere))>.5){sphere.height=nextHeight;el.style.setProperty('--sphere-height',`${nextHeight}px`);changed=true}
  if(changed)scheduleSave();
}

function render(){
  board.replaceChildren();
  board.style.height=`${canvasHeight()}px`;
  state.spheres.forEach((sphere,index)=>{
    const el=document.createElement('article'),pos=position(index,sphere),text=document.createElement('div');
    el.className=`sphere${sphere.shape==='square'?' square':''}${selectedIds.has(sphere.id)?' selected':''}${sphere.id===selectedId?' focused':''}`; el.dataset.id=sphere.id;
    Object.assign(el.style,{left:`${pos.x}px`,top:`${pos.y}px`,zIndex:sphere.id===selectedId?state.spheres.length+2:index+1});
    el.style.setProperty('--sphere-color',state.color); el.style.setProperty('--sphere-text',textColor()); el.style.setProperty('--sphere-width',`${sphereWidth(sphere)}px`);el.style.setProperty('--sphere-height',`${sphereHeight(sphere)}px`); el.style.setProperty('--sphere-padding',`${spherePadding(sphere)}px`);el.style.setProperty('--sphere-font-size',`${17*(sphere.fontScale??1)}px`);
    text.className='sphere-text';
    if(sphere.id===selectedId){
      const range=rangeFor(sphere),start=Math.min(range.anchor,range.focus),end=Math.max(range.anchor,range.focus),caret=document.createElement('span'),highlight=document.createElement('span');caret.className='text-caret';highlight.className='selected-text';highlight.textContent=sphere.text.slice(start,end);
      const bullets=sphere.shape==='square';
      highlight.replaceChildren();appendMathText(highlight,sphere.text.slice(start,end),bullets,start===0||sphere.text[start-1]==='\n');
      appendMathText(text,sphere.text.slice(0,start),bullets,true,false);
      if(range.focus===start)text.append(caret,highlight);else text.append(highlight,caret);
      appendMathText(text,sphere.text.slice(end),bullets,end===0||sphere.text[end-1]==='\n');
      if(!sphere.text){const placeholder=document.createElement('span');placeholder.className='text-placeholder';placeholder.textContent='Escribe…';text.append(placeholder)}
    }else{if(sphere.text)appendMathText(text,sphere.text,sphere.shape==='square',true,false);else{text.textContent='Escribe…';text.style.opacity='.48'}}
    el.append(text);
    if(sphere.shape==='square'&&sphere.id===selectedId){
      ['nw','ne','sw','se'].forEach(corner=>{const handle=document.createElement('span');handle.className=`resize-handle ${corner}`;handle.dataset.corner=corner;el.append(handle)});
    }
    board.append(el);fitSquareToText(sphere,el,text);
  });
}

function addSphere(selectSphere=true){
  contracted=false;
  const place=openPosition(SIZE);
  const sphere={id:crypto.randomUUID(),text:'',scale:1,x:place.x,y:place.y};
  state.spheres.push(sphere);
  if(selectSphere){focusSphere(sphere.id);setRange(sphere,0)}else focusSphere(null);
  contracted=false; render(); scheduleSave();
}

function type(event){
  const sphere=selected(); if(!sphere||event.ctrlKey||event.metaKey||event.altKey)return false;
  if(!sphere.text&&event.key==='Backspace'){
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

function skipListMarkers(sphere,position,direction){
  if(sphere.shape!=='square')return position;
  const lineStart=sphere.text.lastIndexOf('\n',position-1)+1;
  let contentStart=lineStart;while(sphere.text[contentStart]==='\t')contentStart++;
  return position>lineStart&&position<contentStart?(direction>0?contentStart:lineStart):position;
}

function moveCaret(event){
  const sphere=selected();if(!sphere)return false;
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
  const allTextSelected=sphere.text.length>0&&start===0&&end===sphere.text.length;
  if(allTextSelected){
    sphere.fontScale=Math.max(.35,Math.min(4,(sphere.fontScale??1)*(grow?1.06:.94)));
  }else{
    state.spheres.filter(item=>selectedIds.has(item.id)).forEach(item=>{
      if(item.shape==='square'){
        const factor=grow?1.05:.95;
        item.width=Math.max(90,Math.min(innerWidth,sphereWidth(item)*factor));
        item.height=Math.max(90,sphereHeight(item)*factor);
      }else item.scale=Math.max(.4,Math.min(3,(item.scale??1)*(grow?1.05:.95)));
      item.x=Math.max(0,Math.min(innerWidth-sphereWidth(item),item.x));
      item.y=Math.max(0,item.y);
    });
  }
  render();scheduleSave();return true;
}

function changeListLevel(event){
  const sphere=selected();if(event.key!=='Tab'||!sphere||sphere.shape!=='square')return false;
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
  if(character&&selected())type({key:character,ctrlKey:false,metaKey:false,altKey:false});
}

document.addEventListener('keydown',event=>{
  if(!notice.hidden)return;
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
  if(!selected()&&!event.ctrlKey&&!event.metaKey&&!event.altKey&&(event.key==='ArrowRight'||event.key==='ArrowLeft')){
    event.preventDefault();switchPage(event.key==='ArrowRight'?1:-1);return;
  }
  if((event.ctrlKey||event.metaKey)&&event.key.toLowerCase()==='a'){
    const sphere=selected();if(!sphere)return;
    event.preventDefault();setRange(sphere,0,sphere.text.length);render();return;
  }
  if((event.ctrlKey||event.metaKey)&&(growKey||shrinkKey)){
    if(resizeSelection(!shrinkKey))event.preventDefault();return;
  }
  if(changeListLevel(event)){event.preventDefault();return}
  if(event.key==='+'){event.preventDefault();addSphere();return}
  if(moveCaret(event)){event.preventDefault();return}
  if(type(event))event.preventDefault();
});

document.addEventListener('keyup',event=>{
  if(event.key!=='Alt'&&event.code!=='AltLeft'&&event.code!=='AltRight')return;
  altKeyHeld=false;finishAltNumericCode();event.preventDefault();
});

window.addEventListener('blur',()=>{altKeyHeld=false;finishAltNumericCode()});

document.addEventListener('wheel',event=>{
  if(!notice.hidden||!event.ctrlKey||!selected())return;
  event.preventDefault();resizeSelection(event.deltaY<0);
},{passive:false});

document.addEventListener('copy',event=>{
  const sphere=selected();if(!sphere)return;
  const range=rangeFor(sphere),start=Math.min(range.anchor,range.focus),end=Math.max(range.anchor,range.focus);if(start===end)return;
  event.clipboardData.setData('text/plain',sphere.text.slice(start,end));event.preventDefault();
});

document.addEventListener('paste',event=>{
  if(!notice.hidden)return;
  const sphere=selected(),pastedText=event.clipboardData.getData('text/plain');
  if(!sphere||!pastedText)return;
  event.preventDefault();
  const range=rangeFor(sphere),start=Math.min(range.anchor,range.focus),end=Math.max(range.anchor,range.focus);
  sphere.text=sphere.text.slice(0,start)+pastedText+sphere.text.slice(end);
  setRange(sphere,start+pastedText.length);
  render();scheduleSave();
});

board.addEventListener('pointerdown',event=>{
  const el=event.target.closest('.sphere');
  if(!el){
    lastSphereClick=null;
    marquee={id:event.pointerId,startX:event.clientX,startY:event.clientY+scrollY,element:document.createElement('div')};
    marquee.element.className='selection-box'; board.append(marquee.element); board.setPointerCapture(event.pointerId);
    updateMarquee(event.clientX,event.clientY+scrollY); return;
  }
  const handle=event.target.closest('.resize-handle');
  if(handle){
    const sphere=state.spheres.find(item=>item.id===el.dataset.id);if(!sphere)return;
    selectedId=sphere.id;selectedIds=new Set([sphere.id]);lastSphereClick=null;
    resizeDrag={id:event.pointerId,sphere,corner:handle.dataset.corner,startX:event.clientX,startY:event.clientY,x:sphere.x,y:sphere.y,width:sphereWidth(sphere),height:sphereHeight(sphere)};
    el.setPointerCapture(event.pointerId);event.preventDefault();return;
  }
  const now=performance.now(),previous=lastSphereClick;
  if(previous&&previous.id===el.dataset.id&&now-previous.time<420&&Math.hypot(event.clientX-previous.x,event.clientY-previous.y)<7){
    const sphere=state.spheres.find(item=>item.id===el.dataset.id);
    lastSphereClick=null;event.preventDefault();
    sphere.shape=sphere.shape==='square'?'circle':'square';render();scheduleSave();return;
  }
  lastSphereClick={id:el.dataset.id,time:now,x:event.clientX,y:event.clientY};
  mouse={x:event.clientX,y:event.clientY+scrollY};
  if(!selectedIds.has(el.dataset.id))focusSphere(el.dataset.id);
  else{selectedId=el.dataset.id}
  const clickedSphere=selected();if(clickedSphere)setRange(clickedSphere,clickedSphere.text.length);
  contracted=false;
  const movingSpheres=state.spheres.filter(sphere=>selectedIds.has(sphere.id));
  drag={id:event.pointerId,startX:event.clientX,startY:event.clientY,items:movingSpheres.map(sphere=>({sphere,x:sphere.x,y:sphere.y}))};render();
  const active=board.querySelector(`[data-id="${selectedId}"]`); active.setPointerCapture(event.pointerId); active.classList.add('dragging');
});
board.addEventListener('dblclick',event=>{
  if(event.target.closest('.sphere'))return;
  mouse={x:event.clientX,y:event.clientY+scrollY};
  event.preventDefault();addSphere();
});
board.addEventListener('pointermove',event=>{
  mouse={x:event.clientX,y:event.clientY+scrollY};
  if(marquee&&event.pointerId===marquee.id){updateMarquee(event.clientX,event.clientY+scrollY);return}
  if(resizeDrag&&event.pointerId===resizeDrag.id){
    const item=resizeDrag,dx=event.clientX-item.startX,dy=event.clientY-item.startY,min=90;
    let left=item.x,right=item.x+item.width,top=item.y,bottom=item.y+item.height;
    if(item.corner.includes('e'))right=Math.min(innerWidth,Math.max(left+min,right+dx));
    if(item.corner.includes('w'))left=Math.max(0,Math.min(right-min,left+dx));
    if(item.corner.includes('s'))bottom=Math.max(top+min,bottom+dy);
    if(item.corner.includes('n'))top=Math.max(0,Math.min(bottom-min,top+dy));
    Object.assign(item.sphere,{x:left,y:top,width:right-left,height:bottom-top});
    const active=board.querySelector(`[data-id="${item.sphere.id}"]`);
    Object.assign(active.style,{left:`${left}px`,top:`${top}px`});active.style.setProperty('--sphere-width',`${right-left}px`);active.style.setProperty('--sphere-height',`${bottom-top}px`);return;
  }
  if(!drag||event.pointerId!==drag.id)return;
  if(Math.hypot(event.clientX-drag.startX,event.clientY-drag.startY)>=7)lastSphereClick=null;
  let dx=event.clientX-drag.startX,dy=event.clientY-drag.startY;
  const minDx=Math.max(...drag.items.map(item=>-item.x)),maxDx=Math.min(...drag.items.map(item=>innerWidth-sphereWidth(item.sphere)-item.x));
  const minDy=Math.max(...drag.items.map(item=>-item.y)),maxDy=Math.min(...drag.items.map(item=>canvasHeight()-sphereHeight(item.sphere)-item.y));
  dx=Math.max(minDx,Math.min(maxDx,dx));dy=Math.max(minDy,Math.min(maxDy,dy));
  drag.items.forEach(item=>{
    item.sphere.x=item.x+dx;item.sphere.y=item.y+dy;
    const el=board.querySelector(`[data-id="${item.sphere.id}"]`);el.style.left=`${item.sphere.x}px`;el.style.top=`${item.sphere.y}px`;
  });
});
function updateMarquee(x,y){
  const left=Math.min(marquee.startX,x), top=Math.min(marquee.startY,y), width=Math.abs(x-marquee.startX), height=Math.abs(y-marquee.startY);
  Object.assign(marquee.element.style,{left:`${left}px`,top:`${top}px`,width:`${width}px`,height:`${height}px`});
  selectedIds=new Set(state.spheres.filter(s=>{
    const p=position(state.spheres.indexOf(s),s),itemWidth=sphereWidth(s),itemHeight=sphereHeight(s);
    return p.x<left+width&&p.x+itemWidth>left&&p.y<top+height&&p.y+itemHeight>top;
  }).map(s=>s.id));
  selectedId=[...selectedIds][0]??null;if(selectedId&&!caretPositions.has(selectedId))caretPositions.set(selectedId,selected()?.text.length??0);
  board.querySelectorAll('.sphere').forEach(el=>el.classList.toggle('selected',selectedIds.has(el.dataset.id)));
  board.querySelectorAll('.sphere').forEach(el=>el.classList.toggle('focused',el.dataset.id===selectedId));
}
function endDrag(event){
  if(marquee&&event.pointerId===marquee.id){marquee.element.remove();marquee=null;render();return}
  if(resizeDrag&&event.pointerId===resizeDrag.id){resizeDrag=null;scheduleSave();render();return}
  if(!drag||event.pointerId!==drag.id)return;drag=null;scheduleSave();render()
}
board.addEventListener('pointerup',endDrag); board.addEventListener('pointercancel',endDrag);
window.addEventListener('pointermove',event=>{mouse={x:event.clientX,y:event.clientY+scrollY}});
window.addEventListener('resize',()=>{state.spheres.forEach(s=>{s.x=Math.max(0,Math.min(innerWidth-sphereWidth(s),s.x));s.y=Math.max(0,s.y)});render();scheduleSave()});
let scrollTimer=null;
function scrollPositions(){
  try{
    const value=JSON.parse(localStorage.getItem(SCROLL_KEY));
    if(value&&typeof value==='object')return value;
    const legacy=Number(localStorage.getItem('esferas-scroll-v1'));return Number.isFinite(legacy)?{0:legacy}:{};
  }catch{return{}}
}
function saveScroll(){const positions=scrollPositions();positions[currentPage]=scrollY;localStorage.setItem(SCROLL_KEY,JSON.stringify(positions))}
window.addEventListener('scroll',()=>{if(restoringScroll)return;clearTimeout(scrollTimer);scrollTimer=setTimeout(saveScroll,100)},{passive:true});
function restoreScroll(){
  const saved=Number(scrollPositions()[currentPage]??0);restoringScroll=true;
  requestAnimationFrame(()=>requestAnimationFrame(()=>{scrollTo(0,Number.isFinite(saved)?saved:0);restoringScroll=false}));
}
function switchPage(direction){
  const next=currentPage+direction;if(next<0)return;
  saveScroll();
  if(next>=pages.length)pages.push({color:randomColor(),spheres:[],updatedAt:Date.now()});
  currentPage=next;state=pages[currentPage];localStorage.setItem(PAGE_KEY,String(currentPage));
  focusSphere(null);contracted=false;render();restoreScroll();scheduleSave();
}

function saveBackup(){
  try{localStorage.setItem(BACKUP_KEY,JSON.stringify(documentState()))}catch(error){console.warn('No se pudo guardar el respaldo local.',error)}
}
function stateTextLength(value){return normalizeDocument(value).pages.reduce((total,page)=>total+page.spheres.reduce((sum,sphere)=>sum+(sphere.text?.length??0),0),0)}
function shouldUseFolderState(folderState,backupState){
  if(!backupState)return true;
  const folderText=stateTextLength(folderState), backupText=stateTextLength(backupState);
  if(backupText>folderText)return false;
  return (folderState.updatedAt??0)>=(backupState.updatedAt??0);
}
function restoreBackup(){
  try{const stored=localStorage.getItem(BACKUP_KEY);if(!stored)return false;const loaded=JSON.parse(stored);if(!Array.isArray(loaded.pages)&&!Array.isArray(loaded.spheres))return false;setDocument(loaded);return true}
  catch(error){console.warn('No se pudo recuperar el respaldo local.',error);return false}
}
function scheduleSave(){state.updatedAt=Date.now();saveBackup();clearTimeout(saveTimer);saveTimer=setTimeout(saveState,220)}
async function saveState(){
  if(!directoryHandle)return;
  try{const handle=await directoryHandle.getFileHandle(STATE_FILE,{create:true}),writable=await handle.createWritable();await writable.write(JSON.stringify(documentState(),null,2));await writable.close()}
  catch(error){console.error(error);notice.hidden=false;errorText.textContent='Se perdió el acceso a la carpeta. Vuelve a seleccionarla.'}
}
async function loadState(){
  const backupState=structuredClone(documentState());
  try{const handle=await directoryHandle.getFileHandle(STATE_FILE),file=await handle.getFile(),loaded=JSON.parse(await file.text());if((Array.isArray(loaded.pages)||Array.isArray(loaded.spheres))&&shouldUseFolderState(loaded,backupState))setDocument(loaded)}
  catch(error){if(error.name!=='NotFoundError')console.warn('No se pudo leer la carpeta; se usará el respaldo local.',error);restoreBackup();}
  saveBackup();focusSphere(null);render();restoreScroll();
}
function openDb(){return new Promise((resolve,reject)=>{const req=indexedDB.open('esferas-local',1);req.onupgradeneeded=()=>req.result.createObjectStore('handles');req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error)})}
async function storeHandle(handle){const db=await openDb(),tx=db.transaction('handles','readwrite');tx.objectStore('handles').put(handle,'directory');await new Promise((resolve,reject)=>{tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error)});db.close()}
async function recoverHandle(){const db=await openDb(),tx=db.transaction('handles','readonly'),req=tx.objectStore('handles').get('directory');const handle=await new Promise((resolve,reject)=>{req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error)});db.close();return handle}

choose.addEventListener('click',async()=>{
  errorText.textContent='';
  try{directoryHandle=await window.showDirectoryPicker({mode:'readwrite'});await storeHandle(directoryHandle);notice.hidden=true;await loadState();if(!state.spheres.length)addSphere(false);await saveState()}
  catch(error){if(error.name!=='AbortError')errorText.textContent='No fue posible acceder a esa carpeta.'}
});

async function init(){
  restoreBackup();
  if(!('showDirectoryPicker'in window)){notice.hidden=false;choose.disabled=true;errorText.textContent='Este navegador no admite acceso local a carpetas. Usa Chrome o Edge.';return}
  try{const stored=await recoverHandle();if(stored&&await stored.queryPermission({mode:'readwrite'})==='granted'){directoryHandle=stored;await loadState();if(!state.spheres.length)addSphere(false);return}}catch(error){console.error(error)}
  notice.hidden=false;render();restoreScroll();
}
window.addEventListener('beforeunload',()=>{saveScroll();saveBackup()});
init();
