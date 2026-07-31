/* ==========================================================================
   STANFLEX — interactive 3D scenes (Three.js, vendored locally)
   --------------------------------------------------------------------------
   Two WebGL scenes share one requestAnimationFrame loop:

     1. HERO   — a slowly orbiting, gently "breathing" flanged axial joint
                 rendered behind the headline (drag to rotate).
     2. LAB    — the interactive bench: configuration switching, convolution
                 count, ply cutaway and a live movement drive.

   Everything is generated procedurally — there are no downloaded 3D assets.
   The bellows is a LatheGeometry built from a parametric corrugation profile
   (the same d / h / p parameters the catalogue's engineering page describes),
   so convolution count and size are true model inputs, not baked meshes.

   Performance notes (WebGL optimisation):
   - devicePixelRatio is clamped to 2 to keep fill-rate sane on 4k/mobile.
   - Each scene renders ONLY while its canvas is on screen (IntersectionObserver)
     and the tab is visible — zero GPU work while scrolled away.
   - Axial travel is animated with a plain scale transform (free on the GPU);
     vertex-level deformation (lateral shear / angular bend) touches the
     position buffer only for the two-bellows configurations, and normals are
     recomputed in place — no per-frame allocations.
   - Geometries/materials are disposed on every rebuild to avoid GPU leaks.
   - Lighting is three analytic lights + a tiny procedurally generated
     environment map (PMREM from a 1k canvas) — no HDR downloads, but the
     stainless steel still gets believable reflections.
   ========================================================================== */

import * as THREE from 'three';
import { OrbitControls } from '../vendor/OrbitControls.js';

/* ----------------------------------------------------------------------- */
/* Brand constants                                                          */
/* ----------------------------------------------------------------------- */
const ORANGE = 0xe25a22;
const ORANGE_BRIGHT = 0xf0793c;

const prefersReducedMotion =
  window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/* ----------------------------------------------------------------------- */
/* Environment map — a tiny synthetic "workshop" painted on a canvas:       */
/* dark floor, warm ceiling softboxes and one orange strip light. PMREM     */
/* turns it into a prefiltered radiance map so brushed metal reads as metal.*/
/* ----------------------------------------------------------------------- */
function makeEnvironment(renderer) {
  const c = document.createElement('canvas');
  c.width = 512; c.height = 256;
  const ctx = c.getContext('2d');

  const g = ctx.createLinearGradient(0, 0, 0, 256);
  g.addColorStop(0, '#3a2c22');
  g.addColorStop(0.5, '#191008');
  g.addColorStop(1, '#0a0605');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 512, 256);

  // ceiling softboxes (white-ish rectangles = broad specular highlights)
  ctx.fillStyle = 'rgba(255,242,225,0.92)';
  ctx.filter = 'blur(6px)';
  ctx.fillRect(40, 26, 130, 26);
  ctx.fillRect(330, 20, 110, 22);
  // brand-orange strip light — the signature warm reflection on every crest
  ctx.fillStyle = 'rgba(226,90,34,0.9)';
  ctx.fillRect(180, 96, 220, 14);
  ctx.filter = 'none';

  const tex = new THREE.CanvasTexture(c);
  tex.mapping = THREE.EquirectangularReflectionMapping;
  tex.colorSpace = THREE.SRGBColorSpace;

  const pmrem = new THREE.PMREMGenerator(renderer);
  const env = pmrem.fromEquirectangular(tex).texture;
  tex.dispose();
  pmrem.dispose();
  return env;
}

/* ----------------------------------------------------------------------- */
/* Materials                                                                */
/* ----------------------------------------------------------------------- */
function makeMaterials(clippingPlanes) {
  return {
    // Type-321 stainless bellows wall
    bellows: new THREE.MeshStandardMaterial({
      color: 0xd7d3cd, metalness: 1.0, roughness: 0.3,
      side: THREE.DoubleSide, clippingPlanes, envMapIntensity: 1.15
    }),
    // second / third ply, revealed by the section cut — tinted so the
    // laminated wall construction is unmistakable
    plyMid: new THREE.MeshStandardMaterial({
      color: ORANGE_BRIGHT, metalness: 0.9, roughness: 0.42,
      side: THREE.DoubleSide, clippingPlanes, envMapIntensity: 0.9
    }),
    plyInner: new THREE.MeshStandardMaterial({
      color: 0x8d8a85, metalness: 1.0, roughness: 0.5,
      side: THREE.DoubleSide, clippingPlanes, envMapIntensity: 0.8
    }),
    flange: new THREE.MeshStandardMaterial({
      color: 0xb4b0aa, metalness: 0.92, roughness: 0.46, envMapIntensity: 1.0
    }),
    pipe: new THREE.MeshStandardMaterial({
      color: 0x9d9994, metalness: 0.9, roughness: 0.5, envMapIntensity: 0.9
    }),
    hardware: new THREE.MeshStandardMaterial({
      color: 0x3f3b38, metalness: 0.85, roughness: 0.55
    }),
    accent: new THREE.MeshStandardMaterial({
      color: ORANGE, metalness: 0.6, roughness: 0.45, envMapIntensity: 0.8
    }),
    bore: new THREE.MeshBasicMaterial({ color: 0x0c0805, side: THREE.BackSide })
  };
}

/* ----------------------------------------------------------------------- */
/* Bellows — a deformable multi-ply corrugated element                      */
/*                                                                          */
/* The profile is sampled as radius(y): a straight cuff at each end (where  */
/* the element is welded to its fitting) and a cosine corrugation between,  */
/* sharpened with pow() to get the U-shaped convolutions of the catalogue's */
/* cross-section drawing.                                                   */
/* ----------------------------------------------------------------------- */
class Bellows {
  constructor({ rootR = 0.74, depth = 0.34, halfLen = 1.0, convolutions = 12,
                radialSegs = 84, plies = 1, materials }) {
    this.opts = { rootR, depth, halfLen, convolutions, radialSegs, plies };
    this.materials = materials;
    this.group = new THREE.Group();
    this.meshes = [];      // [outer ply, inner plies...]
    this.basePositions = []; // pristine vertex data per mesh, for deformation
    this.build();
  }

  profilePoints(rootR) {
    const { depth, halfLen, convolutions } = this.opts;
    const cuff = 0.09;
    const pts = [];
    pts.push(new THREE.Vector2(rootR, -halfLen));
    const L = 2 * (halfLen - cuff);
    const steps = convolutions * 18;           // ~18 samples per convolution
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;                     // 0..1 along corrugated span
      const wave = 0.5 - 0.5 * Math.cos(Math.PI * 2 * convolutions * t);
      const r = rootR + depth * Math.pow(wave, 0.82);
      pts.push(new THREE.Vector2(r, -halfLen + cuff + t * L));
    }
    pts.push(new THREE.Vector2(rootR, halfLen));
    return pts;
  }

  build() {
    // dispose any previous build (geometry lives on the GPU — always free it)
    this.dispose(false);
    const { radialSegs, plies } = this.opts;
    const plyMats = [this.materials.bellows, this.materials.plyMid, this.materials.plyInner];

    for (let p = 0; p < plies; p++) {
      // each inner ply is the same profile stepped slightly inwards —
      // exaggerated vs. reality so the section cut reads clearly on screen
      const geo = new THREE.LatheGeometry(
        this.profilePoints(this.opts.rootR - p * 0.045), radialSegs);
      const mesh = new THREE.Mesh(geo, plyMats[Math.min(p, 2)]);
      mesh.visible = p === 0;                  // inner plies shown in cutaway only
      this.group.add(mesh);
      this.meshes.push(mesh);
      this.basePositions.push(geo.attributes.position.array.slice());
    }
  }

  setConvolutions(n) { this.opts.convolutions = n; this.build(); }
  setPlies(n)        { this.opts.plies = n; this.build(); }
  showInnerPlies(on) { this.meshes.forEach((m, i) => { m.visible = i === 0 || on; }); }

  /* Reset vertices to the pristine lathe shape. */
  resetDeform() {
    this.meshes.forEach((mesh, i) => {
      mesh.geometry.attributes.position.array.set(this.basePositions[i]);
      mesh.geometry.attributes.position.needsUpdate = true;
      mesh.geometry.computeVertexNormals();
    });
  }

  /* Apply fn(x, y, z, t01) → writes into out[3]; t01 = 0 at -halfLen end,
     1 at +halfLen end. Used for lateral shear and angular bend. */
  deform(fn) {
    const { halfLen } = this.opts;
    const out = [0, 0, 0];
    this.meshes.forEach((mesh, i) => {
      const pos = mesh.geometry.attributes.position;
      const base = this.basePositions[i];
      for (let v = 0; v < pos.count; v++) {
        const x = base[v * 3], y = base[v * 3 + 1], z = base[v * 3 + 2];
        const t = (y / halfLen + 1) / 2;
        fn(x, y, z, t, out);
        pos.array[v * 3] = out[0];
        pos.array[v * 3 + 1] = out[1];
        pos.array[v * 3 + 2] = out[2];
      }
      pos.needsUpdate = true;
      mesh.geometry.computeVertexNormals();
    });
  }

  dispose(removeGroup = true) {
    this.meshes.forEach(m => { m.geometry.dispose(); this.group.remove(m); });
    this.meshes = [];
    this.basePositions = [];
    if (removeGroup && this.group.parent) this.group.parent.remove(this.group);
  }
}

/* ----------------------------------------------------------------------- */
/* End fittings                                                             */
/* ----------------------------------------------------------------------- */

/* A visibly hollow pipe stub: open-ended outer wall, a dark inner sleeve
   (BackSide, so it reads as the unlit bore) and a rim ring that shows the
   wall thickness at the open face. Avoids the z-fighting a capped cylinder
   plus bore-disc trick produces at glancing angles. */
function hollowPipe(mats, rOut, len) {
  const g = new THREE.Group();
  const rIn = rOut * 0.9;
  const outer = new THREE.Mesh(
    new THREE.CylinderGeometry(rOut, rOut, len, 56, 1, true), mats.pipe);
  const inner = new THREE.Mesh(
    new THREE.CylinderGeometry(rIn, rIn, len, 56, 1, true), mats.bore);
  const rim = new THREE.Mesh(new THREE.RingGeometry(rIn, rOut, 56), mats.flange);
  rim.rotation.x = -Math.PI / 2;
  rim.position.y = len / 2;
  g.add(outer, inner, rim);
  return g;
}

function buildFlange(mats, rootR) {
  const g = new THREE.Group();
  const plateR = rootR + 0.62, plateT = 0.15;

  const plate = new THREE.Mesh(
    new THREE.CylinderGeometry(plateR, plateR, plateT, 56), mats.flange);
  g.add(plate);

  // raised neck that the bellows cuff welds onto
  const neck = new THREE.Mesh(
    new THREE.CylinderGeometry(rootR + 0.05, rootR + 0.02, 0.2, 56), mats.flange);
  neck.position.y = -0.14;
  g.add(neck);

  // bolting: ten hex heads on the bolt circle (cheap CylinderGeometry with
  // 6 radial segments — reads as a bolt without any CSG holes)
  const boltGeo = new THREE.CylinderGeometry(0.07, 0.07, 0.26, 6);
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2;
    const bolt = new THREE.Mesh(boltGeo, mats.hardware);
    bolt.position.set(Math.cos(a) * (plateR - 0.18), 0, Math.sin(a) * (plateR - 0.18));
    g.add(bolt);
  }

  // short hollow pipe stub on the line side
  const stub = hollowPipe(mats, rootR, 0.42);
  stub.position.y = plateT / 2 + 0.21;
  g.add(stub);

  return g; // local +Y points away from the bellows
}

function buildWeldEnd(mats, rootR) {
  const g = new THREE.Group();
  const pipe = hollowPipe(mats, rootR, 0.9);
  pipe.position.y = 0.45;
  g.add(pipe);
  // weld collar — subtle bulge right at the bellows attachment
  const collar = new THREE.Mesh(
    new THREE.CylinderGeometry(rootR + 0.045, rootR + 0.045, 0.1, 56), mats.flange);
  collar.position.y = 0.05;
  g.add(collar);
  return g;
}

/* ----------------------------------------------------------------------- */
/* JointModel — assembles bellows + fittings into a full expansion joint    */
/* in one of four configurations, and drives its movement.                  */
/*                                                                          */
/* Internal axis is local +Y; the whole group is rotated so the joint lies  */
/* horizontally (local +Y → world +X, local −X → world +Y i.e. "up").       */
/* ----------------------------------------------------------------------- */
const ROOT_R = 0.74;

class JointModel {
  constructor(scene, materials, opts) {
    this.scene = scene;
    this.mats = materials;
    this.opts = Object.assign(
      { config: 'axial', ends: 'flanged', convolutions: 12, plies: 3, cutaway: false },
      opts);
    this.group = new THREE.Group();
    this.group.rotation.z = -Math.PI / 2;      // lay the joint horizontally
    scene.add(this.group);
    this.movement = 0;
    this.build();
  }

  /* ---- assembly ------------------------------------------------------- */
  build() {
    this.clear();
    const o = this.opts;
    this.bellows = [];
    this.endPivots = [];

    const makeEnd = side => {
      // pivot at origin so angular rotation swings the fitting around the
      // hinge axis rather than its own centre
      const pivot = new THREE.Group();
      const end = o.ends === 'flanged'
        ? buildFlange(this.mats, ROOT_R)
        : buildWeldEnd(this.mats, ROOT_R);
      if (side < 0) end.rotation.x = Math.PI;  // mirror for the left-hand end
      pivot.add(end);
      pivot.userData.end = end;
      this.group.add(pivot);
      this.endPivots.push(pivot);
      return pivot;
    };

    if (o.config === 'axial' || o.config === 'angular') {
      // one bellows element centred on the origin
      const b = new Bellows({
        rootR: ROOT_R, halfLen: 1.05,
        convolutions: o.convolutions, plies: o.plies, materials: this.mats
      });
      this.group.add(b.group);
      this.bellows.push(b);
      this.endOffset = 1.05 + 0.08;
      makeEnd(+1); makeEnd(-1);

      if (o.config === 'angular') this.addHinge();
    } else {
      // universal / lateral: two shorter bellows separated by a centre spool
      const half = 0.62, centre = 1.05;
      const conv = Math.max(5, Math.round(o.convolutions * 0.66));
      for (const s of [+1, -1]) {
        const b = new Bellows({
          rootR: ROOT_R, halfLen: half, convolutions: conv,
          plies: o.plies, materials: this.mats
        });
        b.group.position.y = s * centre;
        b.side = s;
        this.group.add(b.group);
        this.bellows.push(b);
      }
      this.spool = new THREE.Mesh(
        new THREE.CylinderGeometry(ROOT_R, ROOT_R, (centre - half) * 2, 56),
        this.mats.pipe);
      this.group.add(this.spool);
      this.endOffset = centre + half + 0.08;
      makeEnd(+1); makeEnd(-1);

      if (o.config === 'lateral') this.addTieRods();
    }

    this.setCutaway(o.cutaway);
    this.setMovement(this.movement);
  }

  addHinge() {
    // hinge plates ride on the local Z sides — exactly the plane the
    // angular bend rotates about, so the kinematics read correctly.
    // Dark steel plates + orange pivot pins, matching the catalogue diagrams.
    const plateGeo = new THREE.BoxGeometry(0.42, 2.55, 0.055);
    for (const s of [+1, -1]) {
      const plate = new THREE.Mesh(plateGeo, this.mats.hardware);
      plate.position.set(0, 0, s * (ROOT_R + 0.42));
      this.group.add(plate);
      this.extras.push(plate);
      const pin = new THREE.Mesh(
        new THREE.CylinderGeometry(0.1, 0.1, 0.16, 20), this.mats.accent);
      pin.rotation.x = Math.PI / 2;
      pin.position.set(0, 0, s * (ROOT_R + 0.47));
      this.group.add(pin);
      this.extras.push(pin);
    }
  }

  addTieRods() {
    // three tie rods on the bolt circle carry the pressure thrust while the
    // joint offsets laterally (rods stay put — the spool moves between them)
    const span = this.endOffset * 2 + 0.5;
    const rodGeo = new THREE.CylinderGeometry(0.05, 0.05, span, 14);
    const nutGeo = new THREE.CylinderGeometry(0.1, 0.1, 0.12, 6);
    const rr = ROOT_R + 0.62 - 0.18;           // matches the flange bolt circle
    for (const a of [Math.PI / 2, Math.PI / 2 + 2.1, Math.PI / 2 + 4.2]) {
      const x = Math.cos(a) * rr, z = Math.sin(a) * rr;
      const rod = new THREE.Mesh(rodGeo, this.mats.hardware);
      rod.position.set(x, 0, z);
      this.group.add(rod);
      this.extras.push(rod);
      for (const s of [+1, -1]) {
        const nut = new THREE.Mesh(nutGeo, this.mats.accent);
        nut.position.set(x, s * (span / 2 - 0.06), z);
        this.group.add(nut);
        this.extras.push(nut);
      }
    }
  }

  /* ---- movement ------------------------------------------------------- */
  /* m ∈ [-1, 1]. What it means depends on the configuration —
     mirroring the catalogue's "primary movement" arrows. */
  setMovement(m) {
    this.movement = m;
    const o = this.opts;

    if (o.config === 'axial') {
      // extension/compression: a pure axial scale — convolutions visibly
      // open and close, and it costs nothing (no vertex writes)
      const k = 1 + 0.16 * m;
      this.bellows[0].group.scale.y = k;
      this.placeEnds(this.endOffset * k - this.endOffset);
    }
    else if (o.config === 'angular') {
      // progressive bend about local Z: each vertex rotates in proportion to
      // its position along the element, producing a smooth arc
      const A = 0.4 * m;                       // ± ~23° full swing
      this.bellows[0].deform((x, y, z, t, out) => {
        const th = A * (t - 0.5);
        const c = Math.cos(th), s = Math.sin(th);
        out[0] = x * c - y * s;
        out[1] = x * s + y * c;
        out[2] = z;
      });
      this.endPivots.forEach((p, i) => {
        const s = i === 0 ? +1 : -1;
        p.rotation.z = s * A / 2;
        p.userData.end.position.y = s * this.endOffset;
      });
    }
    else {
      // universal / lateral: the centre spool translates sideways while each
      // bellows shears into an S — cosine-eased so the slope is zero at both
      // attachments, just like the real deflected shape
      const D = 0.55 * m;                      // lateral offset (local −X = up)
      const ease = t => (1 - Math.cos(Math.PI * t)) / 2;
      for (const b of this.bellows) {
        // t runs 0→1 from the fixed (outer) end to the moving (spool) end
        b.deform((x, y, z, t, out) => {
          const tt = b.side > 0 ? 1 - t : t;
          out[0] = x - D * ease(tt);
          out[1] = y;
          out[2] = z;
        });
      }
      this.spool.position.set(-D, 0, 0);
      this.placeEnds(0);
    }
  }

  placeEnds(extra) {
    this.endPivots.forEach((p, i) => {
      const s = i === 0 ? +1 : -1;
      p.rotation.z = 0;
      p.userData.end.position.y = s * (this.endOffset + extra);
    });
  }

  /* ---- options -------------------------------------------------------- */
  setConfig(c)      { this.opts.config = c; this.build(); }
  setEnds(e)        { this.opts.ends = e; this.build(); }
  setConvolutions(n){ this.opts.convolutions = n;
                      this.bellows.forEach(b => b.setConvolutions(
                        this.opts.config === 'axial' || this.opts.config === 'angular'
                          ? n : Math.max(5, Math.round(n * 0.66))));
                      this.setCutaway(this.opts.cutaway);
                      this.setMovement(this.movement); }
  setPlies(n)       { this.opts.plies = n;
                      this.bellows.forEach(b => b.setPlies(n));
                      this.setCutaway(this.opts.cutaway);
                      this.setMovement(this.movement); }

  setCutaway(on) {
    this.opts.cutaway = on;
    // the section plane lives on the materials (see makeMaterials); here we
    // just toggle whether clipping applies and reveal the inner plies
    [this.mats.bellows, this.mats.plyMid, this.mats.plyInner].forEach(mat => {
      mat.clippingPlanes = on ? this.clipPlanes : null;
      mat.needsUpdate = true;
    });
    this.bellows.forEach(b => b.showInnerPlies(on));
  }

  clear() {
    if (this.bellows) this.bellows.forEach(b => b.dispose());
    if (this.endPivots) this.endPivots.forEach(p => {
      p.traverse(n => { if (n.geometry) n.geometry.dispose(); });
      this.group.remove(p);
    });
    if (this.spool) {
      this.spool.geometry.dispose();
      this.group.remove(this.spool);
      this.spool = null;
    }
    (this.extras || []).forEach(e => { e.geometry.dispose(); this.group.remove(e); });
    this.extras = [];
  }
}

/* ----------------------------------------------------------------------- */
/* Scene wrapper — renderer + camera + lights + visibility management       */
/* ----------------------------------------------------------------------- */
class Stage {
  constructor(canvas, { interactive = true, alpha = true } = {}) {
    this.canvas = canvas;
    this.active = false;

    this.renderer = new THREE.WebGLRenderer({
      canvas, antialias: true, alpha,
      powerPreference: 'high-performance'
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.18;
    this.renderer.localClippingEnabled = true;   // needed for the section cut

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(38, 1, 0.1, 60);

    // studio lighting to match the catalogue's duotone photography:
    // warm key, hard orange rim from behind, cool low fill
    const key = new THREE.DirectionalLight(0xfff0dd, 2.8);
    key.position.set(4, 6, 4);
    const rim = new THREE.DirectionalLight(ORANGE, 3.2);
    rim.position.set(-6, 2.5, -5);
    const fill = new THREE.DirectionalLight(0x8fa3bd, 0.55);
    fill.position.set(0, -4, 5);
    this.scene.add(key, rim, fill, new THREE.AmbientLight(0x2a1c12, 1.4));

    this.scene.environment = makeEnvironment(this.renderer);

    this.controls = new OrbitControls(this.camera, canvas);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.06;
    this.controls.enablePan = false;
    this.controls.enabled = interactive;

    // render only while visible — the single biggest perf win on a long page
    new IntersectionObserver(
      entries => { this.active = entries[0].isIntersecting; },
      { rootMargin: '80px' }
    ).observe(canvas);

    // keep the drawing buffer matched to the CSS size of the canvas
    const resize = () => {
      const w = canvas.clientWidth || canvas.parentElement.clientWidth;
      const h = canvas.clientHeight || canvas.parentElement.clientHeight;
      if (!w || !h) return;
      this.renderer.setSize(w, h, false);
      this.camera.aspect = w / h;
      this.camera.updateProjectionMatrix();
    };
    new ResizeObserver(resize).observe(canvas.parentElement);
    resize();
  }

  render() {
    this.controls.update();
    this.renderer.render(this.scene, this.camera);
  }
}

/* ----------------------------------------------------------------------- */
/* Boot                                                                     */
/* ----------------------------------------------------------------------- */
function boot() {
  const heroCanvas = document.getElementById('hero-canvas');
  const labCanvas = document.getElementById('lab-canvas');
  const stages = [];
  const clock = new THREE.Clock();

  /* ---------------- HERO ---------------- */
  let hero = null;
  if (heroCanvas) {
    try {
      hero = new Stage(heroCanvas, { interactive: true });
      // one-finger vertical swipes must keep scrolling the page on touch;
      // OrbitControls sets touch-action:none, so put pan-y back
      heroCanvas.style.touchAction = 'pan-y';

      hero.controls.enableZoom = false;
      hero.controls.autoRotate = !prefersReducedMotion;
      hero.controls.autoRotateSpeed = 0.9;

      // frame the joint beside the copy on wide screens, further back and
      // centred on narrow ones so it never fights the headline
      const narrow = window.matchMedia('(max-width: 760px)');
      const frameHero = () => {
        if (narrow.matches) {
          hero.camera.position.set(4.6, 2.2, 9.6);
          hero.controls.target.set(0.3, -0.4, 0);
        } else {
          hero.camera.position.set(3.4, 1.5, 6.4);
          hero.controls.target.set(1.15, -0.1, 0);
        }
      };
      frameHero();
      narrow.addEventListener('change', frameHero);

      const mats = makeMaterials(null);
      hero.model = new JointModel(hero.scene, mats, {
        config: 'axial', ends: 'flanged', convolutions: 13, plies: 1
      });
      hero.model.group.position.x = 1.15;

      // drifting ember particles — a nod to the welding shop
      const N = 220, pos = new Float32Array(N * 3);
      for (let i = 0; i < N; i++) {
        pos[i * 3] = (Math.random() - 0.5) * 16;
        pos[i * 3 + 1] = (Math.random() - 0.5) * 9;
        pos[i * 3 + 2] = (Math.random() - 0.5) * 8;
      }
      const pGeo = new THREE.BufferGeometry();
      pGeo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      hero.particles = new THREE.Points(pGeo, new THREE.PointsMaterial({
        color: ORANGE_BRIGHT, size: 0.035, transparent: true, opacity: 0.5,
        blending: THREE.AdditiveBlending, depthWrite: false
      }));
      hero.scene.add(hero.particles);

      stages.push(hero);
    } catch (e) {
      console.warn('Hero 3D unavailable:', e);
      heroCanvas.remove();
    }
  }

  /* ---------------- LAB ---------------- */
  let lab = null;
  let cycle = { on: false, t: 0 };
  const cycleCallbacks = [];
  if (labCanvas) {
    try {
      lab = new Stage(labCanvas, { interactive: true });
      lab.camera.position.set(3.6, 1.9, 6.8);
      lab.controls.target.set(0, 0, 0);
      lab.controls.minDistance = 3.2;
      lab.controls.maxDistance = 15;
      lab.controls.enablePan = true;

      // section-cut plane: everything in front (world +Z) is clipped away
      const clipPlanes = [new THREE.Plane(new THREE.Vector3(0, 0, -1), 0)];
      const mats = makeMaterials(null);
      lab.model = new JointModel(lab.scene, mats, {
        config: 'axial', ends: 'flanged', convolutions: 12, plies: 3
      });
      lab.model.clipPlanes = clipPlanes;

      // soft contact shadow — a radial-gradient disc, far cheaper than
      // real-time shadow mapping and visually just as grounding here
      const sc = document.createElement('canvas');
      sc.width = sc.height = 256;
      const sctx = sc.getContext('2d');
      const grad = sctx.createRadialGradient(128, 128, 10, 128, 128, 128);
      grad.addColorStop(0, 'rgba(0,0,0,0.42)');
      grad.addColorStop(1, 'rgba(0,0,0,0)');
      sctx.fillStyle = grad;
      sctx.fillRect(0, 0, 256, 256);
      const shadow = new THREE.Mesh(
        new THREE.PlaneGeometry(7.5, 4.4),
        new THREE.MeshBasicMaterial({
          map: new THREE.CanvasTexture(sc), transparent: true, depthWrite: false
        }));
      shadow.rotation.x = -Math.PI / 2;
      shadow.position.y = -1.75;
      lab.scene.add(shadow);

      stages.push(lab);
    } catch (e) {
      console.warn('Lab 3D unavailable:', e);
      const fb = document.getElementById('webgl-fallback');
      if (fb) fb.hidden = false;
    }
  }

  /* ---------------- public API for main.js ---------------- */
  const defaultCam = { pos: new THREE.Vector3(3.6, 1.9, 6.8), tgt: new THREE.Vector3(0, 0, 0) };
  window.STANFLEX3D = {
    ok: !!lab,
    setConfig(c)       { if (lab) { lab.model.setConfig(c); } },
    setEnds(e)         { if (lab) lab.model.setEnds(e); },
    setConvolutions(n) { if (lab) lab.model.setConvolutions(n); },
    setPlies(n)        { if (lab) lab.model.setPlies(n); },
    setCutaway(on)     { if (lab) lab.model.setCutaway(on); },
    setMovement(m)     { if (lab) lab.model.setMovement(m); },
    setCycle(on)       { cycle.on = on; if (!on && lab) lab.model.setMovement(0); },
    onCycle(cb)        { cycleCallbacks.push(cb); },
    resetView() {
      if (!lab) return;
      lab.camera.position.copy(defaultCam.pos);
      lab.controls.target.copy(defaultCam.tgt);
    }
  };
  window.dispatchEvent(new CustomEvent('stanflex3d-ready'));

  /* ---------------- shared animation loop ---------------- */
  function tick() {
    requestAnimationFrame(tick);
    if (document.hidden) return;
    const dt = clock.getDelta();
    const t = clock.elapsedTime;

    if (hero && hero.active) {
      if (!prefersReducedMotion) {
        // gentle axial "breathing" sells the flexibility instantly
        hero.model.setMovement(Math.sin(t * 0.7) * 0.45);
        hero.particles.rotation.y = t * 0.012;
      }
      hero.render();
    }

    if (lab && lab.active) {
      if (cycle.on) {
        cycle.t += dt;
        const m = Math.sin(cycle.t * 1.5);
        lab.model.setMovement(m);
        cycleCallbacks.forEach(cb => cb(m));
      }
      lab.render();
    }
  }
  tick();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', boot);
} else {
  boot();
}
