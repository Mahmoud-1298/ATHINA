import React, { useEffect, useRef } from 'react';

// ATHINA neural palette
const HUB_COLOR = [139, 92, 246];
const HUB_HOT = [245, 243, 255];
const PERIPH_COLOR = [129, 140, 248];
const PERIPH_DIM = [34, 211, 238];
const LINE_COLOR = [124, 58, 237];

const TAU = Math.PI * 2;

function generateHubs(count, radius) {
  const hubs = [];
  const phi = Math.PI * (3 - Math.sqrt(5));

  for (let i = 0; i < count; i += 1) {
    const y = 1 - (i / (count - 1)) * 2;
    const ringRadius = Math.sqrt(1 - y * y);
    const theta = phi * i;
    const hubRadius = radius * (0.35 + Math.random() * 0.25);

    hubs.push({
      baseX: Math.cos(theta) * ringRadius * hubRadius,
      baseY: y * hubRadius,
      baseZ: Math.sin(theta) * ringRadius * hubRadius,
      size: 2.2 + Math.random() * 1.8,
      osc1Phase: Math.random() * TAU,
      osc1Speed: 0.0005 + Math.random() * 0.0007,
      osc1Amp: 2 + Math.random() * 3,
      osc2Phase: Math.random() * TAU,
      osc2Speed: 0.0011 + Math.random() * 0.0012,
      osc2Amp: 1.2 + Math.random() * 2,
      osc3Phase: Math.random() * TAU,
      osc3Speed: 0.0023 + Math.random() * 0.002,
      osc3Amp: 0.6 + Math.random() * 1.2,
      driftPhase: Math.random() * TAU,
      driftSpeed: 0.0004 + Math.random() * 0.0005,
      driftAmpX: 2 + Math.random() * 4,
      driftAmpY: 2 + Math.random() * 3.5,
      driftAmpZ: 2 + Math.random() * 4,
      jitterPhase: Math.random() * TAU,
      jitterSpeed: 0.008 + Math.random() * 0.006,
      jitterAmp: 0.4 + Math.random() * 0.6,
      energyPhase: Math.random() * TAU,
      energySpeed: 0.002 + Math.random() * 0.003,
    });
  }

  return hubs;
}

function generatePeripherals(count, radius) {
  const nodes = [];
  const phi = Math.PI * (3 - Math.sqrt(5));

  for (let i = 0; i < count; i += 1) {
    const y = 1 - (i / (count - 1)) * 2;
    const ringRadius = Math.sqrt(1 - y * y);
    const theta = phi * i;

    nodes.push({
      baseX: Math.cos(theta) * ringRadius * radius,
      baseY: y * radius,
      baseZ: Math.sin(theta) * ringRadius * radius,
      size: 0.6 + Math.random() * 0.9,
      osc1Phase: Math.random() * TAU,
      osc1Speed: 0.0006 + Math.random() * 0.0008,
      osc1Amp: 1 + Math.random() * 2.5,
      osc2Phase: Math.random() * TAU,
      osc2Speed: 0.0014 + Math.random() * 0.0014,
      osc2Amp: 0.8 + Math.random() * 1.5,
      osc3Phase: Math.random() * TAU,
      osc3Speed: 0.0028 + Math.random() * 0.0024,
      osc3Amp: 0.4 + Math.random() * 0.8,
      driftPhase: Math.random() * TAU,
      driftSpeed: 0.0003 + Math.random() * 0.0005,
      driftAmpX: 1.5 + Math.random() * 4,
      driftAmpY: 1.5 + Math.random() * 3,
      driftAmpZ: 1.5 + Math.random() * 4,
      jitterPhase: Math.random() * TAU,
      jitterSpeed: 0.009 + Math.random() * 0.007,
      jitterAmp: 0.3 + Math.random() * 0.5,
      twinklePhase: Math.random() * TAU,
      twinkleSpeed: 0.001 + Math.random() * 0.002,
    });
  }

  return nodes;
}

function assignHubConnections(peripherals, hubs) {
  return peripherals.map((peripheral) => {
    let nearest = 0;
    let minimumDistance = Infinity;

    for (let index = 0; index < hubs.length; index += 1) {
      const dx = peripheral.baseX - hubs[index].baseX;
      const dy = peripheral.baseY - hubs[index].baseY;
      const dz = peripheral.baseZ - hubs[index].baseZ;
      const distance = dx * dx + dy * dy + dz * dz;

      if (distance < minimumDistance) {
        minimumDistance = distance;
        nearest = index;
      }
    }

    return nearest;
  });
}

function generateHubLinks(hubs, neighbours) {
  const links = [];
  const seen = new Set();

  for (let i = 0; i < hubs.length; i += 1) {
    const distances = [];

    for (let j = 0; j < hubs.length; j += 1) {
      if (i === j) continue;

      const dx = hubs[i].baseX - hubs[j].baseX;
      const dy = hubs[i].baseY - hubs[j].baseY;
      const dz = hubs[i].baseZ - hubs[j].baseZ;
      distances.push({ index: j, distance: dx * dx + dy * dy + dz * dz });
    }

    distances.sort((left, right) => left.distance - right.distance);

    for (let n = 0; n < Math.min(neighbours, distances.length); n += 1) {
      const j = distances[n].index;
      const key = i < j ? `${i}-${j}` : `${j}-${i}`;
      if (seen.has(key)) continue;
      seen.add(key);

      links.push({
        a: i,
        b: j,
        flowPhase: Math.random() * TAU,
        flowSpeed: 0.006 + Math.random() * 0.008,
      });
    }
  }

  return links;
}

function projectPoint(point, time, radius, rotation, config, densityFactor, radialFactor) {
  const osc1 = Math.sin(time * point.osc1Speed + point.osc1Phase) * point.osc1Amp;
  const osc2 = Math.sin(time * point.osc2Speed + point.osc2Phase) * point.osc2Amp;
  const osc3 = Math.sin(time * point.osc3Speed + point.osc3Phase) * point.osc3Amp;
  const oscillation = osc1 + osc2 + osc3;

  const driftX = Math.sin(time * point.driftSpeed + point.driftPhase) * point.driftAmpX * radialFactor;
  const driftY = Math.cos(time * point.driftSpeed * 1.1 + point.driftPhase) * point.driftAmpY * radialFactor;
  const driftZ = Math.sin(time * point.driftSpeed * 0.9 + point.driftPhase * 1.3) * point.driftAmpZ * radialFactor;

  const jitterX = Math.sin(time * point.jitterSpeed + point.jitterPhase) * point.jitterAmp * config.jitter;
  const jitterY = Math.cos(time * point.jitterSpeed * 1.3 + point.jitterPhase) * point.jitterAmp * config.jitter;
  const jitterZ = Math.sin(time * point.jitterSpeed * 0.7 + point.jitterPhase * 2) * point.jitterAmp * config.jitter;

  const px = point.baseX + (point.baseX / radius) * oscillation + driftX * densityFactor + jitterX;
  const py = point.baseY + (point.baseY / radius) * oscillation + driftY * densityFactor + jitterY;
  const pz = point.baseZ + (point.baseZ / radius) * oscillation + driftZ * densityFactor + jitterZ;

  const x1 = px * rotation.cosY - pz * rotation.sinY;
  const z1 = px * rotation.sinY + pz * rotation.cosY;
  const y1 = py * rotation.cosX - z1 * rotation.sinX;
  const z2 = py * rotation.sinX + z1 * rotation.cosX;
  const focal = radius * 4;
  const perspective = focal / Math.max(focal - z2, 1);

  return { px, py, pz, x1, y1, z2, perspective };
}

export default function AthinaAvatar({ state = 'idle', size = 300 }) {
  const canvasRef = useRef(null);
  const stateRef = useRef(state);
  const animationRef = useRef(null);

  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return undefined;

    const context = canvas.getContext('2d', { alpha: true });
    if (!context) return undefined;

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(size * dpr);
    canvas.height = Math.round(size * dpr);
    context.setTransform(dpr, 0, 0, dpr, 0, 0);

    const centerX = size / 2;
    const centerY = size / 2;
    const radius = size * 0.28;
    const hubs = generateHubs(16, radius);
    const peripherals = generatePeripherals(190, radius);
    const hubAssignments = assignHubConnections(peripherals, hubs);
    const hubLinks = generateHubLinks(hubs, 4);
    const peripheralFlows = peripherals.map(() => ({
      phase: Math.random() * TAU,
      speed: 0.004 + Math.random() * 0.006,
    }));

    const formingLinks = [];
    for (let i = 0; i < hubs.length; i += 1) {
      for (let n = 0; n < 3; n += 1) {
        let j = Math.floor(Math.random() * hubs.length);
        if (j === i) j = (j + 1) % hubs.length;
        formingLinks.push({
          a: i,
          b: j,
          flowPhase: Math.random() * TAU,
          flowSpeed: 0.005 + Math.random() * 0.007,
          formPhase: Math.random() * TAU,
          formSpeed: 0.002 + Math.random() * 0.003,
        });
      }
    }

    const stateConfig = {
      idle: { speed: 0.7, intensity: 0.8, breath: 0.8, densityTarget: 0.45, flowSpeed: 1, jitter: 0.4, periphDrift: 0.7, waveInterval: 4000, waveStrength: 0.5, expansion: 1, forming: 0 },
      wake: { speed: 0.9, intensity: 0.95, breath: 1, densityTarget: 0.6, flowSpeed: 1.4, jitter: 0.6, periphDrift: 0.8, waveInterval: 3000, waveStrength: 0.7, expansion: 1, forming: 0 },
      listening: { speed: 0.6, intensity: 1, breath: 1.1, densityTarget: 0.5, flowSpeed: 1.2, jitter: 0.8, periphDrift: 1.3, waveInterval: 2500, waveStrength: 0.8, expansion: 1.05, forming: 0 },
      thinking: { speed: 1.4, intensity: 1.4, breath: 1.3, densityTarget: 1, flowSpeed: 3, jitter: 1.8, periphDrift: 0.5, waveInterval: 900, waveStrength: 1.3, expansion: 1, forming: 1 },
      speaking: { speed: 1.2, intensity: 1.3, breath: 1.4, densityTarget: 0.8, flowSpeed: 2.4, jitter: 1.2, periphDrift: 0.6, waveInterval: 1200, waveStrength: 1.1, expansion: 1.8, forming: 0.3 },
    };

    let rotationY = 0;
    let densityFactor = 0.5;
    let expansionFactor = 1;
    let formingFactor = 0;
    let wavePosition = -1;
    let waveTimer = 0;

    const animate = (time) => {
      const config = stateConfig[stateRef.current] || stateConfig.idle;
      densityFactor += (config.densityTarget - densityFactor) * 0.03;
      expansionFactor += (config.expansion - expansionFactor) * 0.04;
      formingFactor += (config.forming - formingFactor) * 0.03;

      waveTimer += 16 * config.speed;
      if (waveTimer > config.waveInterval) {
        waveTimer = 0;
        wavePosition = 0;
      }
      if (wavePosition >= 0) {
        wavePosition += 0.012 * config.speed;
        if (wavePosition > 1.2) wavePosition = -1;
      }

      // Clear the whole canvas to fully transparent on every frame.
      context.globalCompositeOperation = 'source-over';
      context.globalAlpha = 1;
      context.clearRect(0, 0, size, size);

      rotationY += 0.0006 * config.speed;
      const rotationX = -0.08 + Math.sin(time * 0.0002) * 0.08;
      const rotation = {
        cosY: Math.cos(rotationY),
        sinY: Math.sin(rotationY),
        cosX: Math.cos(rotationX),
        sinX: Math.sin(rotationX),
      };

      const breathScale = 1 + Math.sin(time * 0.0007) * 0.04 * config.breath;
      const peripheralRadial = 1 + config.periphDrift * 0.15 * Math.sin(time * 0.0004);

      const projectedHubs = hubs.map((hub) => {
        const projected = projectPoint(hub, time, radius, rotation, config, densityFactor, 1);
        const energy = (Math.sin(time * hub.energySpeed + hub.energyPhase) + 1) * 0.5;
        const radialDistance = Math.sqrt(projected.px ** 2 + projected.py ** 2 + projected.pz ** 2) / radius;
        const waveDelta = wavePosition >= 0 ? Math.abs(radialDistance - wavePosition) : Infinity;
        const waveBoost = Math.max(0, 1 - waveDelta * 4) * config.waveStrength;

        return {
          sx: centerX + projected.x1 * expansionFactor * projected.perspective,
          sy: centerY + projected.y1 * expansionFactor * projected.perspective,
          depth: projected.z2,
          energy,
          waveBoost,
        };
      });

      const projectedPeripherals = peripherals.map((peripheral, index) => {
        const projected = projectPoint(peripheral, time, radius, rotation, config, 1, peripheralRadial);
        const twinkle = (Math.sin(time * peripheral.twinkleSpeed + peripheral.twinklePhase) + 1) * 0.5;
        const radialDistance = Math.sqrt(projected.px ** 2 + projected.py ** 2 + projected.pz ** 2) / radius;
        const waveDelta = wavePosition >= 0 ? Math.abs(radialDistance - wavePosition) : Infinity;
        const waveBoost = Math.max(0, 1 - waveDelta * 4) * config.waveStrength;

        return {
          sx: centerX + projected.x1 * expansionFactor * projected.perspective,
          sy: centerY + projected.y1 * expansionFactor * projected.perspective,
          depth: projected.z2,
          twinkle,
          size: peripheral.size,
          hub: hubAssignments[index],
          waveBoost,
        };
      });

      // Only the neural avatar is drawn. There is no canvas-wide aura or frame fill.
      context.globalCompositeOperation = 'lighter';

      projectedPeripherals.forEach((peripheral, index) => {
        const hub = projectedHubs[peripheral.hub];
        if (!hub || Math.random() > densityFactor * 0.9 + 0.1) return;

        const flow = peripheralFlows[index];
        flow.phase += flow.speed * config.flowSpeed;
        const depthFactor = (peripheral.depth + radius) / (radius * 2);
        const alpha = (0.05 + depthFactor * 0.07) * config.intensity;

        context.strokeStyle = `rgba(${LINE_COLOR[0]}, ${LINE_COLOR[1]}, ${LINE_COLOR[2]}, ${alpha})`;
        context.lineWidth = 0.3 + depthFactor * 0.2;
        context.beginPath();
        context.moveTo(hub.sx, hub.sy);
        context.lineTo(peripheral.sx, peripheral.sy);
        context.stroke();

        const flowPosition = (Math.sin(flow.phase) + 1) * 0.5;
        const flowX = hub.sx + (peripheral.sx - hub.sx) * flowPosition;
        const flowY = hub.sy + (peripheral.sy - hub.sy) * flowPosition;
        const glow = Math.sin(flow.phase * 2) * 0.5 + 0.5;
        const wave = Math.max(hub.waveBoost, peripheral.waveBoost);
        const pulseAlpha = (glow * 0.3 + wave * 0.4) * config.intensity * depthFactor;

        context.fillStyle = `rgba(245, 243, 255, ${Math.min(pulseAlpha, 1)})`;
        context.beginPath();
        context.arc(flowX, flowY, 1.4 + wave * 1.5, 0, TAU);
        context.fill();
      });

      hubLinks.forEach((link) => {
        const first = projectedHubs[link.a];
        const second = projectedHubs[link.b];
        if (!first || !second) return;

        link.flowPhase += link.flowSpeed * config.flowSpeed;
        const depthFactor = ((first.depth + second.depth) / 2 + radius) / (radius * 2);
        const averageEnergy = (first.energy + second.energy) * 0.5;
        const alpha = (0.08 + depthFactor * 0.12 + averageEnergy * 0.05) * config.intensity * densityFactor;

        context.strokeStyle = `rgba(${LINE_COLOR[0]}, ${LINE_COLOR[1]}, ${LINE_COLOR[2]}, ${alpha})`;
        context.lineWidth = 0.4 + depthFactor * 0.3;
        context.beginPath();
        context.moveTo(first.sx, first.sy);
        context.lineTo(second.sx, second.sy);
        context.stroke();

        const wave = Math.max(first.waveBoost, second.waveBoost);
        [0, Math.PI].forEach((offset, pulseIndex) => {
          const position = (Math.sin(link.flowPhase + offset) + 1) * 0.5;
          const x = first.sx + (second.sx - first.sx) * position;
          const y = first.sy + (second.sy - first.sy) * position;
          const pulseAlpha = (pulseIndex === 0 ? 0.4 : 0.3) + wave * 0.6;
          context.fillStyle = `rgba(245, 243, 255, ${Math.min(pulseAlpha * config.intensity, 1)})`;
          context.beginPath();
          context.arc(x, y, (pulseIndex === 0 ? 1.6 : 1.3) + wave, 0, TAU);
          context.fill();
        });
      });

      if (formingFactor > 0.01) {
        formingLinks.forEach((link) => {
          const first = projectedHubs[link.a];
          const second = projectedHubs[link.b];
          if (!first || !second) return;

          link.formPhase += link.formSpeed * config.speed;
          const life = (Math.sin(link.formPhase) + 1) * 0.5;
          const alpha = life * formingFactor * 0.5 * config.intensity;
          if (alpha <= 0.01) return;

          const depthFactor = ((first.depth + second.depth) / 2 + radius) / (radius * 2);
          context.strokeStyle = `rgba(245, 243, 255, ${Math.min(alpha * depthFactor, 1)})`;
          context.lineWidth = 0.5 + depthFactor * 0.3;
          context.beginPath();
          context.moveTo(first.sx, first.sy);
          context.lineTo(second.sx, second.sy);
          context.stroke();

          link.flowPhase += link.flowSpeed * config.flowSpeed;
          const position = (Math.sin(link.flowPhase) + 1) * 0.5;
          const x = first.sx + (second.sx - first.sx) * position;
          const y = first.sy + (second.sy - first.sy) * position;
          context.fillStyle = `rgba(255, 255, 255, ${Math.min(alpha * 1.5, 1)})`;
          context.beginPath();
          context.arc(x, y, 1.4, 0, TAU);
          context.fill();
        });
      }

      projectedPeripherals.forEach((peripheral) => {
        const depthFactor = (peripheral.depth + radius) / (radius * 2);
        const brightness = Math.min((0.15 + depthFactor * 0.2 + peripheral.twinkle * 0.1 + peripheral.waveBoost * 0.3) * config.intensity, 1);
        const nodeSize = peripheral.size * (0.6 + depthFactor * 0.4) * breathScale * (1 + peripheral.waveBoost * 0.4);
        const isWaveLit = peripheral.waveBoost > 0.3;
        const color = isWaveLit ? HUB_COLOR : peripheral.twinkle > 0.7 ? PERIPH_DIM : PERIPH_COLOR;

        context.fillStyle = `rgba(${color[0]}, ${color[1]}, ${color[2]}, ${brightness})`;
        context.beginPath();
        context.arc(peripheral.sx, peripheral.sy, nodeSize, 0, TAU);
        context.fill();
      });

      projectedHubs.forEach((hub, index) => {
        const depthFactor = (hub.depth + radius) / (radius * 2);
        const energyBoost = hub.energy * 0.5;
        const brightness = Math.min((0.4 + depthFactor * 0.3 + energyBoost + hub.waveBoost * 0.6) * config.intensity, 1);
        const nodeSize = hubs[index].size * (0.7 + depthFactor * 0.3) * breathScale * (1 + energyBoost * 0.3 + hub.waveBoost * 0.5);

        // This glow belongs only to each node, not to the canvas frame.
        const haloRadius = nodeSize * (1.6 + hub.energy * 0.8 + hub.waveBoost * 1.2);
        const haloAlpha = Math.min((0.04 + hub.energy * 0.06 + hub.waveBoost * 0.12) * config.intensity, 1);
        context.fillStyle = `rgba(${HUB_COLOR[0]}, ${HUB_COLOR[1]}, ${HUB_COLOR[2]}, ${haloAlpha})`;
        context.beginPath();
        context.arc(hub.sx, hub.sy, haloRadius, 0, TAU);
        context.fill();

        const hotMix = Math.min(1, hub.energy * 0.5 + hub.waveBoost * 0.6);
        const red = HUB_COLOR[0] + (HUB_HOT[0] - HUB_COLOR[0]) * hotMix;
        const green = HUB_COLOR[1] + (HUB_HOT[1] - HUB_COLOR[1]) * hotMix;
        const blue = HUB_COLOR[2] + (HUB_HOT[2] - HUB_COLOR[2]) * hotMix;

        context.fillStyle = `rgba(${Math.min(red * brightness, 255)}, ${Math.min(green * brightness, 255)}, ${Math.min(blue * brightness, 255)}, ${Math.min(brightness + 0.1, 1)})`;
        context.beginPath();
        context.arc(hub.sx, hub.sy, nodeSize, 0, TAU);
        context.fill();

        const coreAlpha = Math.min((0.12 + hub.energy * 0.18 + hub.waveBoost * 0.25) * config.intensity, 1);
        context.fillStyle = `rgba(245, 243, 255, ${coreAlpha})`;
        context.beginPath();
        context.arc(hub.sx, hub.sy, nodeSize * 0.35, 0, TAU);
        context.fill();
      });

      context.globalCompositeOperation = 'source-over';
      animationRef.current = requestAnimationFrame(animate);
    };

    animationRef.current = requestAnimationFrame(animate);

    return () => {
      if (animationRef.current) cancelAnimationFrame(animationRef.current);
      context.clearRect(0, 0, size, size);
    };
  }, [size]);

  const labels = {
    idle: 'Ready',
    wake: 'Awake',
    listening: 'Listening',
    thinking: 'Processing',
    speaking: 'Speaking',
  };

  const labelColors = {
    idle: '#8E9AAF',
    wake: '#A78BFA',
    listening: '#22D3EE',
    thinking: '#A78BFA',
    speaking: '#C4B5FD',
  };

  return (
    <div
      className="relative flex flex-col items-center justify-center bg-transparent"
      style={{ width: size, height: size, backgroundColor: 'transparent' }}
    >
      <canvas
        ref={canvasRef}
        className="block bg-transparent"
        style={{
          width: size,
          height: size,
          background: 'transparent',
          backgroundColor: 'transparent',
        }}
      />

      <div className="absolute -bottom-1 left-1/2 -translate-x-1/2 whitespace-nowrap bg-transparent">
        <span
          className="text-xs font-medium tracking-wide"
          style={{
            color: labelColors[state] || labelColors.idle,
            textShadow: state === 'idle' ? 'none' : '0 0 14px rgba(139, 92, 246, 0.51)',
          }}
        >
          {labels[state] || labels.idle}
        </span>
      </div>
    </div>
  );
}
