import {
  Color3,
  Material,
  Mesh,
  MeshBuilder,
  PBRMaterial,
  Scene,
  StandardMaterial,
  TransformNode,
  Vector3,
} from '@babylonjs/core';
import {
  createLandSurvTabletScreenMaterial,
  getSurveyMaterialKit,
} from './equipmentMaterials';

export const TRIPOD_DESIGN_APEX_M = 1.28;

/**
 * Aligns a cylinder between two 3D points `from` and `to` under `parent`.
 */
export function createAlignedStrut(
  scene: Scene,
  parent: TransformNode,
  name: string,
  from: Vector3,
  to: Vector3,
  diameterTop: number,
  diameterBottom: number,
  material: Material,
  tessellation = 14,
): Mesh {
  const delta = to.subtract(from);
  const length = Math.max(0.001, delta.length());
  const mesh = MeshBuilder.CreateCylinder(
    name,
    {
      height: length,
      diameterTop,
      diameterBottom,
      tessellation,
    },
    scene,
  );
  mesh.parent = parent;
  mesh.position = Vector3.Center(from, to);
  mesh.rotationQuaternion = null;
  mesh.alignWithNormal(delta.scale(1 / length));
  mesh.material = material;
  mesh.isPickable = false;
  return mesh;
}

export function makeGlowMaterial(
  scene: Scene,
  name: string,
  hex: string,
  alpha = 1,
): StandardMaterial {
  const existing = scene.getMaterialByName(name);
  if (existing && existing instanceof StandardMaterial) return existing;
  const mat = new StandardMaterial(name, scene);
  const col = Color3.FromHexString(hex);
  mat.diffuseColor = col;
  mat.emissiveColor = col;
  mat.specularColor = Color3.Black();
  mat.disableLighting = true;
  mat.alpha = alpha;
  return mat;
}

/**
 * Builds a heavy-duty robotic total station / GNSS base survey tripod in metres
 * (standing head deck height = `TRIPOD_DESIGN_APEX_M` = 1.28 m, foot tips at y = 0).
 *
 * Authentic survey tripod anatomy:
 * - Flat triangular-lobed cast-aluminum head plate with 5/8"-11 brass bell-nut & laser plumb
 * - 3 legs, each with **2 parallel upper fiberglass/hardwood poles** + mid-span cross-bridge
 * - Die-cast lower yoke collar with **quick-release cam lever** + secondary **knurled wing screw**
 * - Center telescoping inner extension pole sliding out between the 2 upper poles
 * - Cast-aluminum **step-in boot spur stirrup** + long **sharp pointed hardened-steel spike**
 */
export function buildHeavyDutySurveyTripod(
  scene: Scene,
  parent: TransformNode,
  prefix: string,
  includeLaserPlumb = true,
): TransformNode {
  const legsGroup = new TransformNode(`${prefix}-tripod-legs`, scene);
  legsGroup.parent = parent;

  const kit = getSurveyMaterialKit(scene);
  const redLaserMat = makeGlowMaterial(scene, `${prefix}-plumb-laser-mat`, '#ef4444', 0.62);

  const apexY = TRIPOD_DESIGN_APEX_M;

  // ── Flat Triangular-Lobed Machined Tripod Head Deck ────────────────────────
  const headDeck = MeshBuilder.CreateCylinder(
    `${prefix}-tripod-head-plate`,
    {
      height: 0.022,
      diameterTop: 0.168,
      diameterBottom: 0.174,
      tessellation: 32,
    },
    scene,
  );
  headDeck.parent = legsGroup;
  headDeck.position.y = apexY - 0.011;
  headDeck.material = kit.safetyYellowCoat;
  headDeck.isPickable = false;

  const machinedPad = MeshBuilder.CreateCylinder(
    `${prefix}-tripod-machined-pad`,
    {
      height: 0.004,
      diameter: 0.154,
      tessellation: 32,
    },
    scene,
  );
  machinedPad.parent = legsGroup;
  machinedPad.position.y = apexY - 0.001;
  machinedPad.material = kit.machinedAluminum;
  machinedPad.isPickable = false;

  const centerBoreRing = MeshBuilder.CreateTorus(
    `${prefix}-tripod-bore-ring`,
    {
      diameter: 0.068,
      thickness: 0.006,
      tessellation: 28,
    },
    scene,
  );
  centerBoreRing.parent = legsGroup;
  centerBoreRing.position.y = apexY;
  centerBoreRing.material = kit.castAnthracite;
  centerBoreRing.isPickable = false;

  // Under-deck 5/8"-11 knurled brass fixing bell-nut & plumb hook cylinder
  const bellNut = MeshBuilder.CreateCylinder(
    `${prefix}-tripod-bell-nut`,
    {
      height: 0.056,
      diameterTop: 0.036,
      diameterBottom: 0.044,
      tessellation: 18,
    },
    scene,
  );
  bellNut.parent = legsGroup;
  bellNut.position.y = apexY - 0.046;
  bellNut.material = kit.knurledBlackAnodized;
  bellNut.isPickable = false;

  const brassThreadStud = MeshBuilder.CreateCylinder(
    `${prefix}-tripod-center-stud`,
    {
      height: 0.042,
      diameter: 0.016,
      tessellation: 14,
    },
    scene,
  );
  brassThreadStud.parent = legsGroup;
  brassThreadStud.position.y = apexY - 0.018;
  brassThreadStud.material = kit.brassHardware;
  brassThreadStud.isPickable = false;

  if (includeLaserPlumb) {
    const plumbBeam = MeshBuilder.CreateCylinder(
      `${prefix}-plumb-beam`,
      {
        height: apexY - 0.06,
        diameter: 0.0045,
        tessellation: 8,
      },
      scene,
    );
    plumbBeam.parent = legsGroup;
    plumbBeam.position.y = (apexY - 0.05) * 0.5;
    plumbBeam.material = redLaserMat;
    plumbBeam.isPickable = false;

    const laserDot = MeshBuilder.CreateCylinder(
      `${prefix}-plumb-dot`,
      {
        height: 0.003,
        diameter: 0.018,
        tessellation: 14,
      },
      scene,
    );
    laserDot.parent = legsGroup;
    laserDot.position.y = 0.011;
    laserDot.material = redLaserMat;
    laserDot.isPickable = false;
  }

  // Brass survey control monument disk on ground at (0, 0, 0)
  const monument = MeshBuilder.CreateCylinder(
    `${prefix}-monument-disk`,
    {
      height: 0.009,
      diameterTop: 0.088,
      diameterBottom: 0.096,
      tessellation: 24,
    },
    scene,
  );
  monument.parent = legsGroup;
  monument.position.y = 0.0045;
  monument.material = kit.brassHardware;
  monument.isPickable = false;

  // ── 3 Articulated Dual-Pole Legs with Quick-Release Clamps & Pointy Feet ──
  const footRadius = 0.68;
  const hingeRadius = 0.088;
  const hingeY = apexY - 0.026;

  for (let i = 0; i < 3; i += 1) {
    const angle = (i / 3) * Math.PI * 2 + 0.48;
    const cosA = Math.cos(angle);
    const sinA = Math.sin(angle);
    // Outward radial & lateral tangent unit vectors in XZ plane
    const uR = new Vector3(cosA, 0, sinA);
    const uT = new Vector3(-sinA, 0, cosA);

    const footTip = uR.scale(footRadius); // (x, 0, z) exact ground contact
    const hingeCenter = uR.scale(hingeRadius).add(new Vector3(0, hingeY, 0));
    const legVec = hingeCenter.subtract(footTip);
    const legLen = legVec.length();
    const legDir = legVec.scale(1 / legLen); // unit vector up along leg
    // Outward normal perpendicular to leg in the vertical radial plane (Babylon left-handed Cross)
    const legOutNormal = Vector3.Cross(legDir, uT).normalize();

    const pointAlongLeg = (s: number, lateralOffset = 0, normalOffset = 0): Vector3 =>
      footTip
        .add(legVec.scale(s))
        .add(uT.scale(lateralOffset))
        .add(legOutNormal.scale(normalOffset));

    // Top clevis hinge lobe under tripod head plate + stainless hinge axle pin
    const hingeLobe = MeshBuilder.CreateBox(
      `${prefix}-leg-hinge-lobe-${i}`,
      {
        width: 0.098,
        height: 0.030,
        depth: 0.046,
      },
      scene,
    );
    hingeLobe.parent = legsGroup;
    hingeLobe.position = uR.scale(hingeRadius - 0.006).add(new Vector3(0, apexY - 0.020, 0));
    hingeLobe.rotation.y = -angle + Math.PI / 2;
    hingeLobe.material = kit.castAnthracite;
    hingeLobe.isPickable = false;

    createAlignedStrut(
      scene,
      legsGroup,
      `${prefix}-leg-hinge-pin-${i}`,
      hingeCenter.add(uT.scale(-0.054)),
      hingeCenter.add(uT.scale(0.054)),
      0.011,
      0.011,
      kit.hardenedSteel,
      14,
    );

    // 1. Sharp Pointed Hardened-Steel Conical Spike Foot (s = 0.000 .. 0.092)
    const spikeTop = pointAlongLeg(0.092);
    createAlignedStrut(
      scene,
      legsGroup,
      `${prefix}-leg-spike-${i}`,
      footTip,
      spikeTop,
      0.027,
      0.0025, // razor-sharp steel point at ground contact
      kit.hardenedSteel,
      16,
    );

    // Machined steel bevel shoulder ring above spike
    createAlignedStrut(
      scene,
      legsGroup,
      `${prefix}-leg-spike-collar-${i}`,
      pointAlongLeg(0.088),
      pointAlongLeg(0.104),
      0.033,
      0.028,
      kit.machinedAluminum,
      16,
    );

    // 2. Cast-Aluminum Foot Stirrup / Step-In Boot Spur (s = 0.100 .. 0.172)
    const shoeSocket = createAlignedStrut(
      scene,
      legsGroup,
      `${prefix}-leg-foot-casting-${i}`,
      pointAlongLeg(0.100),
      pointAlongLeg(0.172),
      0.038,
      0.033,
      kit.castAnthracite,
      16,
    );
    shoeSocket.isPickable = false;

    // Asymmetric step-in boot spur projecting outward so the surveyor can stomp the spike in
    const spurStart = pointAlongLeg(0.145, 0, 0.012);
    const spurEnd = pointAlongLeg(0.156, 0, 0.068);
    createAlignedStrut(
      scene,
      legsGroup,
      `${prefix}-leg-foot-spur-${i}`,
      spurStart,
      spurEnd,
      0.018,
      0.024,
      kit.safetyOrangeCoat,
      12,
    );
    // Ribbed step tread pad on top of boot spur
    createAlignedStrut(
      scene,
      legsGroup,
      `${prefix}-leg-spur-tread-${i}`,
      spurStart.add(new Vector3(0, 0.008, 0)),
      spurEnd.add(new Vector3(0, 0.008, 0)),
      0.014,
      0.016,
      kit.rubberGrip,
      10,
    );

    // 3. Center Telescoping Inner Extension Pole (s = 0.162 .. 0.565)
    createAlignedStrut(
      scene,
      legsGroup,
      `${prefix}-leg-inner-pole-${i}`,
      pointAlongLeg(0.162),
      pointAlongLeg(0.565),
      0.027,
      0.026,
      kit.machinedAluminum,
      16,
    );
    // High-vis yellow center pole cladding sleeve
    createAlignedStrut(
      scene,
      legsGroup,
      `${prefix}-leg-inner-sleeve-${i}`,
      pointAlongLeg(0.185),
      pointAlongLeg(0.410),
      0.0285,
      0.0285,
      kit.safetyYellowCoat,
      16,
    );

    // 4. Die-Cast Lower Yoke & Dual Quick-Release Clamp Assembly (s = 0.415 .. 0.475)
    const clampCenter = pointAlongLeg(0.445);
    // Transverse clamp bridge spanning both upper side poles & center telescoping leg
    createAlignedStrut(
      scene,
      legsGroup,
      `${prefix}-leg-clamp-yoke-${i}`,
      clampCenter.add(uT.scale(-0.052)),
      clampCenter.add(uT.scale(0.052)),
      0.044,
      0.044,
      kit.castAnthracite,
      16,
    );
    // Center clamping collar sleeve with orange powder-coat housing
    createAlignedStrut(
      scene,
      legsGroup,
      `${prefix}-leg-clamp-collar-${i}`,
      pointAlongLeg(0.415),
      pointAlongLeg(0.476),
      0.046,
      0.043,
      kit.safetyOrangeCoat,
      16,
    );

    // Cam-lock Quick-Release Lever Paddle (signature robotic tripod quick clamp!)
    const camPivot = pointAlongLeg(0.452, -0.012, 0.026);
    createAlignedStrut(
      scene,
      legsGroup,
      `${prefix}-leg-qr-cam-pin-${i}`,
      camPivot.add(uT.scale(-0.016)),
      camPivot.add(uT.scale(0.016)),
      0.014,
      0.014,
      kit.hardenedSteel,
      12,
    );
    const leverTip = pointAlongLeg(0.398, 0.024, 0.046);
    createAlignedStrut(
      scene,
      legsGroup,
      `${prefix}-leg-qr-lever-${i}`,
      camPivot,
      leverTip,
      0.011,
      0.016,
      kit.safetyOrangeCoat,
      12,
    );
    // Ergonomic black rubber tip on quick-release lever
    createAlignedStrut(
      scene,
      legsGroup,
      `${prefix}-leg-qr-lever-tip-${i}`,
      Vector3.Lerp(camPivot, leverTip, 0.72),
      leverTip,
      0.017,
      0.014,
      kit.rubberGrip,
      12,
    );

    // Secondary Dual-Lock Knurled Brass/Black Thumbscrew on side of clamp collar
    const screwBase = clampCenter.add(uT.scale(0.050));
    const screwHead = clampCenter.add(uT.scale(0.076));
    createAlignedStrut(
      scene,
      legsGroup,
      `${prefix}-leg-clamp-screw-stem-${i}`,
      screwBase,
      screwHead,
      0.010,
      0.010,
      kit.brassHardware,
      12,
    );
    createAlignedStrut(
      scene,
      legsGroup,
      `${prefix}-leg-clamp-screw-knob-${i}`,
       Vector3.Lerp(screwBase, screwHead, 0.65),
      screwHead.add(uT.scale(0.008)),
      0.028,
      0.026,
      kit.knurledBlackAnodized,
      16,
    );

    // 5. TWO Parallel Upper Leg Poles per Leg! (s = 0.440 .. 0.992)
    for (const side of [-1, 1] as const) {
      const sideTag = side < 0 ? 'L' : 'R';
      const bottomPolePt = pointAlongLeg(0.440, side * 0.036);
      const topPolePt = pointAlongLeg(0.992, side * 0.041);

      createAlignedStrut(
        scene,
        legsGroup,
        `${prefix}-leg-upper-pole-${sideTag}-${i}`,
        bottomPolePt,
        topPolePt,
        0.0235,
        0.0235,
        kit.safetyYellowCoat,
        16,
      );

      // Dark anodized upper dowel ferrule cap at the clevis hinge
      createAlignedStrut(
        scene,
        legsGroup,
        `${prefix}-leg-upper-cap-${sideTag}-${i}`,
        pointAlongLeg(0.952, side * 0.0405),
        topPolePt,
        0.026,
        0.025,
        kit.castAnthracite,
        14,
      );
    }

    // Mid-span stabilizer cross-bridge connecting the 2 upper leg poles
    createAlignedStrut(
      scene,
      legsGroup,
      `${prefix}-leg-cross-brace-${i}`,
      pointAlongLeg(0.72, -0.0385),
      pointAlongLeg(0.72, 0.0385),
      0.015,
      0.015,
      kit.castAnthracite,
      12,
    );
  }

  return legsGroup;
}

/**
 * Builds a precision 3-jaw survey tribrach (height = 0.090 m) with 3 knurled
 * leveling footscrews, locking lever, circular bullseye spirit level, and optical plummet.
 */
export function buildPrecisionTribrach(
  scene: Scene,
  parent: TransformNode,
  prefix: string,
): TransformNode {
  const tribrachRoot = new TransformNode(`${prefix}-tribrach-root`, scene);
  tribrachRoot.parent = parent;

  const kit = getSurveyMaterialKit(scene);

  // Base footplate sitting flush on tripod head deck
  const footPlate = MeshBuilder.CreateCylinder(
    `${prefix}-tribrach-footplate`,
    {
      height: 0.014,
      diameterTop: 0.150,
      diameterBottom: 0.156,
      tessellation: 30,
    },
    scene,
  );
  footPlate.parent = tribrachRoot;
  footPlate.position.y = 0.007;
  footPlate.material = kit.castAnthracite;
  footPlate.isPickable = false;

  // 3 Knurled Leveling Footscrews at 120° intervals
  for (let i = 0; i < 3; i += 1) {
    const angle = (i / 3) * Math.PI * 2 + Math.PI / 6;
    const sx = Math.cos(angle) * 0.058;
    const sz = Math.sin(angle) * 0.058;

    // Footplate lobe pad under each screw
    const lobe = MeshBuilder.CreateCylinder(
      `${prefix}-tribrach-lobe-${i}`,
      { height: 0.014, diameter: 0.040, tessellation: 16 },
      scene,
    );
    lobe.parent = tribrachRoot;
    lobe.position.set(sx, 0.007, sz);
    lobe.material = kit.castAnthracite;
    lobe.isPickable = false;

    // Stainless threaded screw stem
    const stem = MeshBuilder.CreateCylinder(
      `${prefix}-tribrach-screw-stem-${i}`,
      { height: 0.046, diameter: 0.013, tessellation: 14 },
      scene,
    );
    stem.parent = tribrachRoot;
    stem.position.set(sx, 0.030, sz);
    stem.material = kit.hardenedSteel;
    stem.isPickable = false;

    // Large diamond-knurled leveling wheel
    const wheel = MeshBuilder.CreateCylinder(
      `${prefix}-tribrach-screw-wheel-${i}`,
      { height: 0.018, diameter: 0.038, tessellation: 24 },
      scene,
    );
    wheel.parent = tribrachRoot;
    wheel.position.set(sx, 0.028, sz);
    wheel.material = kit.knurledBlackAnodized;
    wheel.isPickable = false;

    // Machined aluminum index collar on wheel
    const wheelRing = MeshBuilder.CreateCylinder(
      `${prefix}-tribrach-screw-ring-${i}`,
      { height: 0.003, diameter: 0.039, tessellation: 24 },
      scene,
    );
    wheelRing.parent = tribrachRoot;
    wheelRing.position.set(sx, 0.028, sz);
    wheelRing.material = kit.machinedAluminum;
    wheelRing.isPickable = false;

    // Upper tribrach ear above each screw
    const upperEar = MeshBuilder.CreateCylinder(
      `${prefix}-tribrach-upper-ear-${i}`,
      { height: 0.034, diameter: 0.038, tessellation: 16 },
      scene,
    );
    upperEar.parent = tribrachRoot;
    upperEar.position.set(sx, 0.066, sz);
    upperEar.material = kit.castMagnesiumDark;
    upperEar.isPickable = false;
  }

  // Upper 3-jaw tribrach body housing
  const upperBody = MeshBuilder.CreateCylinder(
    `${prefix}-tribrach-upper-body`,
    {
      height: 0.038,
      diameterTop: 0.146,
      diameterBottom: 0.150,
      tessellation: 30,
    },
    scene,
  );
  upperBody.parent = tribrachRoot;
  upperBody.position.y = 0.068;
  upperBody.material = kit.castMagnesiumDark;
  upperBody.isPickable = false;

  // Machined stainless 3-pin adapter ring at y = 0.088 m
  const adapterRing = MeshBuilder.CreateCylinder(
    `${prefix}-tribrach-adapter-ring`,
    {
      height: 0.005,
      diameter: 0.138,
      tessellation: 30,
    },
    scene,
  );
  adapterRing.parent = tribrachRoot;
  adapterRing.position.y = 0.088;
  adapterRing.material = kit.machinedAluminum;
  adapterRing.isPickable = false;

  // Side anodized locking cam lever
  const lockLever = MeshBuilder.CreateBox(
    `${prefix}-tribrach-lock-lever`,
    { width: 0.032, height: 0.009, depth: 0.014 },
    scene,
  );
  lockLever.parent = tribrachRoot;
  lockLever.position.set(0.082, 0.068, 0.01);
  lockLever.rotation.y = 0.35;
  lockLever.material = kit.safetyOrangeCoat;
  lockLever.isPickable = false;

  // Circular bullseye spirit level vial with brass bezel
  const vialBezel = MeshBuilder.CreateCylinder(
    `${prefix}-tribrach-vial-bezel`,
    { height: 0.008, diameter: 0.024, tessellation: 18 },
    scene,
  );
  vialBezel.parent = tribrachRoot;
  vialBezel.position.set(0.046, 0.088, -0.044);
  vialBezel.material = kit.brassHardware;
  vialBezel.isPickable = false;

  const vialGlass = MeshBuilder.CreateCylinder(
    `${prefix}-tribrach-vial-glass`,
    { height: 0.009, diameter: 0.019, tessellation: 18 },
    scene,
  );
  vialGlass.parent = tribrachRoot;
  vialGlass.position.set(0.046, 0.089, -0.044);
  vialGlass.material = kit.spiritBubbleVial;
  vialGlass.isPickable = false;

  // Optical plummet twist-focus eyepiece
  const plummet = createAlignedStrut(
    scene,
    tribrachRoot,
    `${prefix}-tribrach-plummet`,
    new Vector3(-0.048, 0.065, -0.048),
    new Vector3(-0.078, 0.056, -0.078),
    0.022,
    0.026,
    kit.knurledBlackAnodized,
    16,
  );
  plummet.isPickable = false;

  return tribrachRoot;
}

/**
 * Builds a properly proportioned modern 10.1" widescreen Windows 11 Field Survey
 * Tablet Data Collector (modelled after Leica CS35 / Trimble T100 / Carlson RT4+,
 * ~26.8 cm × 18.2 cm × 2.1 cm) on an articulated pole claw quick-clamp + RAM ball arm,
 * with thick TPU corner shock bumpers, docked stylus, rear robotic radio pack,
 * and a high-DPI anisotropic screen displaying the "LandSurv.ai" brand name wordmark.
 */
export function buildWindowsSurveyTabletRig(
  scene: Scene,
  parent: TransformNode,
  mode: 'robotic' | 'gnss',
  prefix: string,
): TransformNode {
  const group = new TransformNode(`${prefix}-windows-tablet-rig`, scene);
  group.parent = parent;

  const kit = getSurveyMaterialKit(scene);
  const screenMat = createLandSurvTabletScreenMaterial(scene, mode);
  const powerLedMat = makeGlowMaterial(scene, `${prefix}-tablet-pwr-led`, '#22c55e');
  const cyanAccentMat = makeGlowMaterial(scene, `${prefix}-tablet-cyan-accent`, '#22d3ee');

  // ── 1. CNC Split-Jaw Pole Claw Quick-Clamp (centered at x=0, z=0 on pole) ──
  const clampCollar = MeshBuilder.CreateCylinder(
    `${prefix}-pole-claw-collar`,
    {
      height: 0.046,
      diameter: 0.048,
      tessellation: 20,
    },
    scene,
  );
  clampCollar.parent = group;
  clampCollar.material = kit.castAnthracite;
  clampCollar.isPickable = false;

  // Anodized quick-release clamping hand-knob on -X side of pole clamp
  createAlignedStrut(
    scene,
    group,
    `${prefix}-pole-claw-bolt`,
    new Vector3(-0.020, 0, 0),
    new Vector3(-0.056, 0, 0),
    0.010,
    0.010,
    kit.hardenedSteel,
    12,
  );
  const clawKnob = MeshBuilder.CreateCylinder(
    `${prefix}-pole-claw-knob`,
    {
      height: 0.018,
      diameterTop: 0.036,
      diameterBottom: 0.032,
      tessellation: 18,
    },
    scene,
  );
  clawKnob.parent = group;
  clawKnob.rotation.z = Math.PI / 2;
  clawKnob.position.set(-0.054, 0, 0);
  clawKnob.material = kit.safetyOrangeCoat;
  clawKnob.isPickable = false;

  // ── 2. Articulated Double-Ball RAM/Seco Mount Arm ──────────────────────────
  const poleBall = MeshBuilder.CreateSphere(
    `${prefix}-ram-ball-pole`,
    { diameter: 0.028, segments: 12 },
    scene,
  );
  poleBall.parent = group;
  poleBall.position.set(0.032, 0, -0.012);
  poleBall.material = kit.rubberGrip;
  poleBall.isPickable = false;

  const cradleBallPos = new Vector3(0.148, 0.032, -0.058);
  const cradleBall = MeshBuilder.CreateSphere(
    `${prefix}-ram-ball-cradle`,
    { diameter: 0.028, segments: 12 },
    scene,
  );
  cradleBall.parent = group;
  cradleBall.position.copyFrom(cradleBallPos);
  cradleBall.material = kit.rubberGrip;
  cradleBall.isPickable = false;

  createAlignedStrut(
    scene,
    group,
    `${prefix}-ram-socket-arm`,
    poleBall.position,
    cradleBallPos,
    0.024,
    0.024,
    kit.castAnthracite,
    14,
  );

  // Wing-T tightening knob on center of RAM socket arm
  const armMid = Vector3.Center(poleBall.position, cradleBallPos);
  const armWing = MeshBuilder.CreateBox(
    `${prefix}-ram-arm-wing`,
    { width: 0.012, height: 0.042, depth: 0.016 },
    scene,
  );
  armWing.parent = group;
  armWing.position = armMid.add(new Vector3(0, 0.018, -0.014));
  armWing.material = kit.knurledBlackAnodized;
  armWing.isPickable = false;

  // ── 3. Landscape 10.1" Rugged Windows Survey Tablet + Cradle ───────────────
  const tabletNode = new TransformNode(`${prefix}-tablet-chassis-node`, scene);
  tabletNode.parent = group;
  tabletNode.position.set(0.172, 0.046, -0.078);
  // Angled ergonomically upward (~42°) toward operator & 3D orbit camera
  tabletNode.rotation.y = -0.24;
  tabletNode.rotation.x = 0.74;

  const tabW = 0.268; // 26.8 cm landscape width
  const tabH = 0.182; // 18.2 cm landscape height
  const tabD = 0.020; // 2.0 cm slim rugged thickness

  // Rear spring-loaded 4-claw tablet cradle spine + CTR35/EM120 radio expansion module
  const cradlePlate = MeshBuilder.CreateBox(
    `${prefix}-tablet-cradle-plate`,
    { width: 0.145, height: tabH + 0.014, depth: 0.008 },
    scene,
  );
  cradlePlate.parent = tabletNode;
  cradlePlate.position.set(0, 0, tabD * 0.5 + 0.005);
  cradlePlate.material = kit.castAnthracite;
  cradlePlate.isPickable = false;

  for (const vSign of [-1, 1] as const) {
    const claw = MeshBuilder.CreateBox(
      `${prefix}-tablet-cradle-claw-${vSign}`,
      { width: 0.095, height: 0.012, depth: tabD + 0.014 },
      scene,
    );
    claw.parent = tabletNode;
    claw.position.set(0, vSign * (tabH * 0.5 + 0.004), 0.002);
    claw.material = kit.castAnthracite;
    claw.isPickable = false;
  }

  // Rear Long-Range Robotic Radio / 5G Modem Pack + Stubby Antenna
  const radioPack = MeshBuilder.CreateBox(
    `${prefix}-tablet-radio-pack`,
    { width: 0.092, height: 0.118, depth: 0.016 },
    scene,
  );
  radioPack.parent = tabletNode;
  radioPack.position.set(0.062, 0.014, tabD * 0.5 + 0.009);
  radioPack.material = kit.castMagnesiumDark;
  radioPack.isPickable = false;

  const radioStub = MeshBuilder.CreateCylinder(
    `${prefix}-tablet-radio-stub`,
    { height: 0.072, diameterTop: 0.009, diameterBottom: 0.013, tessellation: 12 },
    scene,
  );
  radioStub.parent = tabletNode;
  radioStub.position.set(0.092, tabH * 0.5 + 0.028, tabD * 0.5 + 0.008);
  radioStub.material = kit.rubberGrip;
  radioStub.isPickable = false;

  // Main Magnesium-Alloy Tablet Body
  const chassis = MeshBuilder.CreateBox(
    `${prefix}-tablet-body`,
    { width: tabW - 0.012, height: tabH - 0.012, depth: tabD },
    scene,
  );
  chassis.parent = tabletNode;
  chassis.material = kit.castMagnesiumDark;
  chassis.isPickable = false;

  // Chamfered Brushed-Aluminum Front Display Frame
  const bezelFrame = MeshBuilder.CreateBox(
    `${prefix}-tablet-bezel-frame`,
    { width: tabW - 0.018, height: tabH - 0.018, depth: 0.003 },
    scene,
  );
  bezelFrame.parent = tabletNode;
  bezelFrame.position.z = -tabD * 0.5 - 0.0005;
  bezelFrame.material = kit.matteGraphite;
  bezelFrame.isPickable = false;

  // 4 Thick Molded TPU Elastomer Corner Shock Bumpers (MIL-STD-810H styling)
  for (const sx of [-1, 1] as const) {
    for (const sy of [-1, 1] as const) {
      const bumper = MeshBuilder.CreateBox(
        `${prefix}-tablet-bumper-${sx}-${sy}`,
        { width: 0.052, height: 0.048, depth: tabD + 0.007 },
        scene,
      );
      bumper.parent = tabletNode;
      bumper.position.set(sx * (tabW * 0.5 - 0.022), sy * (tabH * 0.5 - 0.020), 0);
      bumper.material = kit.rubberGrip;
      bumper.isPickable = false;

      // High-tech cyan corner trim accent
      const accent = MeshBuilder.CreateBox(
        `${prefix}-tablet-corner-accent-${sx}-${sy}`,
        { width: 0.024, height: 0.005, depth: tabD + 0.008 },
        scene,
      );
      accent.parent = tabletNode;
      accent.position.set(sx * (tabW * 0.5 - 0.020), sy * (tabH * 0.5 + 0.003), 0);
      accent.material = kit.leicaTealSlate;
      accent.isPickable = false;
    }
  }

  // Side elastomer grip rails
  for (const sx of [-1, 1] as const) {
    const rail = MeshBuilder.CreateBox(
      `${prefix}-tablet-side-grip-${sx}`,
      { width: 0.010, height: tabH - 0.076, depth: tabD + 0.004 },
      scene,
    );
    rail.parent = tabletNode;
    rail.position.set(sx * (tabW * 0.5 - 0.003), 0, 0);
    rail.material = kit.rubberGrip;
    rail.isPickable = false;
  }

  // Docked Capacitive Survey Stylus along top recess
  const stylus = MeshBuilder.CreateCylinder(
    `${prefix}-tablet-stylus`,
    { height: 0.132, diameter: 0.0075, tessellation: 12 },
    scene,
  );
  stylus.parent = tabletNode;
  stylus.rotation.z = Math.PI / 2;
  stylus.position.set(-0.025, tabH * 0.5 + 0.002, -0.002);
  stylus.material = kit.machinedAluminum;
  stylus.isPickable = false;

  // Illuminated High-DPI "LandSurv.ai" Windows Survey Display Plane (front = -Z)
  const lcdW = 0.214;
  const lcdH = 0.142;
  const lcdPlane = MeshBuilder.CreatePlane(
    `${prefix}-tablet-landsurv-screen`,
    { width: lcdW, height: lcdH },
    scene,
  );
  lcdPlane.parent = tabletNode;
  // Keep a visible depth gap from the bezel behind it; 0.4 mm z-fought at scene scale.
  lcdPlane.position.set(-0.009, 0, -tabD * 0.5 - 0.0040);
  lcdPlane.material = screenMat;
  lcdPlane.isPickable = false;

  // Clear-Coated Gorilla Glass Specular Cover Layer over LCD
  const glassCover = MeshBuilder.CreatePlane(
    `${prefix}-tablet-cover-glass`,
    { width: lcdW + 0.004, height: lcdH + 0.004 },
    scene,
  );
  glassCover.parent = tabletNode;
  glassCover.position.set(-0.009, 0, -tabD * 0.5 - 0.0056);
  glassCover.material = kit.screenCoverGlass;
  glassCover.isPickable = false;

  // Right-Bezel Programmable Hardware Keys (F1, F2, F3, Cyan Measure Key, Green Power LED)
  const keyX = tabW * 0.5 - 0.021;
  for (let k = 0; k < 4; k++) {
    const ky = 0.044 - k * 0.025;
    const hwKey = MeshBuilder.CreateBox(
      `${prefix}-tablet-hw-key-${k}`,
      { width: 0.013, height: 0.016, depth: 0.0035 },
      scene,
    );
    hwKey.parent = tabletNode;
    hwKey.position.set(keyX, ky, -tabD * 0.5 - 0.0025);
    hwKey.material = k === 2 ? cyanAccentMat : kit.knurledBlackAnodized;
    hwKey.isPickable = false;
  }

  const pwrLed = MeshBuilder.CreateSphere(
    `${prefix}-tablet-power-led`,
    { diameter: 0.0045, segments: 8 },
    scene,
  );
  pwrLed.parent = tabletNode;
  pwrLed.position.set(keyX, -0.056, -tabD * 0.5 - 0.0025);
  pwrLed.material = powerLedMat;
  pwrLed.isPickable = false;

  return group;
}

export interface ModernGnssHeadRig {
  headRoot: TransformNode;
  statusRingMat: StandardMaterial;
  totalHeightM: number;
}

/**
 * Builds a sleek, modern IMU tilt-compensating GNSS Smart Antenna Receiver
 * (modelled after Trimble R12i / Leica GS18, ~15.8 cm diameter × 11.8 cm height)
 * with fluted cast-magnesium lower skirt, ribbed TPU shock bumper, front multi-LED
 * status bezel, 360° RTK status light pipe, sculpted matte-white radome cap,
 * quick-disconnect 5/8"-11 base mount, and compact 450 MHz UHF whip antenna.
 */
export function buildModernGnssSmartAntenna(
  scene: Scene,
  parent: TransformNode,
  prefix: string,
): ModernGnssHeadRig {
  const headRoot = new TransformNode(`${prefix}-smart-antenna-head`, scene);
  headRoot.parent = parent;

  const kit = getSurveyMaterialKit(scene);
  const statusRingMat = makeGlowMaterial(scene, `${prefix}-rtk-status-led`, '#a3e635');
  const btLedMat = makeGlowMaterial(scene, `${prefix}-bt-led`, '#38bdf8');
  const satLedMat = makeGlowMaterial(scene, `${prefix}-sat-led`, '#22d3ee');

  // 1. Bottom 5/8"-11 Stainless Quick-Release Mount Collar (ARP at y = 0)
  const qrAdapter = MeshBuilder.CreateCylinder(
    `${prefix}-qr-collar`,
    {
      height: 0.028,
      diameterTop: 0.058,
      diameterBottom: 0.042,
      tessellation: 24,
    },
    scene,
  );
  qrAdapter.parent = headRoot;
  qrAdapter.position.y = -0.012;
  qrAdapter.material = kit.machinedAluminum;
  qrAdapter.isPickable = false;

  const qrButton = MeshBuilder.CreateCylinder(
    `${prefix}-qr-push-button`,
    { height: 0.010, diameter: 0.012, tessellation: 12 },
    scene,
  );
  qrButton.parent = headRoot;
  qrButton.rotation.z = Math.PI / 2;
  qrButton.position.set(0.028, -0.012, 0);
  qrButton.material = kit.safetyOrangeCoat;
  qrButton.isPickable = false;

  // 2. Sculpted Cast-Magnesium Lower Receiver Chassis (y = 0.002 .. 0.058 m)
  const basePlate = MeshBuilder.CreateCylinder(
    `${prefix}-lower-base`,
    {
      height: 0.012,
      diameterTop: 0.124,
      diameterBottom: 0.092,
      tessellation: 32,
    },
    scene,
  );
  basePlate.parent = headRoot;
  basePlate.position.y = 0.008;
  basePlate.material = kit.castAnthracite;
  basePlate.isPickable = false;

  const lowerSkirt = MeshBuilder.CreateCylinder(
    `${prefix}-lower-housing`,
    {
      height: 0.046,
      diameterTop: 0.158,
      diameterBottom: 0.124,
      tessellation: 36,
    },
    scene,
  );
  lowerSkirt.parent = headRoot;
  lowerSkirt.position.y = 0.037;
  lowerSkirt.material = kit.leicaTealSlate;
  lowerSkirt.isPickable = false;

  // Subtle vertical structural ribs around the lower magnesium housing
  const ribCount = 12;
  for (let r = 0; r < ribCount; r++) {
    const a = (r / ribCount) * Math.PI * 2;
    if (Math.abs(Math.sin(a)) < 0.28 && Math.cos(a) < 0) continue; // leave front LED bezel clear
    const rib = createAlignedStrut(
      scene,
      headRoot,
      `${prefix}-housing-rib-${r}`,
      new Vector3(Math.cos(a) * 0.061, 0.016, Math.sin(a) * 0.061),
      new Vector3(Math.cos(a) * 0.077, 0.055, Math.sin(a) * 0.077),
      0.0045,
      0.0045,
      kit.castMagnesiumDark,
      8,
    );
    rib.isPickable = false;
  }

  // 3. Molded TPU Shock-Absorbing Equatorial Bumper Ring (y = 0.062 m)
  const bumper = MeshBuilder.CreateTorus(
    `${prefix}-equator-bumper`,
    {
      diameter: 0.160,
      thickness: 0.015,
      tessellation: 36,
    },
    scene,
  );
  bumper.parent = headRoot;
  bumper.position.y = 0.062;
  bumper.material = kit.rubberGrip;
  bumper.isPickable = false;

  // 4. 360° RTK Fix-Quality Illuminated Light-Pipe Ring (y = 0.072 m)
  const ledRing = MeshBuilder.CreateTorus(
    `${prefix}-rtk-led-ring`,
    {
      diameter: 0.157,
      thickness: 0.0075,
      tessellation: 36,
    },
    scene,
  );
  ledRing.parent = headRoot;
  ledRing.position.y = 0.072;
  ledRing.material = statusRingMat;
  ledRing.isPickable = false;

  // Front Recessed Power & Multi-LED Status Bezel (facing -Z toward operator)
  const frontBezel = MeshBuilder.CreateBox(
    `${prefix}-front-bezel`,
    { width: 0.056, height: 0.026, depth: 0.010 },
    scene,
  );
  frontBezel.parent = headRoot;
  frontBezel.position.set(0, 0.042, -0.072);
  frontBezel.rotation.x = 0.30;
  frontBezel.material = kit.matteGraphite;
  frontBezel.isPickable = false;

  const pwrBtn = MeshBuilder.CreateCylinder(
    `${prefix}-pwr-btn`,
    { height: 0.004, diameter: 0.012, tessellation: 14 },
    scene,
  );
  pwrBtn.parent = frontBezel;
  pwrBtn.rotation.x = Math.PI / 2;
  pwrBtn.position.set(-0.016, 0, -0.005);
  pwrBtn.material = kit.safetyYellowCoat;
  pwrBtn.isPickable = false;

  const ledMaterials: Material[] = [satLedMat, statusRingMat, btLedMat];
  ledMaterials.forEach((mat, idx) => {
    const dot = MeshBuilder.CreateSphere(
      `${prefix}-panel-led-${idx}`,
      { diameter: 0.005, segments: 8 },
      scene,
    );
    dot.parent = frontBezel;
    dot.position.set(0.002 + idx * 0.010, 0, -0.0055);
    dot.material = mat;
    dot.isPickable = false;
  });

  // 5. Modern Sculpted Low-Profile Matte-White Radome Cap (y = 0.074 .. 0.118 m)
  const radomeCollar = MeshBuilder.CreateCylinder(
    `${prefix}-radome-collar`,
    {
      height: 0.020,
      diameterTop: 0.148,
      diameterBottom: 0.156,
      tessellation: 36,
    },
    scene,
  );
  radomeCollar.parent = headRoot;
  radomeCollar.position.y = 0.083;
  radomeCollar.material = kit.radomeMatteWhite;
  radomeCollar.isPickable = false;

  const radomeDome = MeshBuilder.CreateSphere(
    `${prefix}-radome-dome`,
    {
      diameter: 0.148,
      segments: 24,
      slice: 0.5,
    },
    scene,
  );
  radomeDome.parent = headRoot;
  radomeDome.position.y = 0.091;
  radomeDome.scaling.y = 0.36; // Sleek flattened modern R12i / GS18 crown profile
  radomeDome.material = kit.radomeMatteWhite;
  radomeDome.isPickable = false;

  // Top phase-center sight medallion
  const phaseCap = MeshBuilder.CreateCylinder(
    `${prefix}-phase-center-cap`,
    { height: 0.003, diameter: 0.036, tessellation: 20 },
    scene,
  );
  phaseCap.parent = headRoot;
  phaseCap.position.y = 0.118;
  phaseCap.material = kit.leicaTealSlate;
  phaseCap.isPickable = false;

  // 6. Compact Side/Bottom TNC 450 MHz UHF Whip Antenna
  const tncNut = MeshBuilder.CreateCylinder(
    `${prefix}-uhf-tnc-nut`,
    { height: 0.014, diameter: 0.012, tessellation: 12 },
    scene,
  );
  tncNut.parent = headRoot;
  tncNut.position.set(-0.056, 0.006, 0.015);
  tncNut.material = kit.brassHardware;
  tncNut.isPickable = false;

  const whip = MeshBuilder.CreateCylinder(
    `${prefix}-uhf-whip`,
    {
      height: 0.155,
      diameterTop: 0.005,
      diameterBottom: 0.010,
      tessellation: 10,
    },
    scene,
  );
  whip.parent = headRoot;
  whip.position.set(-0.072, 0.078, 0.015);
  whip.rotation.z = 0.16;
  whip.material = kit.rubberGrip;
  whip.isPickable = false;

  return {
    headRoot,
    statusRingMat,
    totalHeightM: 0.120,
  };
}
