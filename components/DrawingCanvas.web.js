// components/DrawingCanvas.web.js
// 網頁版手繪畫布：用瀏覽器內建的 <canvas>，滑鼠、觸控螢幕、觸控筆都可以畫。
// 用法和手機版（DrawingCanvas.js）相同，輸出的筆畫格式也相同（[{ points: [{ x, y, time }] }]），
// 所以後面的分組、辨識、評分完全不用改。
import { useEffect, useImperativeHandle, useRef } from 'react';

const GUIDE = '#D6DEE6';
const PEN = '#000000';
const PEN_WIDTH = 4.5;

export default function DrawingCanvas({ ref, onGetData, onBegin, onEnd }) {
  const canvasRef = useRef(null);
  const strokes = useRef([]);   // 已完成的筆畫
  const current = useRef(null); // 正在畫的這一筆
  const size = useRef({ w: 0, h: 0 });

  const redraw = () => {
    const c = canvasRef.current;
    if (!c) return;
    const ctx = c.getContext('2d');
    const dpr = window.devicePixelRatio || 1;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, size.current.w, size.current.h);
    ctx.strokeStyle = PEN;
    ctx.fillStyle = PEN;
    ctx.lineWidth = PEN_WIDTH;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    for (const s of [...strokes.current, current.current].filter(Boolean)) {
      const pts = s.points;
      if (pts.length === 1) {
        ctx.beginPath();
        ctx.arc(pts[0].x, pts[0].y, PEN_WIDTH / 2, 0, Math.PI * 2);
        ctx.fill();
        continue;
      }
      ctx.beginPath();
      ctx.moveTo(pts[0].x, pts[0].y);
      for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
      ctx.stroke();
    }
  };

  // 讓畫布的實際像素跟著大小與螢幕解析度（高解析度螢幕才不會糊）
  useEffect(() => {
    const c = canvasRef.current;
    const fit = () => {
      const r = c.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      size.current = { w: r.width, h: r.height };
      c.width = Math.round(r.width * dpr);
      c.height = Math.round(r.height * dpr);
      redraw();
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(c);
    return () => ro.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useImperativeHandle(ref, () => ({
    getData: () => onGetData?.(JSON.stringify(strokes.current)),
    clearSignature: () => { strokes.current = []; current.current = null; redraw(); },
    undo: () => { strokes.current = strokes.current.slice(0, -1); redraw(); },
  }));

  const pointOf = e => {
    const r = canvasRef.current.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top, time: Date.now() };
  };

  const down = e => {
    if (e.button != null && e.button > 0) return; // 只接受左鍵 / 手指 / 筆
    e.preventDefault();
    canvasRef.current.setPointerCapture?.(e.pointerId);
    current.current = { points: [pointOf(e)] };
    onBegin?.();
    redraw();
  };
  const move = e => {
    if (!current.current) return;
    e.preventDefault();
    // 一次移動可能合併了好幾個點，全部取出來，筆跡才完整
    const events = e.nativeEvent.getCoalescedEvents?.() || [e];
    for (const ev of events.length ? events : [e]) current.current.points.push(pointOf(ev));
    redraw();
  };
  const up = () => {
    if (!current.current) return;
    strokes.current = [...strokes.current, current.current];
    current.current = null;
    redraw();
    onEnd?.();
  };

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%', background: '#ffffff' }}>
      {/* 引導圓圈與圓心：只是背景，不會被存進筆畫 */}
      <div style={{ position: 'absolute', inset: 12, border: `3px solid ${GUIDE}`, borderRadius: '50%', pointerEvents: 'none' }} />
      <div style={{ position: 'absolute', left: '50%', top: '50%', width: 8, height: 8, margin: '-4px 0 0 -4px', background: GUIDE, borderRadius: '50%', pointerEvents: 'none' }} />
      <canvas
        ref={canvasRef}
        onPointerDown={down}
        onPointerMove={move}
        onPointerUp={up}
        onPointerCancel={up}
        onPointerLeave={e => { if (e.pointerType === 'mouse') up(); }}
        style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', touchAction: 'none', cursor: 'crosshair' }}
      />
    </div>
  );
}
