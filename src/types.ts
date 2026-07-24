import type { OpTime, Place, ProcedureType, Role, Timing } from './data';

export interface FormState {
  date: string;
  timing: Timing | null;
  diagnosis: string;
  otherClassification: string;
  approach: string;
  position: string;
  procedure: string;
  procedureType: ProcedureType | null;
  role: Role | null;
  opTime: OpTime | null;
  place: Place | null;
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
  /** Google Drive file IDs for this case's images (kept as `imagePaths` /
   *  `image_paths` for backward compatibility). */
  imagePaths: string[];
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
