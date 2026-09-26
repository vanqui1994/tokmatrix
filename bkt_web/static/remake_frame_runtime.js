globalThis.RemakeFrameRuntime = (() => {
  'use strict';
  // Painter for the draw lists produced by the Python renderer adapters.
  // All geometry is already resolved: this file never computes layout, timing
  // or interpolation, so a frame drawn here matches the Python frame exactly.
  const clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));

  function roundRect(ctx, x, y, w, h, r) {
    const radius = Math.max(0, Math.min(r || 0, Math.min(w, h) / 2));
    ctx.beginPath();
    ctx.moveTo(x + radius, y);
    ctx.arcTo(x + w, y, x + w, y + h, radius);
    ctx.arcTo(x + w, y + h, x, y + h, radius);
    ctx.arcTo(x, y + h, x, y, radius);
    ctx.arcTo(x, y, x + w, y, radius);
    ctx.closePath();
  }

  function drawOp(ctx, op, assets) {
    switch (op.op) {
      case 'rect':
        roundRect(ctx, op.x, op.y, op.width, op.height, op.radius);
        if (op.fill) { ctx.fillStyle = op.fill; ctx.fill(); }
        if (op.stroke) { ctx.strokeStyle = op.stroke; ctx.lineWidth = op.width_stroke || 2; ctx.stroke(); }
        break;
      case 'rect_outline':
        roundRect(ctx, op.x, op.y, op.width, op.height, op.radius);
        ctx.strokeStyle = op.stroke || '#ffffff';
        ctx.lineWidth = op.width || 3;
        ctx.stroke();
        break;
      case 'ellipse':
        ctx.beginPath();
        ctx.ellipse(op.x + op.width / 2, op.y + op.height / 2, Math.max(0.01, op.width / 2), Math.max(0.01, op.height / 2), 0, 0, Math.PI * 2);
        if (op.fill) { ctx.fillStyle = op.fill; ctx.fill(); }
        if (op.stroke) {
          ctx.save();
          if (typeof op.opacity === 'number') ctx.globalAlpha *= clamp(op.opacity);
          ctx.strokeStyle = op.stroke; ctx.lineWidth = op.stroke_width || 2; ctx.stroke();
          ctx.restore();
        }
        break;
      case 'line':
        ctx.beginPath();
        op.points.forEach((point, index) => (index ? ctx.lineTo(point[0], point[1]) : ctx.moveTo(point[0], point[1])));
        ctx.strokeStyle = op.stroke || '#000';
        ctx.lineWidth = op.width || 2;
        ctx.lineJoin = 'round';
        ctx.lineCap = 'round';
        ctx.stroke();
        break;
      case 'polygon':
        ctx.beginPath();
        op.points.forEach((point, index) => (index ? ctx.lineTo(point[0], point[1]) : ctx.moveTo(point[0], point[1])));
        ctx.closePath();
        ctx.fillStyle = op.fill;
        ctx.fill();
        break;
      case 'text': {
        ctx.font = `${op.font_size}px ${(op.font_stack || ['sans-serif']).map(name => (/\s/.test(name) ? `"${name}"` : name)).join(', ')}`;
        ctx.textAlign = op.align || 'left';
        ctx.textBaseline = 'alphabetic';
        ctx.fillStyle = op.fill || '#000';
        ctx.fillText(op.text, op.x, op.y);
        break;
      }
      case 'image':
      case 'video_frame': {
        const image = assets && assets[op.image_id || op.source_id];
        if (!image) {
          ctx.fillStyle = '#20282c';
          ctx.fillRect(op.x, op.y, op.width, op.height);
          break;
        }
        const rect = op.source_rect || { x: 0, y: 0, width: 1, height: 1 };
        ctx.drawImage(
          image,
          rect.x * image.width, rect.y * image.height, rect.width * image.width, rect.height * image.height,
          op.x, op.y, op.width, op.height,
        );
        break;
      }
      case 'blur_rect':
        ctx.save();
        if (typeof ctx.filter === 'string') ctx.filter = `blur(${op.radius || 12}px)`;
        ctx.fillStyle = 'rgba(30,36,40,0.92)';
        ctx.fillRect(op.x, op.y, op.width, op.height);
        ctx.restore();
        break;
      case 'dim':
        ctx.save();
        ctx.fillStyle = `rgba(6,10,12,${clamp(op.alpha ?? 0.5)})`;
        ctx.beginPath();
        ctx.rect(op.x, op.y, op.width, op.height);
        if (op.hole) {
          ctx.rect(op.hole.x + op.hole.width, op.hole.y, -op.hole.width, op.hole.height);
        }
        ctx.fill('evenodd');
        ctx.restore();
        break;
      case 'cursor': {
        const size = op.size || 24;
        ctx.beginPath();
        ctx.moveTo(op.x, op.y);
        ctx.lineTo(op.x, op.y + size);
        ctx.lineTo(op.x + size * 0.28, op.y + size * 0.74);
        ctx.lineTo(op.x + size * 0.52, op.y + size * 0.96);
        ctx.closePath();
        ctx.fillStyle = '#ffffff';
        ctx.strokeStyle = '#11181c';
        ctx.lineWidth = 2;
        ctx.fill();
        ctx.stroke();
        break;
      }
      case 'mouth': {
        ctx.beginPath();
        ctx.ellipse(op.x, op.y, Math.max(0.5, op.width / 2), Math.max(0.5, op.height / 2), 0, 0, Math.PI * 2);
        ctx.fillStyle = op.fill || '#7d2f31';
        ctx.fill();
        if (op.curve) {
          ctx.beginPath();
          ctx.moveTo(op.x - op.width / 2, op.y);
          ctx.quadraticCurveTo(op.x, op.y + op.curve * op.width * 0.35, op.x + op.width / 2, op.y);
          ctx.strokeStyle = '#4b1c1e';
          ctx.lineWidth = 2;
          ctx.stroke();
        }
        break;
      }
      default:
        throw new Error(`Không hỗ trợ op: ${op.op}`);
    }
  }

  function paint(ctx, frame, assets) {
    if (!frame || frame.kind !== 'draw-list') throw new Error('Frame không phải draw-list');
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, frame.canvas.width, frame.canvas.height);
    ctx.fillStyle = frame.background || '#0b1412';
    ctx.fillRect(0, 0, frame.canvas.width, frame.canvas.height);
    const layers = [...(frame.layers || [])].sort((a, b) => (a.z - b.z) || (a.layer_id < b.layer_id ? -1 : 1));
    for (const layer of layers) {
      if (!layer.ops || !layer.ops.length || layer.opacity === 0) continue;
      ctx.save();
      ctx.globalAlpha = typeof layer.opacity === 'number' ? clamp(layer.opacity) : 1;
      for (const op of layer.ops) drawOp(ctx, op, assets);
      ctx.restore();
    }
    ctx.restore();
    return frame;
  }

  function createPlayer(canvas, frames, assets) {
    // Frames are pre-computed by the adapter on a fixed grid, so seeking is a
    // lookup: no animation loop, no time-dependent state.
    const ctx = canvas.getContext('2d');
    const times = frames.map(frame => frame.seconds);
    function indexFor(seconds) {
      let best = 0;
      for (let i = 1; i < times.length; i++) {
        if (Math.abs(times[i] - seconds) < Math.abs(times[best] - seconds)) best = i;
      }
      return best;
    }
    return {
      frames,
      renderFrame(seconds) {
        if (!times.length) throw new Error('Bundle không có frame nào');
        return paint(ctx, frames[indexFor(seconds)], assets);
      },
    };
  }

  return { paint, drawOp, createPlayer, version: '1.0.0' };
})();
