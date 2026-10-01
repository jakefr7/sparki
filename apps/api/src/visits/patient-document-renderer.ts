import PDFDocument from 'pdfkit';

export interface PatientDocument {
  title: string;
  clinic: string;
  contact: string;
  patient: string;
  identifiers: string;
  generatedAt: string;
  sections: Array<{ title: string; text: string }>;
}

/** Rendering only: downloading never finalizes records, dispenses stock, or records payment. */
export function renderPatientDocument(input: PatientDocument): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'LETTER', margin: 48, bufferPages: true, info: { Title: input.title, Author: input.clinic } });
    const chunks: Buffer[] = [];
    doc.on('data', (chunk: Buffer) => chunks.push(chunk));
    doc.on('error', reject);
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.font('Helvetica-Bold').fontSize(18).fillColor('#18343c').text(input.clinic);
    doc.font('Helvetica').fontSize(10).fillColor('#52616a').text(input.contact || '');
    doc.moveDown(1.2);
    doc.font('Helvetica-Bold').fontSize(22).fillColor('#177f79').text(input.title);
    doc.moveDown(.4);
    doc.font('Helvetica-Bold').fontSize(12).fillColor('#18343c').text(input.patient);
    doc.font('Helvetica').fontSize(10).text(input.identifiers);
    doc.moveDown(.5);
    doc.fontSize(8).fillColor('#52616a').text(`Generated ${input.generatedAt} from current information.`);
    doc.moveDown(1.4);
    for (const section of input.sections) {
      if (doc.y > 640) doc.addPage();
      doc.font('Helvetica-Bold').fontSize(12).fillColor('#177f79').text(section.title);
      doc.moveDown(.4);
      doc.font('Helvetica').fontSize(11).fillColor('#18343c').text(section.text || 'Not recorded.', { lineGap: 3 });
      doc.moveDown(1.2);
    }
    const range = doc.bufferedPageRange();
    for (let page = range.start; page < range.start + range.count; page++) {
      doc.switchToPage(page);
      const bottom = doc.page.margins.bottom;
      doc.page.margins.bottom = 0;
      doc.font('Helvetica').fontSize(8).fillColor('#52616a').text(`${input.patient} | ${input.title} | Page ${page + 1} of ${range.count}`, 48, 756, { width: 516, lineBreak: false });
      doc.page.margins.bottom = bottom;
    }
    doc.end();
  });
}
