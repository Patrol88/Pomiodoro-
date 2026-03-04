export function createPipRenderer({ canvas, getAccent, getDigitsColor }) {
  const pipCtx = canvas.getContext("2d");

  function roundRect(c, x, y, w, h, r) {
    const rr = Math.min(r, w / 2, h / 2);
    c.beginPath();
    c.moveTo(x + rr, y);
    c.arcTo(x + w, y, x + w, y + h, rr);
    c.arcTo(x + w, y + h, x, y + h, rr);
    c.arcTo(x, y + h, x, y, rr);
    c.arcTo(x, y, x + w, y, rr);
    c.closePath();
  }

  function drawDigits(displayText, phaseText, subText) {
    const w = canvas.width, h = canvas.height;
    pipCtx.clearRect(0, 0, w, h);

    const bg = pipCtx.createLinearGradient(0, 0, w, h);
    bg.addColorStop(0, "rgba(10,14,20,0.98)");
    bg.addColorStop(1, "rgba(18,24,34,0.98)");
    pipCtx.fillStyle = bg;
    pipCtx.fillRect(0, 0, w, h);

    pipCtx.save();
    pipCtx.globalAlpha = 0.18;
    pipCtx.fillStyle = getAccent();
    pipCtx.beginPath();
    pipCtx.ellipse(w * 0.25, h * 0.20, w * 0.35, h * 0.28, 0, 0, Math.PI * 2);
    pipCtx.fill();
    pipCtx.restore();

    pipCtx.save();
    pipCtx.globalAlpha = 0.92;
    pipCtx.fillStyle = "rgba(255,255,255,0.06)";
    pipCtx.strokeStyle = "rgba(255,255,255,0.10)";
    pipCtx.lineWidth = 2;
    roundRect(pipCtx, 44, 44, w - 88, h - 88, 28);
    pipCtx.fill();
    pipCtx.stroke();
    pipCtx.restore();

    pipCtx.save();
    pipCtx.fillStyle = "rgba(255,255,255,0.62)";
    pipCtx.font = "700 26px ui-sans-serif, system-ui";
    pipCtx.textAlign = "center";
    pipCtx.fillText(phaseText, w / 2, 120);
    pipCtx.restore();

    pipCtx.save();
    pipCtx.fillStyle = getDigitsColor();
    pipCtx.font = "800 120px ui-sans-serif, system-ui";
    pipCtx.textAlign = "center";
    pipCtx.textBaseline = "middle";
    pipCtx.fillText(displayText, w / 2, h / 2);
    pipCtx.restore();

    pipCtx.save();
    pipCtx.fillStyle = "rgba(255,255,255,0.62)";
    pipCtx.font = "650 22px ui-sans-serif, system-ui";
    pipCtx.textAlign = "center";
    pipCtx.fillText(subText, w / 2, h - 96);
    pipCtx.restore();
  }

  function drawRingAndDigits(progress, displayText, phaseText, subText) {
    const w = canvas.width, h = canvas.height;
    const cx = w / 2, cy = h / 2;
    const r = Math.min(w, h) * 0.25;

    pipCtx.clearRect(0, 0, w, h);

    const bg = pipCtx.createLinearGradient(0, 0, w, h);
    bg.addColorStop(0, "rgba(10,14,20,0.98)");
    bg.addColorStop(1, "rgba(18,24,34,0.98)");
    pipCtx.fillStyle = bg;
    pipCtx.fillRect(0, 0, w, h);

    const accent = getAccent();

    pipCtx.save();
    pipCtx.lineWidth = 20;
    pipCtx.strokeStyle = "rgba(255,255,255,0.14)";
    pipCtx.lineCap = "round";
    pipCtx.beginPath();
    pipCtx.arc(cx, cy, r, 0, Math.PI * 2);
    pipCtx.stroke();
    pipCtx.restore();

    const start = -Math.PI / 2;
    const end = start + Math.PI * 2 * Math.min(1, Math.max(0, progress));

    pipCtx.save();
    pipCtx.lineWidth = 20;
    pipCtx.strokeStyle = accent;
    pipCtx.shadowColor = accent;
    pipCtx.shadowBlur = 24;
    pipCtx.lineCap = "round";
    pipCtx.beginPath();
    pipCtx.arc(cx, cy, r, start, end, false);
    pipCtx.stroke();
    pipCtx.restore();

    pipCtx.save();
    pipCtx.fillStyle = "rgba(255,255,255,0.65)";
    pipCtx.font = "700 26px ui-sans-serif, system-ui";
    pipCtx.textAlign = "center";
    pipCtx.fillText(phaseText, cx, 86);
    pipCtx.restore();

    pipCtx.save();
    pipCtx.fillStyle = getDigitsColor();
    pipCtx.font = "800 96px ui-sans-serif, system-ui";
    pipCtx.textAlign = "center";
    pipCtx.textBaseline = "middle";
    pipCtx.fillText(displayText, cx, cy);
    pipCtx.restore();

    pipCtx.save();
    pipCtx.fillStyle = "rgba(255,255,255,0.62)";
    pipCtx.font = "650 22px ui-sans-serif, system-ui";
    pipCtx.textAlign = "center";
    pipCtx.fillText(subText, cx, h - 62);
    pipCtx.restore();
  }

  return { drawDigits, drawRingAndDigits };
}

export function getPiPCanvas(view, mainCanvas, pipCanvas) {
  return (view === "digits" || view === "both") ? pipCanvas : mainCanvas;
}
