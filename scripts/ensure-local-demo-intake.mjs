// Only synthesizes intake for known fictional local-demo visits.
export async function ensureLocalDemoIntake(prisma, visit) {
  if (!visit.id.startsWith('local-demo-visit-') || ['Arrived', 'IntakeInProgress', 'Cancelled', 'NoShow'].includes(visit.state)) return false;
  if (await prisma.visitIntake.findUnique({ where: { visitId: visit.id } })) return false;
  await prisma.visitIntake.create({ data: {
    visitId: visit.id,
    chiefComplaint: visit.reason,
    historyNotes: 'Fictional local demo intake prepared for workflow testing.',
    weight: visit.patient?.weight ?? null,
    weightUnit: 'LB',
    completedAt: visit.createdAt,
  } });
  return true;
}
