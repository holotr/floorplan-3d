const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const html = fs.readFileSync('index.html','utf8');
function data(){
  const start = html.indexOf('const PLAN =');
  assert.ok(start >= 0, 'plan must identify its geometry and dimensions');
  const end = html.indexOf('const MATS =', start);
  const ctx = {};
  vm.runInNewContext(html.slice(start,end) + ';globalThis.data={PLAN,WALLS,WINS,DOORS,SLIDES,ROOMS,DIMENSIONS};',ctx);
  return JSON.parse(JSON.stringify(ctx.data));
}
const area = p => Math.abs(p.reduce((a,r,i)=>{const q=p[(i+1)%p.length];return a+r[0]*q[1]-q[0]*r[1]},0))/2e6;
const overlap = (a,b) => Math.min(a[2],b[2])>Math.max(a[0],b[0]) && Math.min(a[3],b[3])>Math.max(a[1],b[1]);
function inside(p,poly){let on=false;for(let i=0,j=poly.length-1;i<poly.length;j=i++){const a=poly[i],b=poly[j];if((a[1]>p[1])!==(b[1]>p[1])&&p[0]<(b[0]-a[0])*(p[1]-a[1])/(b[1]-a[1])+a[0])on=!on;}return on;}
test('official exterior and measured non-wet room dimensions close',()=>{
  const d=data(), r=Object.fromEntries(d.ROOMS.map(r=>[r.id,r]));
  assert.equal(d.PLAN.width,10700);assert.equal(d.PLAN.depth,11550);
  for(const [id,width,depth] of [['elder',2870,2874],['study',2677,2874],['master',3365,4771]]){
    const p=r[id].poly;assert.equal(Math.max(...p.map(v=>v[0]))-Math.min(...p.map(v=>v[0])),width);assert.equal(Math.max(...p.map(v=>v[1]))-Math.min(...p.map(v=>v[1])),depth);
  }
  assert.equal(Math.round(area(r.elder.poly)*100)/100,8.25);
  assert.equal(Math.round(area(r.study.poly)*100)/100,7.69);
  assert.equal(Math.round(area(r.master.poly)*100)/100,16.05);
  assert.equal(Math.round(area(r.secondary.poly)*100)/100,13.16);
  const lowEdge=r.secondary.poly.filter(p=>p[1]===11500);
  assert.equal(Math.max(...lowEdge.map(p=>p[0]))-Math.min(...lowEdge.map(p=>p[0])),2964);
  assert.ok(r.secondary.poly.some(p=>p[0]===10547&&p[1]===11500-3883));
  const livingEdge=r.living.poly.filter(p=>p[1]===11500);
  assert.equal(Math.max(...livingEdge.map(p=>p[0]))-Math.min(...livingEdge.map(p=>p[0])),3765);
  for(const id of ['utility','storage'])assert.equal(Math.max(...r[id].poly.map(p=>p[1]))-Math.min(...r[id].poly.map(p=>p[1])),958);
  for(const value of [9300,10700,11550,2870,2600,2677,2874,3365,3765,2964,4771,3883,3100,1750,1800,958])assert.ok(d.DIMENSIONS.some(x=>Math.abs(x.end-x.start)===value),`missing measured dimension ${value}`);
});
test('door/window apertures are clear, dimensionally valid and on the floor boundary',()=>{
  const d=data();
  for(const r of [...d.WALLS,...d.WINS,...d.DOORS.map(d=>d.rect),...d.SLIDES.map(d=>d.rect)]){
    assert.ok(r[2]>r[0]&&r[3]>r[1],`invalid rectangle ${r}`);
    assert.ok(r[0]>=0&&r[1]>=0&&r[2]<=d.PLAN.width&&r[3]<=d.PLAN.depth);
  }
  for(const r of [...d.WINS,...d.DOORS.map(d=>d.rect),...d.SLIDES.map(d=>d.rect)])for(const w of d.WALLS)assert.ok(!overlap(r,w),`opening ${r} overlaps wall ${w}`);
  for(const door of d.DOORS){
    assert.equal(Math.max(door.rect[2]-door.rect[0],door.rect[3]-door.rect[1]),door.len,door.name);
    assert.equal(Math.abs(door.c[0]*door.o[0]+door.c[1]*door.o[1]),0);
    const end=[door.h[0]+door.c[0]*door.len,door.h[1]+door.c[1]*door.len];
    for(const p of [door.h,end])assert.ok(p[0]>=door.rect[0]&&p[0]<=door.rect[2]&&p[1]>=door.rect[1]&&p[1]<=door.rect[3],door.name);
  }
  // Every non-entry opening connects two rooms (sampling both sides).
  for(const door of [...d.DOORS.filter(d=>!d.entry),...d.SLIDES]){
    const r=door.rect,c=[(r[0]+r[2])/2,(r[1]+r[3])/2],vertical=r[3]-r[1]>r[2]-r[0];
    const sides=vertical?[[r[0]-1,c[1]],[r[2]+1,c[1]]]:[[c[0],r[1]-1],[c[0],r[3]+1]];
    const ids=sides.map(p=>d.ROOMS.find(r=>inside(p,r.poly))?.id);
    assert.ok(ids[0]&&ids[1]&&ids[0]!==ids[1],`disconnected opening ${JSON.stringify(door)}: ${ids}`);
  }
});
test('room polygons do not overlap each other or wall footprints',()=>{
  const d=data();
  // Axis-aligned polygons: exact decomposition by every x/y vertex, not a coarse grid.
  const xs=[...new Set([...d.ROOMS.flatMap(r=>r.poly.map(p=>p[0])),...d.WALLS.flatMap(w=>[w[0],w[2]])])].sort((a,b)=>a-b);
  const ys=[...new Set([...d.ROOMS.flatMap(r=>r.poly.map(p=>p[1])),...d.WALLS.flatMap(w=>[w[1],w[3]])])].sort((a,b)=>a-b);
  for(let i=1;i<xs.length;i++)for(let j=1;j<ys.length;j++){
    const p=[(xs[i-1]+xs[i])/2,(ys[j-1]+ys[j])/2],rooms=d.ROOMS.filter(r=>inside(p,r.poly));
    assert.ok(rooms.length<=1,`rooms overlap at ${p}`);
    if(rooms.length)assert.ok(!d.WALLS.some(w=>p[0]>w[0]&&p[0]<w[2]&&p[1]>w[1]&&p[1]<w[3]),`floor crosses a wall at ${p} (${rooms[0].id})`);
  }
  assert.ok(d.ROOMS.some(r=>r.id==='living'&&inside(d.PLAN.walk.position,r.poly)),'walk must start on the foyer floor');
});
test('new plan storage and imports cannot reuse old wall indices',()=>{
  const d=data();
  assert.ok(html.includes("const STORE = 'huxing-' + PLAN.id"));
  const start=html.indexOf('function defaultState()'),end=html.indexOf('const PX_MM',start);
  const ctx={PLAN:d.PLAN,ROOMS:d.ROOMS,defaultFurniture:()=>[],localStorage:{getItem:()=>null}};
  vm.runInNewContext(html.slice(start,end)+';globalThis.fix=fixState;globalThis.fresh=defaultState;',ctx);
  assert.equal(ctx.fresh().planId,d.PLAN.id);
  assert.throws(()=>ctx.fix({furniture:[],demolished:['w0']}),/户型|plan/i);
  assert.equal(ctx.fix(ctx.fresh()).planId,d.PLAN.id);
});
test('default furniture footprints fit inside the reconstructed rooms',()=>{
  const d=data(),ctx={typeColor:()=> '#fff'};
  vm.runInNewContext(html.slice(html.indexOf('let _n = 1;'),html.indexOf('function defaultState()'))+';globalThis.items=defaultFurniture();',ctx);
  for(const f of ctx.items){
    const a=f.rot*Math.PI/180,c=Math.cos(a),s=Math.sin(a);
    for(const [u,v] of [[0,0],[-1,-1],[-1,1],[1,-1],[1,1]]){
      const x=u*(f.w/2-1),y=v*(f.d/2-1),p=[f.cx+c*x-s*y,f.cy+s*x+c*y];
      assert.ok(d.ROOMS.some(r=>inside(p,r.poly)),`${f.name} crosses floor boundary at ${p}`);
    }
  }
});
test('walking collides with actual short and wide door leaves',()=>{
  const ctx={colliders:[],doors:[],clamp01:t=>Math.max(0,Math.min(1,t))};
  vm.runInNewContext(html.slice(html.indexOf('function blocked('),html.indexOf('function stepWalk('))+';globalThis.block=blocked;',ctx);
  ctx.doors.push({len:1.1,pivot:{rotation:{y:0},position:{x:0,z:0}}});
  assert.equal(ctx.block(1.05,0,.05),true,'wide entry door must block its full length');
  ctx.doors[0].len=.6;
  assert.equal(ctx.block(.85,0,.05),false,'utility door must not create a phantom 900 mm barrier');
});
test('whole-home framing fits both portrait and landscape viewports',()=>{
  const d=data(),start=html.indexOf('function wholeDistance(');
  assert.ok(start>=0,'whole-home camera must fit the new footprint');
  const ctx={PLAN:d.PLAN,H:2.8,FOV:45,M:v=>v/1000,SW:()=>648,SH:()=>758};
  vm.runInNewContext(html.slice(start,html.indexOf('const isoWhole',start))+';globalThis.distance=wholeDistance;',ctx);
  const radius=Math.hypot(d.PLAN.width/2000,d.PLAN.depth/2000,2.8);
  for(const aspect of [.55,.855,1.33,2]){
    const halfV=45*Math.PI/360,halfH=Math.atan(Math.tan(halfV)*aspect);
    assert.ok(ctx.distance(aspect)*Math.sin(Math.min(halfV,halfH))>radius,'house bounds must remain inside the view frustum');
  }
});
test('bathroom return wall encloses the vanity and sideboard stays outside the bathroom',()=>{
  const d=data(),ctx={typeColor:()=> '#fff'};
  vm.runInNewContext(html.slice(html.indexOf('let _n = 1;'),html.indexOf('function defaultState()'))+';globalThis.items=defaultFurniture();',ctx);
  const cabinet=ctx.items.find(f=>f.id==='bath-sideboard');
  assert.ok(cabinet,'red-marked dining sideboard must be present');
  assert.equal(cabinet.type,'cabinet');assert.equal(cabinet.name,'餐边柜');
  assert.ok(cabinet.cx>3100&&cabinet.cx<3668&&cabinet.cy>4925&&cabinet.cy<6650);
  assert.ok(d.WALLS.some(w=>w[0]===3518&&w[2]===3668&&w[1]<=3900&&w[3]===4775),'black-marked vanity east wall');
  assert.ok(d.WALLS.some(w=>w[0]<=3100&&w[1]===4775&&w[2]===3668&&w[3]===4925),'black-marked return wall');
});
test('a whole-plan rematch isolates old layouts without rewriting their data',()=>{
  const d=data(),reads=[],writes=[],ctx={PLAN:d.PLAN,ROOMS:d.ROOMS,typeColor:()=> '#fff',localStorage:{getItem:k=>{reads.push(k);return null},setItem:(...a)=>writes.push(a)}};
  vm.runInNewContext(html.slice(html.indexOf('let _n = 1;'),html.indexOf('const PX_MM'))+';globalThis.fix=fixState;globalThis.fresh=defaultState;globalThis.loadPlan=load;',ctx);
  const legacy={planId:'measured-10694x11243-v1',layoutRevision:2,furniture:[{id:'my-chair',type:'chair',name:'我的餐椅',cx:5200,cy:5200,w:450,d:480,rot:30}],rooms:{living:{name:'我家客厅',mat:'wood'}},demolished:['w20'],measures:[]};
  const before=JSON.parse(JSON.stringify(legacy));
  assert.throws(()=>ctx.fix(legacy),/户型|plan/i);
  assert.deepEqual(legacy,before);
  ctx.loadPlan();
  assert.deepEqual(reads,['huxing-'+d.PLAN.id]);assert.equal(writes.length,0);
  assert.equal(ctx.fresh().furniture.filter(f=>f.id==='bath-sideboard').length,1);
});
test('unmeasured kitchen and baths carry official references and approximate area labels',()=>{
  const d=data(),r=Object.fromEntries(d.ROOMS.map(r=>[r.id,r]));
  for(const [id,spans] of [['kitchen',[2600,3100]],['gbath',[1750]],['mbath',[1800]]]){
    assert.equal(r[id].source,'official');assert.equal(r[id].estimated,true);assert.deepEqual(r[id].officialSpan,spans);
  }
  const ctx={};
  vm.runInNewContext(html.slice(html.indexOf('const area ='),html.indexOf('const perim ='))+';globalThis.label=roomAreaText;',ctx);
  assert.ok(ctx.label(r.kitchen).startsWith('≈ '));assert.ok(ctx.label(r.gbath).startsWith('≈ '));
  assert.equal(ctx.label(r.master),'16.05');
});
test('official WC inset remains exterior void rather than bathroom floor',()=>{
  const d=data(),bath=d.ROOMS.find(r=>r.id==='gbath');
  assert.equal(Math.min(...bath.poly.map(p=>p[0])),953);
  assert.ok(d.WALLS.some(w=>w[0]===800&&w[2]===953&&w[1]===3100));
  for(const r of d.ROOMS)assert.equal(inside([400,4000],r.poly),false,'official inset must not become indoor floor');
});
test('dimension mapping identifies the active plan and unresolved living boundary',()=>{
  const d=data(),docs=fs.readFileSync('docs/dimension-mapping.md','utf8');
  assert.ok(docs.includes(d.PLAN.id));
  assert.ok(docs.includes('huxing-'+d.PLAN.id));
  assert.ok(docs.includes(`${d.PLAN.width} × ${d.PLAN.depth}`));
  const living=d.ROOMS.find(r=>r.id==='living');
  assert.equal(living.measuredArea,35.49);assert.equal(living.estimated,true);
  assert.ok(docs.includes(area(living.poly).toFixed(2)));
  assert.ok(docs.includes((area(living.poly)-living.measuredArea).toFixed(2)));
  assert.equal(docs.includes('measured-10694x11243-v1'),false);
});
test('room properties distinguish estimated boundary extents from measured net spans',()=>{
  const d=data(),ctx={area,perim:()=>0,fmt:v=>v,nm:v=>v,esc:v=>v,tr:z=>z,
    roomAreaText:r=>`${r.estimated?'≈ ':''}${area(r.poly).toFixed(2)}`,
    bbox:p=>[Math.min(...p.map(v=>v[0])),Math.min(...p.map(v=>v[1])),Math.max(...p.map(v=>v[0])),Math.max(...p.map(v=>v[1]))],
    state:{rooms:Object.fromEntries(d.ROOMS.map(r=>[r.id,{name:r.name,mat:'tile'}])),furniture:[]},MATS:{tile:{name:'地砖',price:1,sw:'#fff'}}};
  vm.runInNewContext(html.slice(html.indexOf('function roomPanel('),html.indexOf('function bindRoomPanel('))+';globalThis.render=roomPanel;',ctx);
  const living=ctx.render(d.ROOMS.find(r=>r.id==='living'));
  assert.match(living,/边界宽度<\/small><span class="big">≈ 6581/);
  assert.match(living,/边界进深<\/small><span class="big">≈ 8400/);
  assert.match(living,/实测图面积 35.49 m².*差 2.75 m²/);
  const master=ctx.render(d.ROOMS.find(r=>r.id==='master'));
  assert.match(master,/边界宽度<\/small><span class="big">3365/);
  assert.match(master,/边界进深<\/small><span class="big">4771/);
});
