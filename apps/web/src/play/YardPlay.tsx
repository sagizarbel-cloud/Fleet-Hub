import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { X } from 'lucide-react';
import Matter from 'matter-js';
import { Button } from '@/components/ui/button';
import type { Tile } from '@/fleet/data';
import { isolate } from '@/lib/bidi';
import { Stick, type StickValue } from './Stick';

/**
 * Yard play (2026-11-05, Sagi): an optional, purely visual fling game over the fleet lot.
 * Vehicles are lifted off the page onto one canvas, thrown around with a finger or the mouse,
 * and at the end of a short shift they drive back to their bays. Nothing is sent to the server.
 */

/** How long a shift lasts (long enough to drive a lap), and how long the drive back takes. */
const SHIFT_MS = 90_000;
const RETURN_MS = 1400;
/** The shift clock runs from 06:00 to 18:00. */
const SHIFT_START_MIN = 6 * 60;
const SHIFT_SPAN_MIN = 12 * 60;

/** Weight per unit of drawing area: tracked machines are heavy, vans and pickups light. */
const DENSITY: Record<string, number> = {
  tracked_excavator: 3,
  wheel_loader: 2.8,
  wheeled_excavator: 2.6,
  backhoe_loader: 2.2,
  skid_steer: 2,
  forklift: 2,
  tractor: 2,
  truck: 1.8,
  compressor: 1.4,
  trailer: 1.2,
  van: 1,
  pickup: 1,
};
const BASE_DENSITY = 0.0015;

/** Driving: top speed and turn rate per physics step, divided by the root of the weight. */
const TOP_SPEED = 7;
const ACCEL = 0.35;
const TURN = 0.075;
/** How much sideways slide the tyres (or tracks) keep each step: low = more grip. */
const SLIDE = 0.8;
/** Tracked machines turn on the spot; wheeled ones only while rolling. */
const PIVOTS = new Set(['tracked_excavator', 'skid_steer']);
const KEYS: Record<string, 'up' | 'down' | 'left' | 'right'> = {
  ArrowUp: 'up',
  KeyW: 'up',
  ArrowDown: 'down',
  KeyS: 'down',
  ArrowLeft: 'left',
  KeyA: 'left',
  ArrowRight: 'right',
  KeyD: 'right',
};
const coarse = () => window.matchMedia('(pointer: coarse)').matches;

interface Piece {
  tile: Tile;
  body: Matter.Body;
  image: HTMLImageElement;
  width: number;
  height: number;
  home: { x: number; y: number };
  /** Where the label sits below the drawing, relative to the body's centre. */
  labelDy: number;
}

/** An inline SVG as a standalone image, with the CSS-driven colours and strokes written onto it. */
function svgImage(svg: SVGSVGElement): HTMLImageElement {
  const clone = svg.cloneNode(true) as SVGSVGElement;
  const source = [svg, ...svg.querySelectorAll('*')];
  const target = [clone, ...clone.querySelectorAll('*')];
  source.forEach((el, i) => {
    const cs = getComputedStyle(el);
    const t = target[i] as SVGElement;
    for (const prop of [
      'stroke',
      'stroke-width',
      'stroke-linecap',
      'stroke-linejoin',
      'fill',
      'opacity',
    ])
      t.style.setProperty(prop, cs.getPropertyValue(prop));
  });
  const rect = svg.getBoundingClientRect();
  clone.setAttribute('width', String(rect.width));
  clone.setAttribute('height', String(rect.height));
  clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
  const image = new Image();
  image.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(new XMLSerializer().serializeToString(clone))}`;
  return image;
}

const ease = (t: number) => (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2);

function clock(fraction: number) {
  const minutes = Math.round(SHIFT_START_MIN + SHIFT_SPAN_MIN * Math.min(1, fraction));
  return `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
}

export default function YardPlay({
  root,
  tiles,
  onExit,
}: {
  /** The fleet panel; the game covers it exactly. */
  root: HTMLElement;
  tiles: Tile[];
  onExit: () => void;
}) {
  const { t } = useTranslation();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const barRef = useRef<HTMLDivElement>(null);
  const [time, setTime] = useState(clock(0));
  const [ending, setEnding] = useState(false);
  const [driving, setDriving] = useState<string | null>(null);
  const [touch] = useState(coarse);
  const stickRef = useRef<StickValue>({ x: 0, y: 0 });
  const exitRef = useRef(onExit);
  useEffect(() => {
    exitRef.current = onExit;
  });

  useEffect(() => {
    const canvas = canvasRef.current!;
    const ctx = canvas.getContext('2d')!;
    const box = root.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(box.width * dpr);
    canvas.height = Math.round(box.height * dpr);
    canvas.style.width = `${box.width}px`;
    canvas.style.height = `${box.height}px`;

    const css = getComputedStyle(document.documentElement);
    const color = (name: string) => css.getPropertyValue(name).trim();
    const tone = { GREEN: color('--fh-ok'), AMBER: color('--fh-warn'), RED: color('--fh-bad') };
    const text = color('--fh-text');
    const accent = color('--fh-accent');
    const mono = css.getPropertyValue('--font-mono').trim() || 'monospace';

    const engine = Matter.Engine.create({ gravity: { x: 0, y: 0 } });
    const pieces: Piece[] = [];
    for (const tile of tiles) {
      const button = root.querySelector<HTMLElement>(`[data-tile="${CSS.escape(tile.serial)}"]`);
      const svg = root.querySelector<SVGSVGElement>(
        `[data-tile-visual="${CSS.escape(tile.serial)}"] svg`,
      );
      if (!button || !svg) continue;
      const r = svg.getBoundingClientRect();
      if (r.width === 0) continue;
      const b = button.getBoundingClientRect();
      const x = r.left - box.left + r.width / 2;
      const y = r.top - box.top + r.height / 2;
      const body = Matter.Bodies.rectangle(x, y, r.width, r.height, {
        density: BASE_DENSITY * (DENSITY[tile.type] ?? 1.5),
        frictionAir: 0.045,
        restitution: 0.35,
        friction: 0.2,
      });
      pieces.push({
        tile,
        body,
        image: svgImage(svg),
        width: r.width,
        height: r.height,
        home: { x, y },
        labelDy: b.bottom - box.top - 10 - y,
      });
    }
    // The panel's edges are the yard's fence; its top runs under the game's own bar.
    const wall = 80;
    const top = barRef.current?.offsetHeight ?? 0;
    const sides: [number, number, number, number][] = [
      [box.width / 2, top - wall / 2, box.width + 2 * wall, wall],
      [box.width / 2, box.height + wall / 2, box.width + 2 * wall, wall],
      [-wall / 2, box.height / 2, wall, box.height + 2 * wall],
      [box.width + wall / 2, box.height / 2, wall, box.height + 2 * wall],
    ];
    const fence = sides.map(([x, y, w, h]) =>
      Matter.Bodies.rectangle(x, y, w, h, { isStatic: true, restitution: 0.5 }),
    );
    Matter.Composite.add(engine.world, [...pieces.map((p) => p.body), ...fence]);

    // Matter reads pointer positions in canvas pixels; this keeps them in page pixels.
    canvas.setAttribute('data-pixel-ratio', String(dpr));
    const mouse = Matter.Mouse.create(canvas);
    // Matter listens for the wheel and blocks page scrolling; the page keeps its scroll.
    const m = mouse as unknown as { mousewheel: EventListener };
    canvas.removeEventListener('wheel', m.mousewheel);
    canvas.removeEventListener('mousewheel', m.mousewheel);
    canvas.removeEventListener('DOMMouseScroll', m.mousewheel);
    const grab = Matter.MouseConstraint.create(engine, {
      mouse,
      constraint: { stiffness: 0.18, damping: 0.08, render: { visible: false } },
    });
    Matter.Composite.add(engine.world, grab);

    // A quick tap (no drag) on a vehicle takes its wheel; another tap on it lets go.
    let driven: Piece | null = null;
    let down: { x: number; y: number; at: number } | null = null;
    const local = (e: PointerEvent) => {
      const r = canvas.getBoundingClientRect();
      return { x: e.clientX - r.left, y: e.clientY - r.top };
    };
    const onPointerDown = (e: PointerEvent) => {
      down = { ...local(e), at: performance.now() };
    };
    const onPointerUp = (e: PointerEvent) => {
      if (!down || returning) return;
      const at = local(e);
      const still = Math.hypot(at.x - down.x, at.y - down.y) < 8;
      const quick = performance.now() - down.at < 350;
      down = null;
      if (!still || !quick) return;
      const [hit] = Matter.Query.point(
        pieces.map((p) => p.body),
        at,
      );
      const piece = pieces.find((p) => p.body === hit) ?? null;
      if (!piece) return;
      driven = driven === piece ? null : piece;
      setDriving(driven?.tile.serial ?? null);
    };
    canvas.addEventListener('pointerdown', onPointerDown);
    canvas.addEventListener('pointerup', onPointerUp);

    const held = new Set<string>();
    const drive = () => {
      if (!driven) return;
      const stick = stickRef.current;
      const throttle = (held.has('up') ? 1 : 0) - (held.has('down') ? 1 : 0) || -stick.y;
      const steer = (held.has('right') ? 1 : 0) - (held.has('left') ? 1 : 0) || stick.x;
      const body = driven.body;
      const heavy = Math.sqrt(DENSITY[driven.tile.type] ?? 1.5);
      const fx = Math.sin(body.angle);
      const fy = -Math.cos(body.angle);
      const v = body.velocity;
      const along = v.x * fx + v.y * fy;
      // Tyres grip: most of any sideways slide is lost each step.
      const lx = v.x - along * fx;
      const ly = v.y - along * fy;
      const top = TOP_SPEED / heavy;
      const target = throttle >= 0 ? throttle * top : throttle * top * 0.5;
      const next = along + Math.max(-ACCEL / heavy, Math.min(ACCEL / heavy, target - along));
      Matter.Body.setVelocity(body, {
        x: next * fx + lx * SLIDE,
        y: next * fy + ly * SLIDE,
      });
      const rolling = Math.min(1, Math.abs(next) / (top * 0.5));
      const pivot = PIVOTS.has(driven.tile.type) ? 0.5 : 0;
      const turn = (steer * TURN * Math.max(rolling, pivot)) / heavy;
      Matter.Body.setAngularVelocity(body, next < -0.05 ? -turn : turn);
    };

    let elapsed = 0;
    let last = performance.now();
    let frame = 0;
    let returning: { at: number; from: { x: number; y: number; angle: number }[] } | null = null;
    let shownMinute = '';

    const draw = () => {
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, box.width, box.height);
      // A light sweep crosses the lot as the shift goes on.
      const sweep = (elapsed / SHIFT_MS) * (box.width + 240) - 120;
      const g = ctx.createLinearGradient(sweep - 120, 0, sweep + 120, 0);
      g.addColorStop(0, 'transparent');
      g.addColorStop(0.5, accent);
      g.addColorStop(1, 'transparent');
      ctx.globalAlpha = 0.09;
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, box.width, box.height);
      ctx.globalAlpha = 1;

      ctx.font = `12px ${mono}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      for (const p of pieces) {
        const { x, y } = p.body.position;
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(p.body.angle);
        if (p === driven) {
          // The driven machine wears a safety-yellow frame with a notch at its front.
          ctx.strokeStyle = accent;
          ctx.lineWidth = 2;
          ctx.strokeRect(-p.width / 2 - 5, -p.height / 2 - 5, p.width + 10, p.height + 10);
          ctx.fillStyle = accent;
          ctx.beginPath();
          ctx.moveTo(-6, -p.height / 2 - 5);
          ctx.lineTo(6, -p.height / 2 - 5);
          ctx.lineTo(0, -p.height / 2 - 12);
          ctx.fill();
        }
        if (p.image.complete)
          ctx.drawImage(p.image, -p.width / 2, -p.height / 2, p.width, p.height);
        ctx.restore();
        // The serial stays upright under its vehicle, with a dot in its status colour.
        const ly = y + p.labelDy;
        const label = p.tile.serial;
        const w = ctx.measureText(label).width;
        ctx.fillStyle = tone[p.tile.status];
        ctx.beginPath();
        ctx.arc(x - w / 2 - 7, ly, 3.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = p === driven ? accent : text;
        ctx.fillText(label, x + 3, ly);
      }
    };

    const step = (now: number) => {
      const dt = Math.min(now - last, 50);
      last = now;
      if (returning) {
        const k = ease(Math.min(1, (now - returning.at) / RETURN_MS));
        pieces.forEach((p, i) => {
          const from = returning!.from[i]!;
          Matter.Body.setPosition(p.body, {
            x: from.x + (p.home.x - from.x) * k,
            y: from.y + (p.home.y - from.y) * k,
          });
          // The short way round, so nothing spins a full turn on its way home.
          const turn = Math.atan2(Math.sin(-from.angle), Math.cos(-from.angle));
          Matter.Body.setAngle(p.body, from.angle + turn * k);
        });
        draw();
        if (k >= 1) {
          window.setTimeout(() => exitRef.current(), 350);
          return;
        }
      } else {
        elapsed += dt;
        drive();
        Matter.Engine.update(engine, dt);
        draw();
        const minute = clock(elapsed / SHIFT_MS);
        if (minute !== shownMinute) setTime((shownMinute = minute));
        if (elapsed >= SHIFT_MS) {
          setEnding(true);
          driven = null;
          setDriving(null);
          Matter.Composite.remove(engine.world, grab);
          pieces.forEach((p) => Matter.Body.setStatic(p.body, true));
          returning = {
            at: now,
            from: pieces.map((p) => ({ ...p.body.position, angle: p.body.angle })),
          };
        }
      }
      frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame((now) => {
      last = now;
      step(now);
    });

    // A hidden tab stops the clock and the physics; it picks up where it left off.
    const onVisibility = () => {
      if (document.hidden) cancelAnimationFrame(frame);
      else
        frame = requestAnimationFrame((now) => {
          last = now;
          step(now);
        });
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') return exitRef.current();
      const key = KEYS[e.code];
      if (!key || !driven) return;
      e.preventDefault(); // the arrows drive instead of scrolling the page
      held.add(key);
    };
    const onKeyUp = (e: KeyboardEvent) => {
      const key = KEYS[e.code];
      if (key) held.delete(key);
    };
    const onBlur = () => held.clear();
    // The lot was measured once; a new window width ends the game rather than misplace it.
    // (Phones change the height as the address bar slides away, which moves nothing here.)
    const width = window.innerWidth;
    const onResize = () => window.innerWidth !== width && exitRef.current();
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('keydown', onKey);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('blur', onBlur);
    window.addEventListener('resize', onResize);
    return () => {
      cancelAnimationFrame(frame);
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', onBlur);
      window.removeEventListener('resize', onResize);
      canvas.removeEventListener('pointerdown', onPointerDown);
      canvas.removeEventListener('pointerup', onPointerUp);
      Matter.Mouse.clearSourceEvents(mouse);
      Matter.Engine.clear(engine);
    };
  }, [root, tiles]);

  return (
    <div
      className="absolute inset-0 z-30"
      data-testid="yard-play"
      // Files dropped here would otherwise open in the browser; play files nothing.
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => e.preventDefault()}
    >
      <canvas
        ref={canvasRef}
        className="absolute inset-0 cursor-grab touch-none active:cursor-grabbing"
        aria-label={t('play.canvas')}
        role="img"
      />
      {/* The game's bar covers the panel's filters, which do nothing while it runs. */}
      <div
        ref={barRef}
        className="bg-surface border-border-strong sticky top-[calc(var(--fh-header-h,16px)-16px)] z-10 flex min-h-14 items-center gap-3 border-b px-3 py-2"
      >
        <span className="fh-big num shrink-0 text-xl leading-none">{time}</span>
        <span className="text-muted min-w-0 flex-1 text-xs [overflow-wrap:anywhere]">
          {ending
            ? t('play.endOfShift')
            : driving
              ? t(touch ? 'play.driveTouch' : 'play.driveKeys', { serial: isolate(driving) })
              : t('play.hint')}
        </span>
        <Button
          size="sm"
          variant="outline"
          className="shrink-0"
          onClick={() => exitRef.current()}
          data-testid="yard-play-exit"
        >
          <X aria-hidden />
          {t('play.exit')}
        </Button>
      </div>
      {touch && driving && !ending && <Stick valueRef={stickRef} />}
    </div>
  );
}
