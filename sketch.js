// variabili per il canvas
let xMax = 400;
let yMax = 600;
// altre variabili globali
let table; // legacy: mantenuto per compatibilità (alfa)
// nuove tabelle per più droni
let tableAlfa, tableBravo, tableCharlie;

let bckgcolor = "#000000"   // sfondo nero per l'area 3D

// variabili globali per animazione/ordinamento
let sortedOrderMap = { alfa: [], bravo: [], charlie: [] }; // array di indici ordinati per timestamp
let visibleCountGlobal = 0;      // contatore globale usato per tutti i droni
let framesPerPoint = 0.2;    // regolare la velocità (minore = più veloce)

// flag per impostare la camera iniziale una sola volta sul graphics 3D
let initialCameraSet3d = false;

// intervalli globali (usati per mappare le traiettorie nello stesso sistema di assi)
let globalRanges = { xmin: 0, xmax: 1, ymin: 0, ymax: 1, zmin: 0, zmax: 1 };

// buffer grafico 3D e dimensioni/sezione
let gfx3d;
let gfxWFrac = 0.7; // percentuale di larghezza per il pannello 3D (0..1)
let gfxX = 0, gfxY = 0, gfxW = 0, gfxH = 0;

// camera 3D manuale (stile arcball) per gfx3d
let camTheta = 0;      // angolo orizzontale (radians) - 0 => +X
let camPhi = 0;        // angolo verticale (radians) - 0 => equatore
let camDistance = 400; // distanza iniziale
const CAM_MIN_DIST = 50;
const CAM_MAX_DIST = 2000;
const CAM_SENS_X = 0.005;
const CAM_SENS_Y = 0.005;
const CAM_ZOOM_SENS = 0.003;

function preload() {
  // carica i tre file CSV (se non presenti p5 darà errore in console)
  tableAlfa = loadTable("drone_alfa_data.csv", "csv", "header");
  tableBravo = loadTable("drone_bravo_data.csv", "csv", "header");
  tableCharlie = loadTable("drone_charlie_data.csv", "csv", "header");

  // variabile 'table' puntata ad alfa per compatibilità con codice esistente
  table = tableAlfa;
}

function setup() {
  createCanvas(windowWidth, windowHeight); // canvas principale 2D
  frameRate(30);

  // dimensioni pannello 3D
  gfxW = Math.floor(windowWidth * gfxWFrac);
  gfxH = windowHeight;
  gfxX = 0; gfxY = 0;
  gfx3d = createGraphics(gfxW, gfxH, WEBGL);

  computeSortedOrders();
  computeGlobalRanges();

  // impostazioni camera iniziali coerenti con camera(400,0,0,...)
  camTheta = 0;
  camPhi = 0;
  camDistance = 400;
}

function windowResized() {
  resizeCanvas(windowWidth, windowHeight);
  gfxW = Math.floor(windowWidth * gfxWFrac);
  gfxH = windowHeight;
  gfx3d.remove();
  gfx3d = createGraphics(gfxW, gfxH, WEBGL);
  // reset flag camera dopo la ricreazione del buffer grafico
  initialCameraSet3d = false;
}

// calcolo ordine e intervalli globali 
function computeSortedOrders() {
  sortedOrderMap = { alfa: [], bravo: [], charlie: [] };
  computeSortedOrderFor(tableAlfa, 'alfa');
  computeSortedOrderFor(tableBravo, 'bravo');
  computeSortedOrderFor(tableCharlie, 'charlie');
}

function computeSortedOrderFor(t, key) {
  const arr = [];
  const validRows = [];
  if (!t) { sortedOrderMap[key] = []; return; }
  const n = t.getRowCount();
  for (let i = 0; i < n; i++) {
    // valore usato per ordinare: preferisce 'timestamp', altrimenti colonna 1
    let orderVal = t.getNum(i, 'timestamp');
    if (!isFinite(orderVal)) orderVal = parseFloat(t.getString(i, 1));
    // lettura coordinate (con fallback a stringhe se necessario)
    let xv = t.getNum(i, 'x_pos'); if (!isFinite(xv)) xv = parseFloat(t.getString(i, 2));
    let yv = t.getNum(i, 'y_pos'); if (!isFinite(yv)) yv = parseFloat(t.getString(i, 3));
    let zv = t.getNum(i, 'z_pos'); if (!isFinite(zv)) zv = parseFloat(t.getString(i, 4));
    if (isFinite(xv) && isFinite(yv) && isFinite(zv)) {
      validRows.push(i);
      if (isFinite(orderVal)) arr.push({ idx: i, order: orderVal });
    }
  }
  if (arr.length > 0) {
    arr.sort((a,b) => a.order - b.order);
    sortedOrderMap[key] = arr.map(e => e.idx);
  } else {
    // fallback: ordine naturale delle righe valide
    sortedOrderMap[key] = validRows.slice();
  }
}

function computeGlobalRanges() {
  let xs = [], ys = [], zs = [];
  const tables = [tableAlfa, tableBravo, tableCharlie];
  for (let t of tables) {
    if (!t) continue;
    for (let i = 0; i < t.getRowCount(); i++) {
      let xv = t.getNum(i, 'x_pos'); if (!isFinite(xv)) xv = parseFloat(t.getString(i, 2));
      let yv = t.getNum(i, 'y_pos'); if (!isFinite(yv)) yv = parseFloat(t.getString(i, 3));
      let zv = t.getNum(i, 'z_pos'); if (!isFinite(zv)) zv = parseFloat(t.getString(i, 4));
      if (isFinite(xv) && isFinite(yv) && isFinite(zv)) {
        xs.push(xv); ys.push(yv); zs.push(zv);
      }
    }
  }
  if (xs.length === 0) {
    globalRanges = { xmin: 0, xmax: 1, ymin: 0, ymax: 1, zmin: 0, zmax: 1 };
    return;
  }
  let xmin = Math.min(...xs), xmax = Math.max(...xs);
  let ymin = Math.min(...ys), ymax = Math.max(...ys);
  let zmin = Math.min(...zs), zmax = Math.max(...zs);
  if (xmax === xmin) xmax = xmin + 1e-6;
  if (ymax === ymin) ymax = ymin + 1e-6;
  if (zmax === zmin) zmax = zmin + 1e-6;
  globalRanges = { xmin, xmax, ymin, ymax, zmin, zmax };
}
// fine calcolo ordine e intervalli

// disegna i tre assi sul contesto grafico g (gfx3d)
function drawAxes3D(g, len) {
  g.push();
  g.strokeWeight(1.5);
  // asse X tenue (grigio chiaro)
  g.stroke(200,200,200);
  g.line(0,0,0, -len,0,0);
  // asse Y tenue (leggero blu)
  g.stroke(180,180,200);
  g.line(0,0,0, 0,len,0);
  // asse Z tenue (leggero caldo)
  g.stroke(160,170,180);
  g.line(0,0,0, 0,0,len);
  g.pop();
}

// disegna una sfera sul contesto g
function drawPoint(g, x, y, z, options = {}) {
  const r = options.radius ?? 1.6;
  const col = options.color ?? [255,80,80,200];
  g.push();
  g.translate(x, y, z);
  g.noStroke();
  // usare emissiveMaterial per colori costanti su sfondo scuro
  g.emissiveMaterial(col[0], col[1], col[2]);
  g.sphere(r);
  g.pop();
}

// disegna traiettoria e punti per una tabella sul contesto g
function drawTrajectoryForTableOnG(g, t, orderArr, axisLen = 200, opts = {}) {
  if (!t) return;
  if (!orderArr || orderArr.length === 0) return;

  const xmin = globalRanges.xmin, xmax = globalRanges.xmax;
  const ymin = globalRanges.ymin, ymax = globalRanges.ymax;
  const zmin = globalRanges.zmin, zmax = globalRanges.zmax;

  const limit = Math.min(orderArr.length, opts.maxPoints ?? orderArr.length);
  const pts = [];
  for (let k = 0; k < limit; k++) {
    const i = orderArr[k];
    let xv = t.getNum(i, 'x_pos'); if (!isFinite(xv)) xv = parseFloat(t.getString(i, 2));
    let yv = t.getNum(i, 'y_pos'); if (!isFinite(yv)) yv = parseFloat(t.getString(i, 3));
    let zv = t.getNum(i, 'z_pos'); if (!isFinite(zv)) zv = parseFloat(t.getString(i, 4));
    if (!isFinite(xv) || !isFinite(yv) || !isFinite(zv)) continue;

    let mx = map(xv, xmin, xmax, 0, axisLen);
    let my = map(yv, ymin, ymax, 0, axisLen);
    let mz = map(zv, zmin, zmax, 0, axisLen);

    mx = constrain(mx, 0, axisLen);
    my = constrain(my, 0, axisLen);
    mz = constrain(mz, 0, axisLen);

    // X verso sinistra (negativo), Y verso destra (positivo), Z verso l'alto
    pts.push({ x: -mx, y: my, z: mz });
  }

  if (pts.length > 1) {
    const col = opts.color ?? [255,80,80,200];
    g.stroke(col[0], col[1], col[2], col[3] ?? 255);
    g.strokeWeight(opts.strokeWeight ?? 1.5);
    g.noFill();
    g.beginShape();
    for (let p of pts) g.vertex(p.x, p.y, p.z);
    g.endShape();
    g.noStroke();
  }

  for (let p of pts) {
    drawPoint(g, p.x, p.y, p.z, { radius: opts.radius ?? 1.6, color: opts.color });
  }
}

function draw() {
  // sfondo principale 2D (resto del foglio)
  background(34); // scuro neutro per il resto del foglio

  // aggiorna contatore globale per la progressione dei punti
  visibleCountGlobal = Math.floor(frameCount / framesPerPoint);

  // RENDER 3D nel gfx3d (solo in quella sezione)
  if (gfx3d) {
    gfx3d.push();
    gfx3d.background(bckgcolor);

    // calcola posizione camera dai parametri (impostata ogni frame)
    const phi = camPhi;
    const theta = camTheta;
    const r = camDistance;
    const eyeX = r * Math.cos(phi) * Math.cos(theta);
    const eyeY = r * Math.cos(phi) * Math.sin(theta);
    const eyeZ = r * Math.sin(phi);
    // imposta la camera con up = Z (0,0,1)
    gfx3d.camera(eyeX, eyeY, eyeZ,  0, 0, 0,  0, 0, 1);

    // disattiva luci per rendering piatto
    gfx3d.noLights();

    // la vista 3D è già centrata di default
    gfx3d.translate(0, 0, 0);

    const axisLen = 200;
    drawAxes3D(gfx3d, axisLen);

    // disegna i tre droni nello stesso grafico con colori differenti
    drawTrajectoryForTableOnG(gfx3d, tableAlfa, sortedOrderMap.alfa, axisLen, {
      color: [255, 80, 80, 200],
      radius: 1.8,
      strokeWeight: 1.8,
      maxPoints: Math.min(sortedOrderMap.alfa.length, visibleCountGlobal)
    });
    drawTrajectoryForTableOnG(gfx3d, tableBravo, sortedOrderMap.bravo, axisLen, {
      color: [80, 220, 120, 200],
      radius: 1.8,
      strokeWeight: 1.8,
      maxPoints: Math.min(sortedOrderMap.bravo.length, visibleCountGlobal)
    });
    drawTrajectoryForTableOnG(gfx3d, tableCharlie, sortedOrderMap.charlie, axisLen, {
      color: [100, 150, 255, 200],
      radius: 1.8,
      strokeWeight: 1.8,
      maxPoints: Math.min(sortedOrderMap.charlie.length, visibleCountGlobal)
    });

    gfx3d.pop();

    // disegna il buffer 3D sul canvas principale nella sezione desiderata
    image(gfx3d, gfxX, gfxY);
  }

  // legenda 2D nella sezione a destra 
  const legendX = gfxW + 20;
  const legendY = 40;
  const legendW = width - legendX - 20;
  const items = [
    { name: 'Drone Alfa', color: [255, 80, 80] },
    { name: 'Drone Bravo', color: [80, 220, 120] },
    { name: 'Drone Charlie', color: [100, 150, 255] }
  ];

  // sfondo della legenda
  noStroke();
  fill(20, 160);
  rect(legendX, legendY - 10, legendW, 140, 8);

  // testi e indicatori colore
  textSize(14);
  for (let i = 0; i < items.length; i++) {
    const y = legendY + i * 36;
    fill(items[i].color[0], items[i].color[1], items[i].color[2]);
    ellipse(legendX + 18, y, 14, 14);
    fill(230);
    textAlign(LEFT, CENTER);
    text(items[i].name, legendX + 36, y);
  }
}

// interazione mouse per la camera 3D (solo quando il cursore è dentro l'area gfx3d)
function mouseDragged() {
  if (isMouseInGfx()) {
    const dx = (mouseX - pmouseX);
    const dy = (mouseY - pmouseY);
    camTheta -= dx * CAM_SENS_X;
    camPhi += dy * CAM_SENS_Y;
    const limit = PI/2 - 0.01;
    if (camPhi > limit) camPhi = limit;
    if (camPhi < -limit) camPhi = -limit;
    return false; // evita interferenze con lo scorrimento della pagina
  }
}

function mouseWheel(event) {
  if (isMouseInGfx()) {
    camDistance += event.delta * CAM_ZOOM_SENS;
    camDistance = constrain(camDistance, CAM_MIN_DIST, CAM_MAX_DIST);
    return false; // previene lo scroll della pagina
  }
  // altrimenti comportamento di default
}

function isMouseInGfx() {
  return mouseX >= gfxX && mouseX <= gfxX + gfxW && mouseY >= gfxY && mouseY <= gfxY + gfxH;
}
