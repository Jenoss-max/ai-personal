/* =========================================================
   pose_engine.js
   Core Pose Logic (GUI_APP parity)
   ========================================================= */

/* =========================
   CONFIG
========================= */
const CONF = 0.5;
const ANGLE_TOL = 7;      // เผื่อ jitter เหมือน Python
const EMA_ALPHA = 0.3;   // smoothing factor
const MEDIAN_BUF = 7;

/* =========================
   MediaPipe Keypoint Map
========================= */
export const KP = {
  l_shoulder: 11,
  r_shoulder: 12,
  l_elbow: 13,
  r_elbow: 14,
  l_wrist: 15,
  r_wrist: 16,
  l_hip: 23,
  r_hip: 24,
  l_knee: 25,
  r_knee: 26,
  l_ankle: 27,
  r_ankle: 28,
};

/* =========================
   Skeleton (same idea as YOLO)
========================= */
export const SKELETON = [
  [11,13],[13,15],
  [12,14],[14,16],
  [23,25],[25,27],
  [24,26],[26,28],
  [11,23],[12,24]
];

/* =========================
   Utils
========================= */
export function angle(a, b, c) {
  const ab = [a.x - b.x, a.y - b.y];
  const cb = [c.x - b.x, c.y - b.y];
  const dot = ab[0]*cb[0] + ab[1]*cb[1];
  const mag = Math.hypot(...ab) * Math.hypot(...cb) + 1e-6;
  const cos = Math.min(1, Math.max(-1, dot / mag));
  return Math.acos(cos) * 180 / Math.PI;
}

/* =========================
   Smoothing (Median + EMA)
========================= */
class Smoother {
  constructor(size = MEDIAN_BUF, alpha = EMA_ALPHA) {
    this.buf = [];
    this.prev = null;
    this.size = size;
    this.alpha = alpha;
  }

  push(lm) {
    this.buf.push(lm);
    if (this.buf.length > this.size) this.buf.shift();

    // median
    const med = lm.map((_, i) => {
      const xs = this.buf.map(b => b[i].x).sort((a,b)=>a-b);
      const ys = this.buf.map(b => b[i].y).sort((a,b)=>a-b);
      const zs = this.buf.map(b => b[i].z ?? 0).sort((a,b)=>a-b);
      const m = Math.floor(xs.length / 2);
      return { x: xs[m], y: ys[m], z: zs[m] };
    });

    if (!this.prev) {
      this.prev = med;
      return med;
    }

    // EMA
    this.prev = med.map((p,i)=>({
      x: this.prev[i].x + this.alpha * (p.x - this.prev[i].x),
      y: this.prev[i].y + this.alpha * (p.y - this.prev[i].y),
      z: this.prev[i].z + this.alpha * (p.z - this.prev[i].z),
    }));

    return this.prev;
  }
}

/* =========================
   Pose Engine
========================= */
export class PoseEngine {
  constructor(rule) {
    this.rule = rule;          // rule จาก JSON
    this.state = "UP";
    this.rep = 0;
    this.holdStart = null;
    this.holdTime = 0;
    this.smoother = new Smoother();
  }

  reset() {
    this.state = "UP";
    this.rep = 0;
    this.holdStart = null;
    this.holdTime = 0;
    this.smoother = new Smoother();
  }

  process(rawLandmarks) {
    if (!rawLandmarks) {
      return { status: "NO PERSON" };
    }

    const lm = this.smoother.push(rawLandmarks);
    let status = "FAIL";
    let pass = false;

    /* ---------- REP BASED ---------- */
    if (this.rule.type === "rep") {
      const a = this._getAngle(lm);

      if (a <= (this.rule.max ?? 999) + ANGLE_TOL) {
        pass = true;
        status = "PASS";
      }

      if (a <= this.rule.down && this.state === "UP") {
        this.state = "DOWN";
      }

      if (a >= this.rule.up && this.state === "DOWN") {
        this.rep++;
        this.state = "UP";
      }

      return {
        status,
        pass,
        angle: a,
        rep: this.rep,
        state: this.state,
        landmarks: lm
      };
    }

    /* ---------- HOLD BASED ---------- */
    if (this.rule.type === "hold") {
      const a = this._getAngle(lm);

      if (a >= this.rule.min - ANGLE_TOL) {
        pass = true;
        status = "PASS";
        if (!this.holdStart) this.holdStart = performance.now();
        this.holdTime = (performance.now() - this.holdStart) / 1000;
      } else {
        this.holdStart = null;
        this.holdTime = 0;
      }

      return {
        status,
        pass,
        angle: a,
        hold: this.holdTime,
        landmarks: lm
      };
    }

    return { status: "UNKNOWN RULE" };
  }

  _getAngle(lm) {
    const j = this.rule.joint;
    if (j === "knee") {
      return angle(
        lm[KP.l_hip],
        lm[KP.l_knee],
        lm[KP.l_ankle]
      );
    }
    if (j === "elbow") {
      return angle(
        lm[KP.l_shoulder],
        lm[KP.l_elbow],
        lm[KP.l_wrist]
      );
    }
    if (j === "hip") {
      return angle(
        lm[KP.l_knee],
        lm[KP.l_hip],
        lm[KP.l_shoulder]
      );
    }
    return 0;
  }
}

/* =========================
   Draw Skeleton
========================= */
export function drawSkeleton(ctx, lm, color="lime") {
  if (!lm) return;
  ctx.lineWidth = 3;
  ctx.strokeStyle = color;

  SKELETON.forEach(([a,b])=>{
    const p1 = lm[a];
    const p2 = lm[b];
    ctx.beginPath();
    ctx.moveTo(p1.x * ctx.canvas.width, p1.y * ctx.canvas.height);
    ctx.lineTo(p2.x * ctx.canvas.width, p2.y * ctx.canvas.height);
    ctx.stroke();
  });
}
