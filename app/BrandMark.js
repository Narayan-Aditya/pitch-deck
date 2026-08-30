'use client';

import { useEffect, useRef } from 'react';

// The Open Grey mark: a dark blob and a light one drifting through each other,
// and where they overlap, grey. The name drawn as a picture.
//
// Kept as SMIL (<animate> inside the SVG) rather than rebuilt in CSS because
// the motion is path morphing — CSS cannot interpolate `d` across five
// keyframes, and the whole effect is the shapes deforming as they pass.
//
// Sized off a viewBox cropped to the two blobs' actual travel. The original was
// framed for a hero banner and carried a lot of empty space that would have
// shrunk the mark to nothing at navbar size.
const VIEW_BOX = '0 4 290 194';

// The four shapes each morph between the same five blobs, offset from one
// another so they never line up. Written once here rather than five times in
// the markup below.
const MORPH = {
  a: 'M100,18 C143,18 182,57 182,100 C182,143 143,182 100,182 C57,182 18,143 18,100 C18,57 57,18 100,18Z',
  b: 'M104,14 C152,22 186,54 178,104 C170,154 148,186 96,178 C44,170 14,148 22,96 C30,44 56,6 104,14Z',
  c: 'M96,22 C146,10 190,60 178,96 C166,132 152,190 100,184 C48,178 10,146 22,100 C34,54 46,34 96,22Z',
  d: 'M108,20 C150,28 178,62 176,108 C174,154 142,178 98,176 C54,174 22,140 24,94 C26,48 66,12 108,20Z',
};

// Two orderings of the same loop. The dark blob starts at `a`, the light one a
// beat ahead at `c`, which is what keeps them from breathing in unison.
const DARK_CYCLE = [MORPH.a, MORPH.b, MORPH.c, MORPH.d, MORPH.a].join(';');
const LIGHT_CYCLE = [MORPH.c, MORPH.d, MORPH.a, MORPH.b, MORPH.c].join(';');

const SPLINES = '.45 0 .55 1;.45 0 .55 1;.45 0 .55 1;.45 0 .55 1';

function Morph({ dur, values }) {
  return (
    <animate
      attributeName="d"
      dur={dur}
      repeatCount="indefinite"
      calcMode="spline"
      keyTimes="0;0.25;0.5;0.75;1"
      keySplines={SPLINES}
      values={values}
    />
  );
}

function Drift({ values }) {
  return (
    <animateTransform
      attributeName="transform"
      type="translate"
      // 17s against the 16s and 19s morphs, so the drift and the deformation
      // never come back into phase — the loop does not read as a loop.
      dur="17s"
      repeatCount="indefinite"
      calcMode="spline"
      keyTimes="0;0.5;1"
      keySplines=".45 0 .55 1;.45 0 .55 1"
      values={values}
    />
  );
}

const DARK_DRIFT = '-16,0; 4,7; -16,0';
const LIGHT_DRIFT = '106,0; 86,-7; 106,0';

export default function BrandMark() {
  const ref = useRef(null);

  // SMIL ignores prefers-reduced-motion — there is no CSS to switch it off, and
  // the reduced-motion block in globals.css only reaches CSS animations. So it
  // gets paused here instead, which is the API SVG provides for exactly this.
  useEffect(() => {
    const svg = ref.current;
    if (!svg) return undefined;
    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    const apply = () => (media.matches ? svg.pauseAnimations() : svg.unpauseAnimations());
    apply();
    media.addEventListener('change', apply);
    return () => media.removeEventListener('change', apply);
  }, []);

  return (
    <svg
      ref={ref}
      className="brand-mark"
      viewBox={VIEW_BOX}
      role="img"
      aria-label="Open Grey Media"
      focusable="false"
    >
      <defs>
        {/* Prefixed rather than the original "heroLens": an id in a document is
            global, and this one now ships on every page in the app. */}
        <clipPath id="ogmBrandLens">
          <path d={MORPH.c}>
            <Morph dur="19s" values={LIGHT_CYCLE} />
            <Drift values={LIGHT_DRIFT} />
          </path>
        </clipPath>
      </defs>

      <path fill="var(--lens-dark)" d={MORPH.a}>
        <Morph dur="16s" values={DARK_CYCLE} />
        <Drift values={DARK_DRIFT} />
      </path>

      <path fill="var(--lens-light)" stroke="var(--lens-stroke)" strokeWidth="1.5" d={MORPH.c}>
        <Morph dur="19s" values={LIGHT_CYCLE} />
        <Drift values={LIGHT_DRIFT} />
      </path>

      {/* The dark blob again, drawn only where the light one covers it. That
          intersection is the grey — the whole point of the mark. */}
      <g clipPath="url(#ogmBrandLens)">
        <path fill="var(--lens-mid)" d={MORPH.a}>
          <Morph dur="16s" values={DARK_CYCLE} />
          <Drift values={DARK_DRIFT} />
        </path>
      </g>
    </svg>
  );
}
