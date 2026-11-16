import { useEffect, useMemo } from 'react';
import { CanvasTexture, SRGBColorSpace } from 'three';
import { ACCENT, FONT_UI, INK_SOFT, PAPER } from '../design.ts';

/** A round letter tag drawn to a canvas: no DOM overlay, no font download. */
export function FencerTag(props: { text: string; active: boolean; position: [number, number, number]; onClick?: () => void }) {
  const texture = useMemo(() => {
    const size = 128;
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = size;
    const g = canvas.getContext('2d')!;
    g.beginPath();
    g.arc(size / 2, size / 2, size / 2 - 4, 0, Math.PI * 2);
    g.fillStyle = props.active ? ACCENT : PAPER;
    g.fill();
    g.lineWidth = 3;
    g.strokeStyle = props.active ? ACCENT : INK_SOFT;
    g.stroke();
    g.fillStyle = props.active ? PAPER : INK_SOFT;
    g.font = `600 ${size * 0.52}px ${FONT_UI}`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(props.text, size / 2, size / 2 + 4);
    const t = new CanvasTexture(canvas);
    t.colorSpace = SRGBColorSpace;
    return t;
  }, [props.text, props.active]);
  useEffect(() => () => texture.dispose(), [texture]);

  return (
    <sprite
      position={props.position}
      // A fixed size on screen, however near or far the camera is, and drawn
      // above its point on screen, so even from overhead it sits beside the head.
      scale={[0.022, 0.022, 1]}
      center={[0.5, -0.35]}
      onPointerDown={(e) => {
        e.stopPropagation();
        props.onClick?.();
      }}
    >
      <spriteMaterial map={texture} depthTest={false} transparent opacity={props.active ? 1 : 0.8} sizeAttenuation={false} />
    </sprite>
  );
}
