export type AnalysisImportState = {
  id: string;
  excludedAt: Date | null;
};

export type ImportLinkedAnalysisRecord = {
  importId: string | null;
};

export function filterActiveAnalysisRecords<
  TRecord extends ImportLinkedAnalysisRecord,
>(
  records: readonly TRecord[],
  importStates: readonly AnalysisImportState[],
): TRecord[] {
  const importsById = new Map(
    importStates.map((importState) => [importState.id, importState]),
  );

  return records.filter((record) => {
    if (record.importId === null) {
      return true;
    }

    return importsById.get(record.importId)?.excludedAt === null;
  });
}
