import { createContext, useContext, useMemo, useState, type ReactNode } from 'react';

interface Hover {
  /** Vehicle whose tile is hovered: its timeline events light up. */
  serial: string | null;
  /** Event that is hovered: a line links it to its vehicle's tile. */
  event: { id: string; serial: string } | null;
  setSerial: (serial: string | null) => void;
  setEvent: (event: { id: string; serial: string } | null) => void;
}

const HoverContext = createContext<Hover | null>(null);

export function HoverProvider({ children }: { children: ReactNode }) {
  const [serial, setSerial] = useState<string | null>(null);
  const [event, setEvent] = useState<Hover['event']>(null);
  const value = useMemo(() => ({ serial, event, setSerial, setEvent }), [serial, event]);
  return <HoverContext.Provider value={value}>{children}</HoverContext.Provider>;
}

export function useHover() {
  const ctx = useContext(HoverContext);
  if (!ctx) throw new Error('useHover outside HoverProvider');
  return ctx;
}
