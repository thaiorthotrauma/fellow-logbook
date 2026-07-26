import type { OpTime, Place, ProcedureType, Role, Timing } from './data';

export interface FormState {
  date: string;
  timing: Timing | null;
  place: Place | null;
  staff: string;
  hn: string;
  diagnosis: string;
  otherClassification: string;
  approach: string;
  position: string;
  procedure: string;
  procedureType: ProcedureType | null;
  role: Role | null;
  opTime: OpTime | null;
  memo: string;
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

/** A case as staff see it: the same shape, plus which fellow logged it (staff
 *  view spans every fellow in the institution, unlike a fellow's own list) —
 *  and `hn` already arrives masked from staff_institution_cases(), never the
 *  real value. */
export interface StaffCaseEntry extends CaseEntry {
  fellowName: string;
}

export const emptyForm = (): FormState => ({
  date: '',
  timing: null,
  place: null,
  staff: '',
  hn: '',
  diagnosis: '',
  otherClassification: '',
  approach: '',
  position: '',
  procedure: '',
  procedureType: null,
  role: null,
  opTime: null,
  memo: '',
});

/** The editable form fields of a saved case, i.e. everything except its id and
 *  the derived AO/image columns. Written as a destructure of exactly those
 *  non-form keys so that a field added to FormState carries over on its own,
 *  and the compiler rejects this if the two types ever stop lining up. */
export const formFromEntry = ({
  id: _id,
  aoCode: _aoCode,
  aoRegionLabel: _aoRegionLabel,
  imagePaths: _imagePaths,
  ...form
}: CaseEntry): FormState => form;

export const emptyAo = (): AoState => ({
  regionKey: null,
  boneKey: null,
  segmentCode: null,
  subtypeCode: null,
  type: null,
  group: null,
  code: '',
});
