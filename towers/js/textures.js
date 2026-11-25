function noise(ctx, w, h, alpha, paint) {
  const img = ctx.getImageData(0, 0, w, h);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const n = (Math.random() - 0.5) * alpha;
    d[i] = Math.max(0, Math.min(255, d[i] + n + (paint ? paint(i / 4, w) : 0)));
    d[i + 1] = Math.max(0, Math.min(255, d[i + 1] + n));
    d[i + 2] = Math.max(0, Math.min(255, d[i + 2] + n * 0.6));
  }
  ctx.putImageData(img, 0, 0);
}

function corrugate(ctx, w, h, gap, color) {
  ctx.strokeStyle = color;
  ctx.globalAlpha = 0.18;
  ctx.lineWidth = 2;
  for (let x = 0; x < w; x += gap) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x + 1, h);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
}

function scribbles(ctx, color, count, w, h) {
  ctx.save();
  ctx.strokeStyle = color;
  ctx.globalAlpha = 0.28;
  ctx.lineWidth = 3;
  ctx.lineCap = "round";
  for (let i = 0; i < count; i++) {
    const x = Math.random() * w;
    const y = Math.random() * h;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.bezierCurveTo(x + 28, y - 12, x - 8, y + 22, x + 36, y + 6);
    ctx.stroke();
  }
  ctx.restore();
}

function canvas(w, h, draw) {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  draw(c.getContext("2d"), w, h);
  return c;
}

function texOf(THREE, c, repeatX = 1, repeatY = 1) {
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(repeatX, repeatY);
  t.anisotropy = 8;
  return t;
}

export function createTextures(THREE) {
  const card = canvas(512, 512, (ctx, w, h) => {
    ctx.fillStyle = "#e4b56a";
    ctx.fillRect(0, 0, w, h);
    corrugate(ctx, w, h, 7, "#c48a45");
    noise(ctx, w, h, 18);
    scribbles(ctx, "#a85a32", 18, w, h);
    ctx.fillStyle = "rgba(244, 226, 160, 0.78)";
    ctx.fillRect(0, 210, w, 46);
    ctx.strokeStyle = "rgba(90, 62, 32, 0.35)";
    ctx.strokeRect(8, 214, w - 16, 38);
    ctx.strokeStyle = "rgba(255,255,255,0.25)";
    ctx.strokeRect(0.5, 0.5, w - 1, h - 1);
  });

  const grass = canvas(512, 512, (ctx, w, h) => {
    ctx.fillStyle = "#74b84e";
    ctx.fillRect(0, 0, w, h);
    noise(ctx, w, h, 22);
    ctx.strokeStyle = "#3e7a32";
    ctx.globalAlpha = 0.45;
    ctx.lineWidth = 2;
    for (let i = 0; i < 80; i++) {
      const x = Math.random() * w;
      const y = Math.random() * h;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + 2, y - 10 - Math.random() * 8);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
    scribbles(ctx, "#dff28a", 10, w, h);
  });

  const court = canvas(512, 512, (ctx, w, h) => {
    ctx.fillStyle = "#efd09a";
    ctx.fillRect(0, 0, w, h);
    for (let y = 0; y < h; y += 64) {
      for (let x = 0; x < w; x += 64) {
        ctx.fillStyle = (x / 64 + y / 64) % 2 === 0 ? "#f3d7a6" : "#e6c48c";
        ctx.fillRect(x + 2, y + 2, 60, 60);
      }
    }
    noise(ctx, w, h, 12);
    scribbles(ctx, "#c47a3a", 8, w, h);
  });

  const sky = canvas(16, 512, (ctx, w, h) => {
    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, "#6eb6ee");
    g.addColorStop(0.45, "#b7e4fb");
    g.addColorStop(1, "#e7f6ff");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
  });

  const flag = canvas(256, 160, (ctx, w, h) => {
    ctx.fillStyle = "#e24b3a";
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = "#f2c14e";
    ctx.fillRect(0, 0, w, 28);
    ctx.fillRect(0, h - 28, w, 28);
    ctx.strokeStyle = "#2a2118";
    ctx.lineWidth = 8;
    ctx.strokeRect(10, 10, w - 20, h - 20);
    ctx.fillStyle = "#2a2118";
    ctx.font = "700 54px Fredoka, Nunito, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("T", w / 2, h / 2 + 4);
  });

  function label(text, bg, fg) {
    return canvas(512, 128, (ctx, w, h) => {
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, w, h);
      ctx.strokeStyle = "#2a2118";
      ctx.lineWidth = 10;
      ctx.strokeRect(6, 6, w - 12, h - 12);
      ctx.fillStyle = fg;
      ctx.font = "700 64px Fredoka, Nunito, sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(text, w / 2, h / 2 + 4);
    });
  }

  return {
    card: texOf(THREE, card),
    grass: texOf(THREE, grass, 8, 8),
    court: texOf(THREE, court, 6, 6),
    sky: texOf(THREE, sky, 1, 1),
    flag: texOf(THREE, flag),
    guards: texOf(THREE, label("GUARDS", "#2f62e0", "#fff6d8")),
    zombies: texOf(THREE, label("ZOMBIE LAND", "#6fbf45", "#241c12")),
    castle: texOf(THREE, label("CASTLE", "#f4e3a2", "#2a2118")),
  };
}
