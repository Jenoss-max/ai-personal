export function drawSkeleton(ctx, kpts) {
  if (!kpts) return;

  const pairs = [
    [11,13],[13,15], // left leg
    [12,14],[14,16], // right leg
    [11,12],         // hip
    [23,24],[23,25],[25,27],
    [24,26],[26,28]
  ];

  ctx.strokeStyle = "#ff7a18";
  ctx.lineWidth = 3;

  pairs.forEach(([a,b]) => {
    if (!kpts[a] || !kpts[b]) return;
    ctx.beginPath();
    ctx.moveTo(kpts[a].x * ctx.canvas.width, kpts[a].y * ctx.canvas.height);
    ctx.lineTo(kpts[b].x * ctx.canvas.width, kpts[b].y * ctx.canvas.height);
    ctx.stroke();
  });
}
