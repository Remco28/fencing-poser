import type { Combination } from '../model/combination.ts';
import type { Units } from '../model/units.ts';
import { keySteps } from '../viewer/player.ts';
import { captionFor, renderStills } from './render.tsx';

/**
 * A printable handout: the title, then every step a student stops at (via
 * steps are left out), two to a page, each picture with its label, notes and
 * any measured distances.
 */
export async function handoutPdf(c: Combination, units: Units, onProgress?: (text: string) => void): Promise<Blob> {
  const { jsPDF } = await import('jspdf');
  const steps = keySteps(c);
  onProgress?.(`Drawing ${steps.length} step${steps.length === 1 ? '' : 's'}…`);
  // JPEG keeps a printable handout small enough to email.
  const pictures = await renderStills(c, steps, { width: 1600, height: 1000 }, 'image/jpeg');
  onProgress?.('Laying out the pages…');

  const pdf = new jsPDF({ unit: 'mm', format: 'a4' });
  const margin = 15;
  const width = 210 - margin * 2;
  // Sized so two steps, with a few lines of notes, fit on each page.
  const pictureWidth = 150;
  const pictureHeight = pictureWidth / 1.6;

  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(18);
  pdf.text(c.title || 'Combination', margin, margin + 4);
  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(9);
  pdf.setTextColor(110);
  pdf.text(`${steps.length} steps · ${new Date().toLocaleDateString()}`, margin, margin + 10);

  let y = margin + 16;
  steps.forEach((index, i) => {
    const caption = captionFor(c, index, units);
    pdf.setFontSize(10);
    const notes = caption.notes ? (pdf.splitTextToSize(caption.notes, width) as string[]) : [];
    const block = pictureHeight + 9 + notes.length * 4.6 + (caption.readout ? 5 : 0) + 6;
    if (y + block > 297 - margin) {
      pdf.addPage();
      y = margin;
    }
    pdf.addImage(pictures[i], 'JPEG', margin, y, pictureWidth, pictureHeight);
    pdf.setDrawColor(220);
    pdf.rect(margin, y, pictureWidth, pictureHeight);
    y += pictureHeight + 6;
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(12);
    pdf.setTextColor(20);
    pdf.text(caption.step, margin, y);
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(10);
    pdf.setTextColor(60);
    for (const line of notes) {
      y += 4.6;
      pdf.text(line, margin, y);
    }
    if (caption.readout) {
      y += 5;
      pdf.setTextColor(43, 108, 176);
      pdf.text(caption.readout, margin, y);
    }
    y += 9;
  });

  return pdf.output('blob');
}
