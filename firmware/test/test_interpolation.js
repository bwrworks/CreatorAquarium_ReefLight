// Standalone algorithmic verification for Schedule Engine Interpolation & Acclimation
// Verifies SRS FR-5, FR-6, FR-11 and edge-case behavior

function parseTimeToSec(timeStr) {
  const [h, m] = timeStr.split(':').map(Number);
  return h * 3600 + m * 60;
}

function interpolate(keyframes, currentSecOfDay) {
  const count = keyframes.length;
  if (count === 0) return { blue: 0, white: 0, red: 0, uv: 0 };
  if (count === 1) return { ...keyframes[0] };

  let idx1 = -1;
  let idx2 = -1;

  for (let i = 0; i < count; i++) {
    if (keyframes[i].timeSec <= currentSecOfDay) {
      idx1 = i;
    }
    if (keyframes[i].timeSec >= currentSecOfDay && idx2 === -1) {
      idx2 = i;
    }
  }

  // Before first keyframe: wrap-around from last keyframe across midnight
  if (idx1 === -1) {
    const k1 = keyframes[count - 1];
    const k2 = keyframes[0];
    const dt = (86400 - k1.timeSec) + k2.timeSec;
    const elapsed = (86400 - k1.timeSec) + currentSecOfDay;
    const factor = dt > 0 ? Math.min(Math.max(elapsed / dt, 0), 1) : 0;
    return {
      blue: k1.blue + (k2.blue - k1.blue) * factor,
      white: k1.white + (k2.white - k1.white) * factor,
      red: k1.red + (k2.red - k1.red) * factor,
      uv: k1.uv + (k2.uv - k1.uv) * factor
    };
  }

  // After last keyframe: wrap-around to first keyframe across midnight
  if (idx2 === -1 || idx1 === count - 1) {
    const k1 = keyframes[count - 1];
    const k2 = keyframes[0];
    const dt = (86400 - k1.timeSec) + k2.timeSec;
    const elapsed = currentSecOfDay - k1.timeSec;
    const factor = dt > 0 ? Math.min(Math.max(elapsed / dt, 0), 1) : 0;
    return {
      blue: k1.blue + (k2.blue - k1.blue) * factor,
      white: k1.white + (k2.white - k1.white) * factor,
      red: k1.red + (k2.red - k1.red) * factor,
      uv: k1.uv + (k2.uv - k1.uv) * factor
    };
  }

  if (idx1 === idx2) {
    return { ...keyframes[idx1] };
  }

  const k1 = keyframes[idx1];
  const k2 = keyframes[idx2];
  const dt = k2.timeSec - k1.timeSec;
  const elapsed = currentSecOfDay - k1.timeSec;
  const factor = dt > 0 ? Math.min(Math.max(elapsed / dt, 0), 1) : 0;

  return {
    blue: k1.blue + (k2.blue - k1.blue) * factor,
    white: k1.white + (k2.white - k1.white) * factor,
    red: k1.red + (k2.red - k1.red) * factor,
    uv: k1.uv + (k2.uv - k1.uv) * factor
  };
}

// Test schedule: 3 keyframes
const rawKeyframes = [
  { time: "08:00", blue: 0, white: 0, red: 0, uv: 0 },
  { time: "12:00", blue: 80, white: 40, red: 20, uv: 60 },
  { time: "20:00", blue: 0, white: 0, red: 0, uv: 0 }
];

const keyframes = rawKeyframes.map(k => ({ ...k, timeSec: parseTimeToSec(k.time) }));

console.log("=== RUNNING REEF CONTROLLER INTERPOLATION TESTS ===");

// Test 1: Exact keyframe at 12:00 (43200 sec)
const atMidday = interpolate(keyframes, 12 * 3600);
console.log(`[TEST 1] Exact keyframe 12:00:`, atMidday);
if (atMidday.blue === 80 && atMidday.white === 40 && atMidday.red === 20 && atMidday.uv === 60) {
  console.log("-> PASS: Exact keyframe matched.");
} else {
  console.error("-> FAIL: Exact keyframe mismatch!");
  process.exit(1);
}

// Test 2: Midpoint between 08:00 (0%) and 12:00 (80%) -> 10:00 (50% elapsed = 40% blue, 20% white, 10% red, 30% uv)
const at10am = interpolate(keyframes, 10 * 3600);
console.log(`[TEST 2] Midpoint 10:00:`, at10am);
if (Math.abs(at10am.blue - 40) < 0.01 && Math.abs(at10am.white - 20) < 0.01) {
  console.log("-> PASS: Linear interpolation midpoint correct.");
} else {
  console.error("-> FAIL: Midpoint interpolation mismatch!");
  process.exit(1);
}

// Test 3: Midnight wrapping (e.g. 02:00 AM) - should interpolate between 20:00 (0%) and 08:00 (0%) -> 0%
const at2am = interpolate(keyframes, 2 * 3600);
console.log(`[TEST 3] Night wrapping 02:00:`, at2am);
if (at2am.blue === 0 && at2am.white === 0) {
  console.log("-> PASS: Midnight wraparound correct.");
} else {
  console.error("-> FAIL: Midnight wraparound mismatch!");
  process.exit(1);
}

// Test 4: Acclimation Ramp calculation
function getAcclimationScale(startPct, daysTotal, elapsedDays) {
  if (elapsedDays >= daysTotal) return 1.0;
  const progress = Math.min(Math.max(elapsedDays / daysTotal, 0), 1);
  const currentPct = startPct + (100.0 - startPct) * progress;
  return currentPct / 100.0;
}

const day0Scale = getAcclimationScale(50, 10, 0);
const day5Scale = getAcclimationScale(50, 10, 5); // 50% + 50% * 0.5 = 75% -> 0.75
const day10Scale = getAcclimationScale(50, 10, 10);

console.log(`[TEST 4] Acclimation: Day 0 = ${day0Scale * 100}%, Day 5 = ${day5Scale * 100}%, Day 10 = ${day10Scale * 100}%`);
if (day0Scale === 0.5 && day5Scale === 0.75 && day10Scale === 1.0) {
  console.log("-> PASS: Acclimation scale math verified.");
} else {
  console.error("-> FAIL: Acclimation math mismatch!");
  process.exit(1);
}

console.log("=== ALL ALGORITHMIC TESTS PASSED ===");
