import React, { useRef, useEffect } from 'react';

// Palette from the selected reference
const HUB_COLOR = [0, 206, 209];       // #00CED1 bright cyan
const HUB_HOT = [255, 253, 208];       // #FFFDD0 near-white core
const PERIPH_COLOR = [173, 216, 230];  // #ADD8E6 faint blue
const PERIPH_DIM = [135, 206, 235];    // #87CEEB
const LINE_COLOR = [100, 149, 237];    // #6495ED pale blue

function generateHubs(count, radius) {
  const hubs = [];
  const phi = Math.PI * (3 - Math.sqrt(5));
  for (let i = 0; i < count; i++) {
    const y = 1 - (i / (count - 1)) * 2;
    const r = Math.sqrt(1 - y * y);
    const theta = phi * i;
    const hubR = radius * (0.35 + Math.random() * 0.25);
    hubs.push({
      baseX: Math.cos(theta) * r * hubR,
      baseY: y * hubR,
      baseZ: Math.sin(theta) * r * hubR,
      size: 2.2 + Math.random() * 1.8,
      // Three overlapping oscillation layers = organic, non-mechanical motion
      osc1Phase: Math.random() * Math.PI * 2,
      osc1Speed: 0.0005 + Math.random() * 0.0007,
      osc1Amp: 2 + Math.random() * 3,
      osc2Phase: Math.random() * Math.PI * 2,
      osc2Speed: 0.0011 + Math.random() * 0.0012,
      osc2Amp: 1.2 + Math.random() * 2,
      osc3Phase: Math.random() * Math.PI * 2,
      osc3Speed: 0.0023 + Math.random() * 0.002,
      osc3Amp: 0.6 + Math.random() * 1.2,
      // Independent wandering drift — each neuron follows its own path
      driftPhase: Math.random() * Math.PI * 2,
      driftSpeed: 0.0004 + Math.random() * 0.0005,
      driftAmpX: 2 + Math.random() * 4,
      driftAmpY: 2 + Math.random() * 3.5,
      driftAmpZ: 2 + Math.random() * 4,
      // High-frequency micro-jitter — simulates active "thinking" neurons
      jitterPhase: Math.random() * Math.PI * 2,
      jitterSpeed: 0.008 + Math.random() * 0.006,
      jitterAmp: 0.4 + Math.random() * 0.6,
      activity: Math.random(),
      // Continuous internal energy cycle
      energyPhase: Math.random() * Math.PI * 2,
      energySpeed: 0.002 + Math.random() * 0.003,
    });
  }
  return hubs;
}

function generatePeripherals(count, radius) {
  const nodes = [];
  const phi = Math.PI * (3 - Math.sqrt(5));
  for (let i = 0; i < count; i++) {
    const y = 1 - (i / (count - 1)) * 2;
    const r = Math.sqrt(1 - y * y);
    const theta = phi * i;
    nodes.push({
      baseX: Math.cos(theta) * r * radius,
      baseY: y * radius,
      baseZ: Math.sin(theta) * r * radius,
      size: 0.6 + Math.random() * 0.9,
      osc1Phase: Math.random() * Math.PI * 2,
      osc1Speed: 0.0006 + Math.random() * 0.0008,
      osc1Amp: 1 + Math.random() * 2.5,
      osc2Phase: Math.random() * Math.PI * 2,
      osc2Speed: 0.0014 + Math.random() * 0.0014,
      osc2Amp: 0.8 + Math.random() * 1.5,
      osc3Phase: Math.random() * Math.PI * 2,
      osc3Speed: 0.0028 + Math.random() * 0.0024,
      osc3Amp: 0.4 + Math.random() * 0.8,
      driftPhase: Math.random() * Math.PI * 2,
      driftSpeed: 0.0003 + Math.random() * 0.0005,
      driftAmpX: 1.5 + Math.random() * 4,
      driftAmpY: 1.5 + Math.random() * 3,
      driftAmpZ: 1.5 + Math.random() * 4,
      jitterPhase: Math.random() * Math.PI * 2,
      jitterSpeed: 0.009 + Math.random() * 0.007,
      jitterAmp: 0.3 + Math.random() * 0.5,
      twinklePhase: Math.random() * Math.PI * 2,
      twinkleSpeed: 0.001 + Math.random() * 0.002,
    });
  }
  return nodes;
}

function assignHubConnections(peripherals, hubs) {
  return peripherals.map((p) => {
    let nearest = 0;
    let minD = Infinity;
    for (let h = 0; h < hubs.length; h++) {
      const dx = p.baseX - hubs[h].baseX;
      const dy = p.baseY - hubs[h].baseY;
      const dz = p.baseZ - hubs[h].baseZ;
      const d = dx * dx + dy * dy + dz * dz;
      if (d < minD) { minD = d; nearest = h; }
    }
    return nearest;
  });
}

// Hub-to-hub connections (dense core mesh) — each with a continuous energy flow phase
function generateHubLinks(hubs, k) {
  const links = [];
  for (let i = 0; i < hubs.length; i++) {
    const dists = [];
    for (let j = 0; j < hubs.length; j++) {
      if (j === i) continue;
      const dx = hubs[i].baseX - hubs[j].baseX;
      const dy = hubs[i].baseY - hubs[j].baseY;
      const dz = hubs[i].baseZ - hubs[j].baseZ;
      dists.push({ j, d: dx * dx + dy * dy + dz * dz });
    }
    dists.sort((a, b) => a.d - b.d);
    for (let n = 0; n < Math.min(k, dists.length); n++) {
      links.push({
        a: i,
        b: dists[n].j,
        // Continuous energy wave traveling along this connection
        flowPhase: Math.random() * Math.PI * 2,
        flowSpeed: 0.006 + Math.random() * 0.008,
      });
    }
  }
  return links;
}

export default function AthinaAvatar({ state = 'idle', size = 300 }) {
  const canvasRef = useRef(null);
  const stateRef = useRef(state);
  const animRef = useRef(null);

  useEffect(() => { stateRef.current = state; }, [state]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d', { alpha: true });
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = size * dpr;
    canvas.height = size * dpr;
    ctx.scale(dpr, dpr);

    const cx = size / 2;
    const cy = size / 2;
    const R = size * 0.28;

    const hubs = generateHubs(16, R);
    const peripherals = generatePeripherals(190, R);
    const hubAssignments = assignHubConnections(peripherals, hubs);
    const hubLinks = generateHubLinks(hubs, 4);
    // Extra long-range links — only render during processing (neurons forming new connections)
    const formingLinks = [];
    for (let i = 0; i < hubs.length; i++) {
      const count = 3;
      for (let n = 0; n < count; n++) {
        let j = Math.floor(Math.random() * hubs.length);
        if (j === i) j = (j + 1) % hubs.length;
        formingLinks.push({
          a: i,
          b: j,
          flowPhase: Math.random() * Math.PI * 2,
          flowSpeed: 0.005 + Math.random() * 0.007,
          formPhase: Math.random() * Math.PI * 2,
          formSpeed: 0.002 + Math.random() * 0.003,
        });
      }
    }

    // Each hub-peripheral connection has its own continuous flow
    const periphFlows = peripherals.map(() => ({
      phase: Math.random() * Math.PI * 2,
      speed: 0.004 + Math.random() * 0.006,
    }));

    let rotY = 0;
    let rotX = -0.08;
    let densityFactor = 0.5;
    let breathFactor = 0;
    let thinkPulse = 0;
    let expansionFactor = 1.0;
    let formingFactor = 0;
    // Traveling thought-wave: a ripple of energy sweeping through the network
    let wavePos = -1;
    let waveTimer = 0;

    // Pre-rendered aura
    const auraCanvas = document.createElement('canvas');
    auraCanvas.width = size;
    auraCanvas.height = size;
    const auraCtx = auraCanvas.getContext('2d');
    const auraR = R * 2.6;
    const auraGrad = auraCtx.createRadialGradient(cx, cy, R * 0.1, cx, cy, auraR);
    auraGrad.addColorStop(0, 'rgba(0, 229, 255, 0.045)');
    auraGrad.addColorStop(0.4, 'rgba(0, 180, 230, 0.018)');
    auraGrad.addColorStop(1, 'rgba(0, 64, 128, 0)');
    auraCtx.fillStyle = auraGrad;
    auraCtx.fillRect(0, 0, size, size);

    const stateConfig = {
      idle:      { speed: 0.7, intensity: 0.8,  breath: 0.8, densityTarget: 0.45, flowSpeed: 1.0, jitter: 0.4, periphDrift: 0.7, waveInterval: 4000, waveStrength: 0.5, expansion: 1.0,  forming: 0.0 },
      wake:      { speed: 0.9, intensity: 0.95, breath: 1.0, densityTarget: 0.60, flowSpeed: 1.4, jitter: 0.6, periphDrift: 0.8, waveInterval: 3000, waveStrength: 0.7, expansion: 1.0,  forming: 0.0 },
      listening: { speed: 0.6, intensity: 1.0,  breath: 1.1, densityTarget: 0.50, flowSpeed: 1.2, jitter: 0.8, periphDrift: 1.3, waveInterval: 2500, waveStrength: 0.8, expansion: 1.05, forming: 0.0 },
      thinking:  { speed: 1.4, intensity: 1.4,  breath: 1.3, densityTarget: 1.0,  flowSpeed: 3.0, jitter: 1.8, periphDrift: 0.5, waveInterval: 900,  waveStrength: 1.3, expansion: 1.0,  forming: 1.0 },
      speaking:  { speed: 1.2, intensity: 1.3,  breath: 1.4, densityTarget: 0.80, flowSpeed: 2.4, jitter: 1.2, periphDrift: 0.6, waveInterval: 1200, waveStrength: 1.1, expansion: 1.8,  forming: 0.3 },
    };

    const animate = (time) => {
      const s = stateRef.current;
      const cfg = stateConfig[s] || stateConfig.idle;

      densityFactor += (cfg.densityTarget - densityFactor) * 0.03;
      breathFactor = cfg.breath;
      thinkPulse += 0.001 * cfg.speed;
      expansionFactor += (cfg.expansion - expansionFactor) * 0.04;
      formingFactor += (cfg.forming - formingFactor) * 0.03;

      // Spawn a new thought-wave at intervals — a surge of energy traveling outward from center
      waveTimer += 16 * cfg.speed;
      if (waveTimer > cfg.waveInterval) {
        waveTimer = 0;
        wavePos = 0;
      }
      if (wavePos >= 0) {
        wavePos += 0.012 * cfg.speed;
        if (wavePos > 1.2) wavePos = -1;
      }

      ctx.globalCompositeOperation = 'source-over';
      ctx.clearRect(0, 0, size, size);

      rotY += 0.0006 * cfg.speed;
      rotX = -0.08 + Math.sin(time * 0.0002) * 0.08;

      const cosY = Math.cos(rotY), sinY = Math.sin(rotY);
      const cosX = Math.cos(rotX), sinX = Math.sin(rotX);

      const breathScale = 1 + Math.sin(time * 0.0007) * 0.04 * breathFactor;
      const periphRadial = 1 + cfg.periphDrift * 0.15 * Math.sin(time * 0.0004);

      // === Project hubs with 3 oscillation layers + drift + micro-jitter ===
      const projHubs = new Array(hubs.length);
      for (let i = 0; i < hubs.length; i++) {
        const h = hubs[i];
        const osc1 = Math.sin(time * h.osc1Speed + h.osc1Phase) * h.osc1Amp;
        const osc2 = Math.sin(time * h.osc2Speed + h.osc2Phase) * h.osc2Amp;
        const osc3 = Math.sin(time * h.osc3Speed + h.osc3Phase) * h.osc3Amp;
        const osc = osc1 + osc2 + osc3;

        const dx = Math.sin(time * h.driftSpeed + h.driftPhase) * h.driftAmpX * densityFactor;
        const dy = Math.cos(time * h.driftSpeed * 1.1 + h.driftPhase) * h.driftAmpY * densityFactor;
        const dz = Math.sin(time * h.driftSpeed * 0.9 + h.driftPhase * 1.3) * h.driftAmpZ * densityFactor;

        // Micro-jitter — high-frequency tremor simulating active neurons
        const jx = Math.sin(time * h.jitterSpeed + h.jitterPhase) * h.jitterAmp * cfg.jitter;
        const jy = Math.cos(time * h.jitterSpeed * 1.3 + h.jitterPhase) * h.jitterAmp * cfg.jitter;
        const jz = Math.sin(time * h.jitterSpeed * 0.7 + h.jitterPhase * 2) * h.jitterAmp * cfg.jitter;

        const px = h.baseX + (h.baseX / R) * osc + dx + jx;
        const py = h.baseY + (h.baseY / R) * osc + dy + jy;
        const pz = h.baseZ + (h.baseZ / R) * osc + dz + jz;

        const x1 = px * cosY - pz * sinY;
        const z1 = px * sinY + pz * cosY;
        const y1 = py * cosX - z1 * sinX;
        const z2 = py * sinX + z1 * cosX;

        const focal = R * 4;
        const persp = focal / Math.max(focal - z2, 1);

        // Expansion: scale radial position outward from center (e.g. when speaking)
        const ex1 = x1 * expansionFactor;
        const ey1 = y1 * expansionFactor;

        // Continuous energy level — always flowing, never "off"
        const energy = (Math.sin(time * h.energySpeed + h.energyPhase) + 1) * 0.5;

        // Thought-wave influence: nodes near the wave's current radius light up
        const radialDist = Math.sqrt(px * px + py * py + pz * pz) / R;
        let waveBoost = 0;
        if (wavePos >= 0) {
          const waveDelta = Math.abs(radialDist - wavePos);
          waveBoost = Math.max(0, 1 - waveDelta * 4) * cfg.waveStrength;
        }

        projHubs[i] = {
          sx: cx + ex1 * persp,
          sy: cy + ey1 * persp,
          depth: z2,
          energy,
          waveBoost,
          activity: h.activity,
        };
      }

      // === Project peripherals ===
      const projPeriph = new Array(peripherals.length);
      for (let i = 0; i < peripherals.length; i++) {
        const p = peripherals[i];
        const osc1 = Math.sin(time * p.osc1Speed + p.osc1Phase) * p.osc1Amp;
        const osc2 = Math.sin(time * p.osc2Speed + p.osc2Phase) * p.osc2Amp;
        const osc3 = Math.sin(time * p.osc3Speed + p.osc3Phase) * p.osc3Amp;
        const osc = osc1 + osc2 + osc3;

        const dx = Math.sin(time * p.driftSpeed + p.driftPhase) * p.driftAmpX * periphRadial;
        const dy = Math.cos(time * p.driftSpeed * 1.1 + p.driftPhase) * p.driftAmpY * periphRadial;
        const dz = Math.sin(time * p.driftSpeed * 0.9 + p.driftPhase * 1.3) * p.driftAmpZ * periphRadial;

        const jx = Math.sin(time * p.jitterSpeed + p.jitterPhase) * p.jitterAmp * cfg.jitter;
        const jy = Math.cos(time * p.jitterSpeed * 1.3 + p.jitterPhase) * p.jitterAmp * cfg.jitter;
        const jz = Math.sin(time * p.jitterSpeed * 0.7 + p.jitterPhase * 2) * p.jitterAmp * cfg.jitter;

        const px = p.baseX + (p.baseX / R) * osc + dx + jx;
        const py = p.baseY + (p.baseY / R) * osc + dy + jy;
        const pz = p.baseZ + (p.baseZ / R) * osc + dz + jz;

        const x1 = px * cosY - pz * sinY;
        const z1 = px * sinY + pz * cosY;
        const y1 = py * cosX - z1 * sinX;
        const z2 = py * sinX + z1 * cosX;

        const focal = R * 4;
        const persp = focal / Math.max(focal - z2, 1);
        const ex1 = x1 * expansionFactor;
        const ey1 = y1 * expansionFactor;
        const twinkle = (Math.sin(time * p.twinkleSpeed + p.twinklePhase) + 1) * 0.5;

        // Thought-wave influence for peripherals
        const radialDistP = Math.sqrt(px * px + py * py + pz * pz) / R;
        let waveBoostP = 0;
        if (wavePos >= 0) {
          const waveDeltaP = Math.abs(radialDistP - wavePos);
          waveBoostP = Math.max(0, 1 - waveDeltaP * 4) * cfg.waveStrength;
        }

        projPeriph[i] = {
          sx: cx + ex1 * persp,
          sy: cy + ey1 * persp,
          depth: z2,
          twinkle,
          size: p.size,
          hub: hubAssignments[i],
          waveBoost: waveBoostP,
        };
      }

      // === Render — additive blending for bloom ===
      ctx.globalCompositeOperation = 'lighter';

      ctx.globalAlpha = cfg.intensity;
      ctx.drawImage(auraCanvas, 0, 0);
      ctx.globalAlpha = 1;

      // === Hub-to-peripheral connections with continuous flowing energy ===
      for (let i = 0; i < projPeriph.length; i++) {
        const pp = projPeriph[i];
        const ph = projHubs[pp.hub];
        if (!ph) continue;
        if (Math.random() > densityFactor * 0.9 + 0.1) continue;

        const flow = periphFlows[i];
        flow.phase += flow.speed * cfg.flowSpeed;

        const depthFactor = (pp.depth + R) / (R * 2);
        const baseAlpha = (0.05 + depthFactor * 0.07) * cfg.intensity;

        // Connection line
        ctx.strokeStyle = `rgba(${LINE_COLOR[0]}, ${LINE_COLOR[1]}, ${LINE_COLOR[2]}, ${baseAlpha})`;
        ctx.lineWidth = 0.3 + depthFactor * 0.2;
        ctx.beginPath();
        ctx.moveTo(ph.sx, ph.sy);
        ctx.lineTo(pp.sx, pp.sy);
        ctx.stroke();

        // Continuous flowing energy pulse traveling along the connection
        const flowPos = (Math.sin(flow.phase) + 1) * 0.5; // 0..1
        const fx = ph.sx + (pp.sx - ph.sx) * flowPos;
        const fy = ph.sy + (pp.sy - ph.sy) * flowPos;
        const flowGlow = Math.sin(flow.phase * 2) * 0.5 + 0.5;
        // Wave-lit connections glow brighter
        const waveOnLink = Math.max(ph.waveBoost || 0, pp.waveBoost || 0);
        ctx.fillStyle = `rgba(255, 253, 208, ${(flowGlow * 0.3 + waveOnLink * 0.4) * cfg.intensity * depthFactor})`;
        ctx.beginPath();
        ctx.arc(fx, fy, 1.4 + waveOnLink * 1.5, 0, Math.PI * 2);
        ctx.fill();
      }

      // === Hub-to-hub core mesh with continuous flowing energy ===
      for (let k = 0; k < hubLinks.length; k++) {
        const link = hubLinks[k];
        const pa = projHubs[link.a];
        const pb = projHubs[link.b];
        if (!pa || !pb) continue;

        link.flowPhase += link.flowSpeed * cfg.flowSpeed;

        const depthFactor = ((pa.depth + pb.depth) / 2 + R) / (R * 2);
        const energyAvg = (pa.energy + pb.energy) * 0.5;
        const baseAlpha = (0.08 + depthFactor * 0.12 + energyAvg * 0.05) * cfg.intensity * densityFactor;

        // Connection line
        ctx.strokeStyle = `rgba(${LINE_COLOR[0]}, ${LINE_COLOR[1]}, ${LINE_COLOR[2]}, ${baseAlpha})`;
        ctx.lineWidth = 0.4 + depthFactor * 0.3;
        ctx.beginPath();
        ctx.moveTo(pa.sx, pa.sy);
        ctx.lineTo(pb.sx, pb.sy);
        ctx.stroke();

        // Two flowing energy pulses traveling in opposite directions along the link
        const flow1 = (Math.sin(link.flowPhase) + 1) * 0.5;
        const flow2 = (Math.sin(link.flowPhase + Math.PI) + 1) * 0.5;
        const f1x = pa.sx + (pb.sx - pa.sx) * flow1;
        const f1y = pa.sy + (pb.sy - pa.sy) * flow1;
        const f2x = pa.sx + (pb.sx - pa.sx) * flow2;
        const f2y = pa.sy + (pb.sy - pa.sy) * flow2;

        // Wave lights up connections it passes through
        const waveOnLink = Math.max(pa.waveBoost || 0, pb.waveBoost || 0);
        const litBoost = waveOnLink * 0.6;
        ctx.fillStyle = `rgba(255, 253, 208, ${(0.4 + litBoost) * cfg.intensity})`;
        ctx.beginPath();
        ctx.arc(f1x, f1y, 1.6 + waveOnLink * 1.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = `rgba(255, 253, 208, ${(0.3 + litBoost) * cfg.intensity})`;
        ctx.beginPath();
        ctx.arc(f2x, f2y, 1.3 + waveOnLink, 0, Math.PI * 2);
        ctx.fill();
      }

      // === Forming connections — neurons wiring together (visible during processing) ===
      if (formingFactor > 0.01) {
        for (let f = 0; f < formingLinks.length; f++) {
          const link = formingLinks[f];
          const pa = projHubs[link.a];
          const pb = projHubs[link.b];
          if (!pa || !pb) continue;

          link.formPhase += link.formSpeed * cfg.speed;
          // Each forming connection fades in and out like a synapse establishing
          const formLife = (Math.sin(link.formPhase) + 1) * 0.5; // 0..1
          const formAlpha = formLife * formingFactor * 0.5 * cfg.intensity;

          if (formAlpha > 0.01) {
            const depthFactor = ((pa.depth + pb.depth) / 2 + R) / (R * 2);
            // Brighter, whiter lines — these are "active" new thoughts forming
            ctx.strokeStyle = `rgba(255, 253, 208, ${formAlpha * depthFactor})`;
            ctx.lineWidth = 0.5 + depthFactor * 0.3;
            ctx.beginPath();
            ctx.moveTo(pa.sx, pa.sy);
            ctx.lineTo(pb.sx, pb.sy);
            ctx.stroke();

            // Energy traveling along the forming connection
            link.flowPhase += link.flowSpeed * cfg.flowSpeed;
            const flowPos = (Math.sin(link.flowPhase) + 1) * 0.5;
            const fx = pa.sx + (pb.sx - pa.sx) * flowPos;
            const fy = pa.sy + (pb.sy - pa.sy) * flowPos;
            ctx.fillStyle = `rgba(255, 255, 255, ${formAlpha * 1.5})`;
            ctx.beginPath();
            ctx.arc(fx, fy, 1.4, 0, Math.PI * 2);
            ctx.fill();
          }
        }
      }

      // === Peripheral nodes ===
      for (let i = 0; i < projPeriph.length; i++) {
        const pp = projPeriph[i];
        const depthFactor = (pp.depth + R) / (R * 2);
        const brightness = (0.15 + depthFactor * 0.2 + pp.twinkle * 0.1 + pp.waveBoost * 0.3) * cfg.intensity;
        const nodeSize = pp.size * (0.6 + depthFactor * 0.4) * breathScale * (1 + pp.waveBoost * 0.4);
        // Wave-lit peripherals brighten toward cyan; others stay faint blue
        const lit = pp.waveBoost > 0.3;
        const [r, g, b] = lit ? HUB_COLOR : (pp.twinkle > 0.7 ? PERIPH_DIM : PERIPH_COLOR);
        ctx.fillStyle = `rgba(${r}, ${g}, ${b}, ${brightness})`;
        ctx.beginPath();
        ctx.arc(pp.sx, pp.sy, nodeSize, 0, Math.PI * 2);
        ctx.fill();
      }

      // === Hub nodes — continuous energy glow (no discrete firing) ===
      for (let i = 0; i < projHubs.length; i++) {
        const ph = projHubs[i];
        const depthFactor = (ph.depth + R) / (R * 2);
        // Energy drives continuous brightness — always alive, pulsing gently
        const energyBoost = ph.energy * 0.5;
        const brightness = (0.4 + depthFactor * 0.3 + energyBoost + ph.waveBoost * 0.6) * cfg.intensity;
        const nodeSize = hubs[i].size * (0.7 + depthFactor * 0.3) * breathScale * (1 + energyBoost * 0.3 + ph.waveBoost * 0.5);

        // Continuous glow halo — intensity follows energy cycle + wave (subtle)
        const haloR = nodeSize * (1.6 + ph.energy * 0.8 + ph.waveBoost * 1.2);
        const haloAlpha = (0.04 + ph.energy * 0.06 + ph.waveBoost * 0.12) * cfg.intensity;
        ctx.fillStyle = `rgba(${HUB_COLOR[0]}, ${HUB_COLOR[1]}, ${HUB_COLOR[2]}, ${haloAlpha})`;
        ctx.beginPath();
        ctx.arc(ph.sx, ph.sy, haloR, 0, Math.PI * 2);
        ctx.fill();

        // Hub body — shifts toward hot white at energy peaks + wave
        const hotMix = Math.min(1, ph.energy * 0.5 + ph.waveBoost * 0.6);
        const hr = HUB_COLOR[0] + (HUB_HOT[0] - HUB_COLOR[0]) * hotMix;
        const hg = HUB_COLOR[1] + (HUB_HOT[1] - HUB_COLOR[1]) * hotMix;
        const hb = HUB_COLOR[2] + (HUB_HOT[2] - HUB_COLOR[2]) * hotMix;
        ctx.fillStyle = `rgba(${Math.min(hr * brightness, 255)}, ${Math.min(hg * brightness, 255)}, ${Math.min(hb * brightness, 255)}, ${Math.min(brightness + 0.1, 1)})`;
        ctx.beginPath();
        ctx.arc(ph.sx, ph.sy, nodeSize, 0, Math.PI * 2);
        ctx.fill();

        // Hot white core — brightness follows energy + wave (reduced)
        ctx.fillStyle = `rgba(255, 253, 208, ${(0.12 + ph.energy * 0.18 + ph.waveBoost * 0.25) * cfg.intensity})`;
        ctx.beginPath();
        ctx.arc(ph.sx, ph.sy, nodeSize * 0.35, 0, Math.PI * 2);
        ctx.fill();
      }

      ctx.globalCompositeOperation = 'source-over';
      animRef.current = requestAnimationFrame(animate);
    };

    animRef.current = requestAnimationFrame(animate);

    return () => {
      if (animRef.current) cancelAnimationFrame(animRef.current);
    };
  }, [size]);

  const labels = {
    idle: 'STANDBY',
    wake: 'ACTIVE',
    listening: 'LISTENING',
    thinking: 'PROCESSING',
    speaking: 'SPEAKING',
  };

  const labelColors = {
    idle: '#4a5568',
    wake: '#00CED1',
    listening: '#00CED1',
    thinking: '#00CED1',
    speaking: '#00CED1',
  };

  return (
    <div className="relative flex flex-col items-center justify-center" style={{ width: size, height: size }}>
      <canvas ref={canvasRef} style={{ width: size, height: size, background: 'transparent' }} className="block" />
      <div className="absolute -bottom-1 left-1/2 -translate-x-1/2 whitespace-nowrap">
        <span
          className="text-[11px] font-mono uppercase tracking-[0.35em]"
          style={{ color: labelColors[state] || labelColors.idle, textShadow: '0 0 12px rgba(0, 206, 209, 0.6)' }}
        >
          {labels[state] || labels.idle}
        </span>
      </div>
    </div>
  );
}