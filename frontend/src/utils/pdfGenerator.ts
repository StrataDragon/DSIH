import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';

export async function generateApplicationPDF(profile: any, schemeName: string) {
  // Create a new PDFDocument
  const pdfDoc = await PDFDocument.create();
  const page = pdfDoc.addPage([595.28, 841.89]); // A4 size
  
  // Embed fonts
  const timesRomanFont = await pdfDoc.embedFont(StandardFonts.TimesRoman);
  const timesBoldFont = await pdfDoc.embedFont(StandardFonts.TimesRomanBold);

  const { width, height } = page.getSize();
  const margin = 50;

  // Header
  page.drawText('GOVERNMENT OF INDIA', {
    x: width / 2 - 90,
    y: height - margin,
    size: 16,
    font: timesBoldFont,
    color: rgb(0, 0, 0),
  });

  page.drawText('OFFICIAL SCHEME APPLICATION FORM', {
    x: width / 2 - 140,
    y: height - margin - 25,
    size: 14,
    font: timesBoldFont,
    color: rgb(0, 0, 0),
  });

  // Line separator
  page.drawLine({
    start: { x: margin, y: height - margin - 40 },
    end: { x: width - margin, y: height - margin - 40 },
    thickness: 2,
    color: rgb(0, 0, 0),
  });

  // Scheme Name
  page.drawText(`Application For: ${schemeName}`, {
    x: margin,
    y: height - margin - 70,
    size: 12,
    font: timesBoldFont,
  });

  // Application ID (Random)
  const appId = `APP-${Math.floor(Math.random() * 1000000).toString().padStart(6, '0')}`;
  page.drawText(`Application ID: ${appId}`, {
    x: width - margin - 150,
    y: height - margin - 70,
    size: 12,
    font: timesBoldFont,
  });

  // Section 1: Personal Details
  page.drawText('PART A: APPLICANT DETAILS (AUTO-FILLED BY TECH SAHAYA)', {
    x: margin,
    y: height - margin - 120,
    size: 12,
    font: timesBoldFont,
    color: rgb(0, 0.4, 0),
  });

  const details = [
    { label: 'Full Name:', value: profile.full_name || '____________________' },
    { label: 'Age / Gender:', value: `${profile.age || '___'} Years / ${profile.gender || '___'}` },
    { label: 'State of Residence:', value: profile.state || '____________________' },
    { label: 'Occupation:', value: profile.occupation || '____________________' },
    { label: 'Annual Income (Rs):', value: profile.income ? `Rs ${profile.income.toLocaleString()}` : '____________________' },
    { label: 'Landholding (Acres):', value: profile.landholding ? profile.landholding.toString() : '____________________' },
    { label: 'Family Size:', value: profile.family_members ? (profile.family_members.length + 1).toString() : '____________________' },
    { label: 'Disability Status:', value: profile.disability ? 'Yes' : 'No / Not Disclosed' },
  ];

  let yOffset = height - margin - 150;
  details.forEach((detail) => {
    // Draw Box
    page.drawRectangle({
      x: margin,
      y: yOffset - 5,
      width: width - (margin * 2),
      height: 25,
      borderColor: rgb(0.8, 0.8, 0.8),
      borderWidth: 1,
    });

    page.drawText(detail.label, {
      x: margin + 10,
      y: yOffset,
      size: 11,
      font: timesBoldFont,
    });

    page.drawText(detail.value, {
      x: margin + 150,
      y: yOffset,
      size: 11,
      font: timesRomanFont,
      color: rgb(0.1, 0.1, 0.9), // Blue text for auto-filled data
    });

    yOffset -= 35;
  });

  // Declaration
  page.drawText('PART B: DECLARATION', {
    x: margin,
    y: yOffset - 20,
    size: 12,
    font: timesBoldFont,
  });

  const declaration = `I hereby declare that the details auto-filled above by the Tech Sahaya system \nare true and correct to the best of my knowledge. I understand that any false \ninformation may lead to rejection of this application.`;
  
  page.drawText(declaration, {
    x: margin,
    y: yOffset - 40,
    size: 11,
    font: timesRomanFont,
    lineHeight: 15,
  });

  // Signatures
  page.drawText('Date: ' + new Date().toLocaleDateString(), {
    x: margin,
    y: margin + 40,
    size: 11,
    font: timesRomanFont,
  });

  page.drawText('Place: ' + (profile.state || '_____________'), {
    x: margin,
    y: margin + 20,
    size: 11,
    font: timesRomanFont,
  });

  page.drawLine({
    start: { x: width - margin - 150, y: margin + 40 },
    end: { x: width - margin, y: margin + 40 },
    thickness: 1,
    color: rgb(0, 0, 0),
  });

  page.drawText('Signature of Applicant', {
    x: width - margin - 140,
    y: margin + 20,
    size: 11,
    font: timesBoldFont,
  });

  // Serialize to bytes
  const pdfBytes = await pdfDoc.save();

  // Create Blob and trigger download
  // @ts-ignore
  const blob = new Blob([pdfBytes], { type: 'application/pdf' });
  const url = URL.createObjectURL(blob);
  
  const link = document.createElement('a');
  link.href = url;
  link.download = `Application_${schemeName.replace(/\s+/g, '_')}_${appId}.pdf`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
