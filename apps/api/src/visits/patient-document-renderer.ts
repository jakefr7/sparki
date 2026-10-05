import PDFDocument from 'pdfkit';

export interface PatientDocument {
  title: string;
  clinic: string;
  contact: string;
  patient: string;
  identifiers: string;
  metadata?: Array<[string, string]>;
  reference?: string;
  generatedAt: string;
  sections: Array<{ title: string; text: string; emphasis?: boolean; keepTogether?: boolean }>;
}

/** Rendering only: downloading never finalizes records, dispenses stock, or records payment. */
export function renderPatientDocument(input: PatientDocument): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'LETTER', margins: { top: 48, right: 48, bottom: 64, left: 48 }, bufferPages: true, info: { Title: input.title, Author: input.clinic } });
    const chunks: Buffer[] = [];
    doc.on('data', (chunk: Buffer) => chunks.push(chunk));
    doc.on('error', reject);
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    const width = 516;
    const bottom = 728;
    const bodyFont = () => doc.font('Helvetica').fontSize(12).fillColor('#202020');
    function newPage() {
      doc.addPage();
      doc.font('Helvetica-Bold').fontSize(10).fillColor('#404040').text(`${input.patient} | ${input.title}`, 48, 48, { width, lineBreak: false });
      doc.y = 76;
      doc.x = 48;
    }
    function room(height: number) { if (doc.y + height > bottom) newPage(); }
    // Render wrapped lines individually, including very long words, so sections
    // can continue cleanly and PDFKit cannot strand a heading at a page boundary.
    function lines(value: string) {
      const result: string[] = [];
      for (const paragraph of value.replace(/\r\n?/g, '\n').split('\n')) {
        let line = '';
        for (const word of paragraph.split(/\s+/).filter(Boolean)) {
          if (line && doc.widthOfString(`${line} ${word}`) > width) { result.push(line); line = ''; }
          let remainder = word;
          while (doc.widthOfString(remainder) > width) {
            let count = 1;
            while (count < remainder.length && doc.widthOfString(remainder.slice(0, count + 1)) <= width) count++;
            result.push(remainder.slice(0, count)); remainder = remainder.slice(count);
          }
          line = line ? `${line} ${remainder}` : remainder;
        }
        result.push(line);
      }
      return result;
    }
    doc.font('Helvetica-Bold').fontSize(19).fillColor('#202020').text(input.clinic, { width });
    doc.font('Helvetica').fontSize(10).fillColor('#404040').text(input.contact || '', { width, lineGap: 2 });
    doc.moveDown(1.2);
    doc.font('Helvetica-Bold').fontSize(23).fillColor('#202020').text(input.title, { width });
    doc.moveDown(.6);
    if (input.metadata) {
      for (const [label, value] of input.metadata) {
        doc.font('Helvetica').fontSize(11).fillColor('#202020');
        const text = `${label}: ${value}`;
        room(doc.heightOfString(text, { width }) + 5);
        doc.text(text, { width, lineGap: 2 }); doc.moveDown(.3);
      }
    } else {
      doc.font('Helvetica-Bold').fontSize(12).text(input.patient, { width });
      doc.font('Helvetica').fontSize(10).text(input.identifiers, { width });
    }
    doc.moveDown(.6);
    doc.font('Helvetica').fontSize(9).fillColor('#404040').text(`Generated ${input.generatedAt} from current saved information.`, { width });
    if (input.reference) doc.fontSize(8).text(`Document reference: ${input.reference}`, { width });
    doc.moveDown(1.4);
    for (const section of input.sections) {
      bodyFont();
      const paragraphs = (section.text || 'Not recorded.').replace(/\r\n?/g, '\n').split('\n').map((paragraph) => lines(paragraph));
      const wrapped = paragraphs.flat();
      const lineHeight = doc.currentLineHeight(true) + 3;
      doc.font('Helvetica-Bold').fontSize(14).fillColor('#202020');
      const headingHeight = doc.heightOfString(section.title, { width });
      const sectionHeight = headingHeight + 9 + lineHeight * wrapped.length;
      room(section.keepTogether && sectionHeight <= bottom - 76 ? sectionHeight : headingHeight + 9 + lineHeight * Math.min(4, paragraphs[0]?.length ?? wrapped.length));
      if (section.emphasis) {
        doc.save().strokeColor('#202020').lineWidth(1).moveTo(48, doc.y - 4).lineTo(564, doc.y - 4).stroke().restore();
      }
      doc.font('Helvetica-Bold').fontSize(14).fillColor('#202020').text(section.title, 48, doc.y, { width, lineBreak: true });
      doc.y += 7;
      for (const paragraph of paragraphs) {
        // Keep short paragraphs together; long narratives may span pages.
        room(lineHeight * Math.min(paragraph.length, 4));
        for (const line of paragraph) {
          room(lineHeight);
          bodyFont();
          const y = doc.y;
          if (line) doc.text(line, 48, y, { width, lineBreak: false });
          doc.y = y + lineHeight;
        }
      }
      doc.y += 19;
    }
    const range = doc.bufferedPageRange();
    for (let page = range.start; page < range.start + range.count; page++) {
      doc.switchToPage(page);
      const originalBottom = doc.page.margins.bottom;
      doc.page.margins.bottom = 0;
      doc.font('Helvetica').fontSize(8).fillColor('#404040').text(`${input.patient} | Page ${page + 1} of ${range.count}`, 48, 754, { width, lineBreak: false });
      doc.page.margins.bottom = originalBottom;
    }
    doc.end();
  });
}
