import io,json,sys
from reportlab.lib import colors
from reportlab.lib.pagesizes import landscape,letter
from reportlab.lib.styles import getSampleStyleSheet
from reportlab.lib.units import inch
from reportlab.platypus import SimpleDocTemplate,Paragraph,Spacer,Table,TableStyle,PageBreak

payload=json.load(sys.stdin);buf=io.BytesIO();styles=getSampleStyleSheet()
def footer(canvas,doc):
    canvas.saveState();canvas.setFont('Helvetica',7);canvas.setFillColor(colors.HexColor('#5f6b76'))
    canvas.drawString(0.45*inch,0.3*inch,'Generated from Sparki records. This does not confirm external filing or regulatory acceptance.')
    canvas.drawRightString(10.55*inch,0.3*inch,f'Page {doc.page}');canvas.restoreState()
doc=SimpleDocTemplate(buf,pagesize=landscape(letter),leftMargin=.42*inch,rightMargin=.42*inch,topMargin=.42*inch,bottomMargin=.55*inch,title=payload['title'])
story=[Paragraph(payload['title'],styles['Title']),Paragraph(f"Clinic: {payload['clinicId']} &nbsp;&nbsp; Registration: {payload['registration']}",styles['Normal']),Paragraph(f"Generated: {payload['generatedAt']} by {payload['generatedBy']} &nbsp;&nbsp; Timezone: {payload['timezone']}",styles['Normal']),Paragraph('Filters: '+json.dumps(payload['filters'],sort_keys=True),styles['Normal']),Spacer(1,10)]
headers=[c.replace('_',' ').title() for c in payload['columns']];rows=[[Paragraph(str(v),styles['BodyText']) for v in row] for row in payload['rows']]
width=10.1*inch/max(1,len(headers));table=Table([headers]+rows,repeatRows=1,colWidths=[width]*len(headers),hAlign='LEFT')
table.setStyle(TableStyle([('BACKGROUND',(0,0),(-1,0),colors.HexColor('#eaf1f6')),('TEXTCOLOR',(0,0),(-1,0),colors.HexColor('#203040')),('FONTNAME',(0,0),(-1,0),'Helvetica-Bold'),('FONTSIZE',(0,0),(-1,-1),6.5),('VALIGN',(0,0),(-1,-1),'TOP'),('GRID',(0,0),(-1,-1),.25,colors.HexColor('#cbd5df')),('ROWBACKGROUNDS',(0,1),(-1,-1),[colors.white,colors.HexColor('#f7f9fb')]),('LEFTPADDING',(0,0),(-1,-1),3),('RIGHTPADDING',(0,0),(-1,-1),3),('TOPPADDING',(0,0),(-1,-1),4),('BOTTOMPADDING',(0,0),(-1,-1),4)]));story.append(table);story.extend([Spacer(1,12),Paragraph('Attestation / reviewer notes: ________________________________________________',styles['Normal'])]);doc.build(story,onFirstPage=footer,onLaterPages=footer);sys.stdout.buffer.write(buf.getvalue())
