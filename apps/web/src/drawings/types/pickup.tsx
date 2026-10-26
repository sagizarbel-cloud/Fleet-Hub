import { box, wheel } from '../iso';
import { byPart, type VehicleDrawingSource } from '../model';

export const pickup: VehicleDrawingSource = {
  top: {
    width: 120,
    height: 220,
    layers: byPart({
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
    }),
  },
  side: {
    width: 270,
    height: 140,
    layers: byPart({
      body: (
        <>
          <path d="M18 104 V72 Q18 68 22 68 H118 L122 34 Q123 30 128 30 H176 Q181 30 184 34 L206 62 L244 66 Q252 67 252 76 V100 Q252 104 248 104 H234 A26 26 0 0 0 182 104 H88 A26 26 0 0 0 36 104 Z" />
          <rect x="244" y="72" width="6" height="7" rx="1.5" />
          <rect x="18" y="74" width="4" height="12" rx="1" />
        </>
      ),
      bed: <path d="M118 68 V100 M22 78 H114" />,
      cab: (
        <>
          <path d="M128 37 H174 L194 62 H128 Z" />
          <path d="M154 37 V62" />
          <path d="M126 68 V98 M190 68 V98" />
          <path d="M196 52 L205 50 V57 Z" />
        </>
      ),
      wheels: (
        <>
          <circle cx="62" cy="110" r="20" />
          <circle cx="62" cy="110" r="7" />
          <circle cx="208" cy="110" r="20" />
          <circle cx="208" cy="110" r="7" />
        </>
      ),
    }),
  },
  // x and z follow the side profile (z = 130 − its y); y runs across the width.
  iso: [
    wheel('wheels', 62, 20, 20, [4, 18]),
    wheel('wheels', 208, 20, 20, [4, 18]),
    box('body', [18, 252], [8, 102], [26, 60]),
    box(
      'bed',
      [22, 114],
      [14, 96],
      [60, 63],
      [42, 62, 82].map((x) => [
        [x, 20, 63],
        [x, 90, 63],
      ]),
    ),
    {
      part: 'cab',
      profile: [
        [118, 60],
        [190, 60],
        [190, 70],
        [170, 100],
        [122, 100],
        [118, 96],
      ],
      y: [12, 98],
      decals: [
        [
          [128, 98, 92],
          [166, 98, 92],
          [180, 98, 73],
          [128, 98, 73],
        ],
        [
          [187, 20, 74.5],
          [172, 20, 97],
          [172, 90, 97],
          [187, 90, 74.5],
        ],
      ],
    },
    {
      part: 'body',
      profile: [
        [190, 60],
        [252, 60],
        [252, 63],
        [242, 68],
        [190, 70],
      ],
      y: [10, 100],
    },
    wheel('wheels', 62, 20, 20, [92, 106]),
    wheel('wheels', 208, 20, 20, [92, 106]),
  ],
};
