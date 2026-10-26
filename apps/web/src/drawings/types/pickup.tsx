import type { VehicleDrawingDef } from '../model';

export const pickup: VehicleDrawingDef = {
  top: {
    width: 120,
    height: 220,
    parts: {
      wheels: (
        <>
          <rect x="7" y="38" width="14" height="32" rx="4" />
          <rect x="99" y="38" width="14" height="32" rx="4" />
          <rect x="7" y="152" width="14" height="32" rx="4" />
          <rect x="99" y="152" width="14" height="32" rx="4" />
        </>
      ),
      body: (
        <>
          <path d="M34 10 H86 Q104 10 104 30 V198 Q104 210 92 210 H28 Q16 210 16 198 V30 Q16 10 34 10 Z" />
          <path d="M28 20 Q60 14 92 20 V56 H28 Z" />
          <path d="M60 22 V54" />
          <rect x="6" y="74" width="11" height="7" rx="2" />
          <rect x="103" y="74" width="11" height="7" rx="2" />
        </>
      ),
      bed: (
        <>
          <rect x="22" y="142" width="76" height="62" rx="4" />
          <path d="M30 156 H90 M30 170 H90 M30 184 H90" />
        </>
      ),
      cab: (
        <>
          <rect x="22" y="64" width="76" height="72" rx="10" />
          <path d="M27 70 H93 L87 88 H33 Z" />
          <path d="M31 126 H89" />
        </>
      ),
    },
  },
  side: {
    width: 300,
    height: 140,
    parts: {
      body: (
        <>
          <path d="M18 104 V72 Q18 68 22 68 H148 L152 34 Q153 30 158 30 H206 Q211 30 214 34 L236 62 L274 66 Q282 67 282 76 V100 Q282 104 278 104 H264 A26 26 0 0 0 212 104 H88 A26 26 0 0 0 36 104 Z" />
          <rect x="274" y="72" width="6" height="7" rx="1.5" />
          <rect x="18" y="74" width="4" height="12" rx="1" />
        </>
      ),
      bed: <path d="M148 68 V100 M22 78 H144" />,
      cab: (
        <>
          <path d="M158 37 H204 L224 62 H158 Z" />
          <path d="M184 37 V62" />
          <path d="M156 68 V98 M220 68 V98" />
          <path d="M226 52 L235 50 V57 Z" />
        </>
      ),
      wheels: (
        <>
          <circle cx="62" cy="110" r="20" />
          <circle cx="62" cy="110" r="7" />
          <circle cx="238" cy="110" r="20" />
          <circle cx="238" cy="110" r="7" />
        </>
      ),
    },
  },
  lift: { wheels: 0, body: 0.04, bed: 0.07, cab: 0.12 },
};
