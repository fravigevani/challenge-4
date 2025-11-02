//variables for canva
let xMax = 400;
let yMax = 600;
//other global variables
let table;

let bckgcolor = "#C0E1FC"

// Nuove variabili globali per animazione/ordinamento
let sortedOrder = [];      // array di indici ordinati per timestamp (colonna 2)
let visibleCount = 0;      // quanti punti mostrare
let framesPerPoint = 6;    // regolare la velocità (minore = più veloce)

function preload() {
  table = loadTable("drone_alfa_data.csv", "csv", "header");
}


function setup() {
  createCanvas(windowWidth, windowHeight, WEBGL);
  frameRate(30);

  // calcola l'ordine dei punti in base alla colonna "timestamp" (colonna 2)
  computeSortedOrder();
}

function computeSortedOrder() {
  sortedOrder = [];
  if (!table) return;
  const n = table.getRowCount();
  const arr = [];
  for (let i = 0; i < n; i++) {
    // prendi valore di ordinamento: preferisci header 'timestamp', altrimenti colonna 1
    let orderVal = table.getNum(i, 'timestamp');
    if (!isFinite(orderVal)) orderVal = parseFloat(table.getString(i, 1));
    // verifica che esistano coordinate valide
    let xv = table.getNum(i, 'x_pos'); if (!isFinite(xv)) xv = parseFloat(table.getString(i, 2));
    let yv = table.getNum(i, 'y_pos'); if (!isFinite(yv)) yv = parseFloat(table.getString(i, 3));
    let zv = table.getNum(i, 'z_pos'); if (!isFinite(zv)) zv = parseFloat(table.getString(i, 4));
    if (isFinite(xv) && isFinite(yv) && isFinite(zv) && isFinite(orderVal)) {
      arr.push({ idx: i, order: orderVal });
    }
  }
  // ordina crescente per orderVal
  arr.sort((a, b) => a.order - b.order);
  sortedOrder = arr.map(e => e.idx);
}

// disegna i tre assi drawAxes3D
function drawAxes3D(len) {
  push();
  strokeWeight(4);

  // asse X (rosso) da 0 a +len
  stroke(255, 0, 0);
  line(0, 0, 0, len, 0, 0);
  push();
  translate(len, 0, 0);
  fill(255, 0, 0);
  noStroke();
  pop();

  // asse Y (verde) da 0 a +len
  stroke(0, 255, 0);
  line(0, 0, 0, 0, len, 0);
  push();
  translate(0, len, 0);
  fill(0, 255, 0);
  noStroke();
  pop();

  // asse Z (blu) da 0 a +len
  stroke(0, 0, 255);
  line(0, 0, 0, 0, 0, len);
  push();
  translate(0, 0, len);
  fill(0, 0, 255);
  noStroke();
  pop();

  pop();
}

// ---------- nuove funzioni richieste ----------

/**
 * drawPoint(x, y, z, options)
 * Disegna una singola sfera alle coordinate (x,y,z).
 * options: { radius (number), color ([r,g,b]) }
 */
function drawPoint(x, y, z, options = {}) {
  // r molto piccolo in pixel
  const r = options.radius ?? 1.5;
  const col = options.color ?? [0, 150, 255];

  push();
  translate(x, y, z);
  noStroke();
  ambientMaterial(col[0], col[1], col[2]);
  sphere(r);
  pop();
}

/**
 * drawPointsForAxes(axisLen, options, maxPoints)
 * Disegna i punti mappati negli assi ma solo i primi `maxPoints` secondo sortedOrder.
 */
function drawPointsForAxes(axisLen = 200, options = {}, maxPoints = Infinity) {
  if (!table) return;
  const n = table.getRowCount();

  // raccogli valori e calcola min/max per ogni asse (solo righe valide)
  let xs = [], ys = [], zs = [], validIdx = [];
  for (let i = 0; i < n; i++) {
    let xv = table.getNum(i, 'x_pos'); if (!isFinite(xv)) xv = parseFloat(table.getString(i, 2));
    let yv = table.getNum(i, 'y_pos'); if (!isFinite(yv)) yv = parseFloat(table.getString(i, 3));
    let zv = table.getNum(i, 'z_pos'); if (!isFinite(zv)) zv = parseFloat(table.getString(i, 4));
    if (isFinite(xv) && isFinite(yv) && isFinite(zv)) {
      xs.push(xv); ys.push(yv); zs.push(zv);
      validIdx.push(i);
    }
  }

  if (xs.length === 0) return;

  let xmin = Math.min(...xs), xmax = Math.max(...xs);
  let ymin = Math.min(...ys), ymax = Math.max(...ys);
  let zmin = Math.min(...zs), zmax = Math.max(...zs);

  // evita zero-range
  if (xmax === xmin) xmax = xmin + 1e-6;
  if (ymax === ymin) ymax = ymin + 1e-6;
  if (zmax === zmin) zmax = zmin + 1e-6;

  // usa sortedOrder calcolato in setup; se vuoto, fallback a validIdx in ordine naturale
  const orderArr = (sortedOrder && sortedOrder.length > 0) ? sortedOrder : validIdx;
  const limit = Math.min(orderArr.length, maxPoints);

  for (let k = 0; k < limit; k++) {
    const i = orderArr[k];
    let xv = table.getNum(i, 'x_pos'); if (!isFinite(xv)) xv = parseFloat(table.getString(i, 2));
    let yv = table.getNum(i, 'y_pos'); if (!isFinite(yv)) yv = parseFloat(table.getString(i, 3));
    let zv = table.getNum(i, 'z_pos'); if (!isFinite(zv)) zv = parseFloat(table.getString(i, 4));

    // mappa: min -> 0, max -> axisLen
    let mx = map(xv, xmin, xmax, 0, axisLen);
    let my = map(yv, ymin, ymax, 0, axisLen);
    let mz = map(zv, zmin, zmax, 0, axisLen);

    // clamp dentro gli assi
    mx = constrain(mx, 0, axisLen);
    my = constrain(my, 0, axisLen);
    mz = constrain(mz, 0, axisLen);

    drawPoint(mx, my, mz, options);
  }
}
// ---------- fine nuove funzioni ----------

function draw() {
  // semplice background neutro
  background(200);

  // permette di ruotare la vista con il mouse (drag) e zoom (scroll)
  orbitControl();

  // luce semplice per evidenziare oggetti
  directionalLight(255, 255, 255, 0.5, -1, -0.5);
  ambientLight(80);

  // aggiorna quanti punti mostrare in base al tempo (frameCount)
  if (sortedOrder && sortedOrder.length > 0) {
    visibleCount = Math.min(sortedOrder.length, Math.floor(frameCount / framesPerPoint));
  } else {
    visibleCount = 0;
  }

  // disegna assi con Z rivolto verso l'alto dello schermo
  push();
  rotateX(-HALF_PI);
  const axisLen = 200;
  drawAxes3D(axisLen);

  // disegna i punti del dataset progressivamente (maxPoints = visibleCount)
  drawPointsForAxes(axisLen, { radius: 1.5, color: [0, 150, 255] }, visibleCount);

}
