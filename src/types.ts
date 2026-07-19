export interface FormState {
  date: string;
  timing: string | null;
  diagnosis: string;
  otherClassification: string;
  approach: string;
  position: string;
  procedure: string;
  procedureType: string | null;
  role: string | null;
  opTime: string | null;
  place: string | null;
}

export interface AoState {
  regionKey: string | null;
  boneKey: string | null;
  segmentCode: string | null;
  subtypeCode: string | null;
  type: string | null;
  group: string | null;
  code: string;
}

export interface CaseEntry extends FormState {
  id: string;
  aoCode: string;
  aoRegionLabel: string;
}

export const emptyForm = (): FormState => ({
  date: '',
  timing: null,
  diagnosis: '',
  otherClassification: '',
  approach: '',
  position: '',
  procedure: '',
  procedureType: null,
  role: null,
  opTime: null,
  place: null,
});

export const emptyAo = (): AoState => ({
  regionKey: null,
  boneKey: null,
  segmentCode: null,
  subtypeCode: null,
  type: null,
  group: null,
  code: '',
});
