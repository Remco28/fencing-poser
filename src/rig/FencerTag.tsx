import { useEffect, useMemo } from 'react';
import { CanvasTexture, SRGBColorSpace } from 'three';

const ACCENT = '#e0703a';

/** A round letter tag drawn to a canvas: no DOM overlay, no font download. */
export function FencerTag(props: { text: string; active: boolean; position: [number, number, number]; onClick?: () => void }) {
  const texture = useMemo(() => {
    const size = 128;
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = size;
    const g = canvas.getContext('2d')!;
    g.beginPath();
    g.arc(size / 2, size / 2, size / 2 - 4, 0, Math.PI * 2);
    g.fillStyle = props.active ? ACCENT : '#ffffffdd';
    g.fill();
    g.lineWidth = 4;
    g.strokeStyle = props.active ? ACCENT : '#c4c9cf';
    g.stroke();
    g.fillStyle = props.active ? '#ffffff' : '#646b73';
    g.font = `bold ${size * 0.55}px system-ui, sans-serif`;
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
      scale={[0.16, 0.16, 1]}
      onPointerDown={(e) => {
        e.stopPropagation();
        props.onClick?.();
      }}
    >
      <spriteMaterial map={texture} depthTest={false} transparent />
    </sprite>
  );
}
