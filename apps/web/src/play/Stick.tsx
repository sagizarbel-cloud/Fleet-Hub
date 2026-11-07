import { useRef, useState, type RefObject } from 'react';
import { useTranslation } from 'react-i18next';

export interface StickValue {
  /** -1 (left) to 1 (right). */
  x: number;
  /** -1 (forward) to 1 (back). */
  y: number;
}

const SIZE = 112;
const TRAVEL = 36;

/** An on-screen stick for driving on touch screens; it writes its position into `valueRef`. */
export function Stick({ valueRef }: { valueRef: RefObject<StickValue> }) {
  const { t } = useTranslation();
  const [knob, setKnob] = useState({ x: 0, y: 0 });
  const centre = useRef({ x: 0, y: 0 });

  const move = (clientX: number, clientY: number) => {
    let dx = clientX - centre.current.x;
    let dy = clientY - centre.current.y;
    const length = Math.hypot(dx, dy);
    if (length > TRAVEL) {
      dx = (dx / length) * TRAVEL;
      dy = (dy / length) * TRAVEL;
    }
    setKnob({ x: dx, y: dy });
    valueRef.current = { x: dx / TRAVEL, y: dy / TRAVEL };
  };
  const release = () => {
    setKnob({ x: 0, y: 0 });
    valueRef.current = { x: 0, y: 0 };
  };

  return (
    <div
      role="presentation"
      aria-label={t('play.stick')}
      data-testid="yard-play-stick"
      className="border-border-strong bg-surface/80 fixed start-5 bottom-5 z-50 grid touch-none place-items-center rounded-full border-2"
      style={{ width: SIZE, height: SIZE }}
      onPointerDown={(e) => {
        e.currentTarget.setPointerCapture(e.pointerId);
        const r = e.currentTarget.getBoundingClientRect();
        centre.current = { x: r.left + r.width / 2, y: r.top + r.height / 2 };
        move(e.clientX, e.clientY);
      }}
      onPointerMove={(e) => e.buttons > 0 && move(e.clientX, e.clientY)}
      onPointerUp={release}
      onPointerCancel={release}
    >
      <span
        aria-hidden
        className="bg-accent block size-12 rounded-full"
        style={{ transform: `translate(${knob.x}px, ${knob.y}px)` }}
      />
    </div>
  );
}
