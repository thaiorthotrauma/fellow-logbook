// Fictional roster + case data for the tutorial-guide screenshots. Names are
// invented, HNs are made up, and the clinical text is generic teaching-example
// wording — no real patient or person is represented. Nothing here ships.

export const SAMPLE_FELLOW = {
  full_name: 'สมชาย ใจดี',
  institution: 'สถาบันออร์โธทรอม่า',
};

export const SAMPLE_STAFF = {
  full_name: 'นายแพทย์ ประสิทธิ์ วงศ์อนันต์',
  institution: 'สถาบันออร์โธทรอม่า',
  is_admin: false,
};

interface SampleCase {
  id: string;
  date: string;
  timing: 'in' | 'out';
  place: 'own' | 'outside';
  staff: string;
  hn: string;
  diagnosis: string;
  ao_code: string;
  ao_region_label: string;
  other_classification: string;
  approach: string;
  position: string;
  procedure: string;
  procedure_type: 'primary' | 'revision' | 'staged';
  role: 'primary_surgeon' | 'primary_assistant' | 'secondary_assistant' | 'observer' | 'uncertain';
  op_time: '<1' | '1-2' | '2-3' | '3-4' | '>4';
  memo: string;
  image_paths: string[];
  fellow_name: string;
}

const CASES: SampleCase[] = [
  {
    id: 'c1',
    date: '2026-06-04',
    timing: 'in',
    place: 'own',
    staff: 'อ. สมชาย',
    hn: '6612345',
    diagnosis: 'Closed fracture left femoral shaft',
    ao_code: '32-A2',
    ao_region_label: 'Femur',
    other_classification: '',
    approach: 'Lateral, minimally invasive',
    position: '',
    procedure: 'Closed reduction and antegrade intramedullary nailing',
    procedure_type: 'primary',
    role: 'primary_assistant',
    op_time: '2-3',
    memo: '',
    image_paths: [],
    fellow_name: SAMPLE_FELLOW.full_name,
  },
  {
    id: 'c2',
    date: '2026-06-17',
    timing: 'out',
    place: 'own',
    staff: 'อ. วิชัย',
    hn: '6698210',
    diagnosis: 'Closed fracture right distal tibia\nwith intact fibula',
    ao_code: '43-B1',
    ao_region_label: 'Tibia / Fibula (Leg)',
    other_classification: 'Gustilo-Anderson type I',
    approach: 'Anteromedial',
    position: 'Supine',
    procedure: 'Open reduction and internal fixation with locking plate',
    procedure_type: 'primary',
    role: 'primary_surgeon',
    op_time: '1-2',
    memo: 'Staff scrubbed for articular reduction.',
    image_paths: ['img-preop-ap', 'img-preop-lat', 'img-postop-ap'],
    fellow_name: SAMPLE_FELLOW.full_name,
  },
  {
    id: 'c3',
    date: '2026-07-02',
    timing: 'in',
    place: 'own',
    staff: 'อ. สมชาย',
    hn: '6701733',
    diagnosis: 'Acetabular fracture, right posterior wall',
    ao_code: '62-B1',
    ao_region_label: 'Acetabulum',
    other_classification: 'Judet-Letournel: posterior wall',
    approach: 'Kocher-Langenbeck',
    position: 'Lateral decubitus',
    procedure: 'Open reduction and internal fixation, posterior wall\nButtress plate and lag screws',
    procedure_type: 'primary',
    role: 'primary_assistant',
    op_time: '3-4',
    memo: '',
    image_paths: [],
    fellow_name: SAMPLE_FELLOW.full_name,
  },
  {
    id: 'c4',
    date: '2026-07-15',
    timing: 'in',
    place: 'outside',
    staff: 'อ. ณัฐพล',
    hn: '4410927',
    diagnosis: 'Nonunion left humeral shaft after previous plating',
    ao_code: '12-A3',
    ao_region_label: 'Humerus',
    other_classification: '',
    approach: 'Posterior, triceps-splitting',
    position: '',
    procedure: 'Implant removal, revision plating and iliac crest bone graft',
    procedure_type: 'revision',
    role: 'primary_surgeon',
    op_time: '3-4',
    memo: 'Outside institution — joint case with host team.',
    image_paths: [],
    fellow_name: SAMPLE_FELLOW.full_name,
  },
  {
    id: 'c5',
    date: '2026-07-23',
    timing: 'out',
    place: 'own',
    staff: 'อ. วิชัย',
    hn: '6704488',
    diagnosis: 'Unstable pelvic ring injury, right sacroiliac disruption',
    ao_code: '61-C1',
    ao_region_label: 'Pelvic ring',
    other_classification: 'Young-Burgess: APC II',
    approach: 'Percutaneous',
    position: 'Supine',
    procedure: 'Percutaneous iliosacral screw fixation',
    procedure_type: 'primary',
    role: 'secondary_assistant',
    op_time: '1-2',
    memo: '',
    image_paths: [],
    fellow_name: SAMPLE_FELLOW.full_name,
  },
];

/** A second and third fellow, so the staff view's per-fellow badges and
 *  by-fellow export have something to group. */
const OTHER_FELLOW_CASES: SampleCase[] = [
  {
    id: 'c6',
    date: '2026-07-09',
    timing: 'in',
    place: 'own',
    staff: 'อ. ณัฐพล',
    hn: '6702190',
    diagnosis: 'Closed intertrochanteric fracture right hip',
    ao_code: '31-A2',
    ao_region_label: 'Femur',
    other_classification: '',
    approach: 'Lateral',
    position: '',
    procedure: 'Closed reduction and cephalomedullary nailing',
    procedure_type: 'primary',
    role: 'primary_surgeon',
    op_time: '1-2',
    memo: '',
    image_paths: [],
    fellow_name: 'แพทย์หญิง กมลชนก อินทรพร',
  },
  {
    id: 'c7',
    date: '2026-07-19',
    timing: 'out',
    place: 'own',
    staff: 'อ. สมชาย',
    hn: '6703021',
    diagnosis: 'Bimalleolar ankle fracture-dislocation, left',
    ao_code: '44-B2',
    ao_region_label: 'Malleolus (Ankle)',
    other_classification: 'Weber B',
    approach: 'Lateral and medial',
    position: 'Supine',
    procedure: 'Open reduction and internal fixation, lateral plate and medial screws',
    procedure_type: 'primary',
    role: 'primary_assistant',
    op_time: '1-2',
    memo: '',
    image_paths: [],
    fellow_name: 'แพทย์หญิง กมลชนก อินทรพร',
  },
  {
    id: 'c8',
    date: '2026-07-27',
    timing: 'in',
    place: 'own',
    staff: 'อ. วิชัย',
    hn: '6705512',
    diagnosis: 'Closed fracture right distal radius, dorsally displaced',
    ao_code: '2R3-C2',
    ao_region_label: 'Forearm (Radius / Ulna)',
    other_classification: '',
    approach: 'Volar (Henry)',
    position: '',
    procedure: 'Open reduction and volar locking plate fixation',
    procedure_type: 'primary',
    role: 'primary_surgeon',
    op_time: '<1',
    memo: '',
    image_paths: [],
    fellow_name: 'นายแพทย์ ศิริชัย เตชะวงศ์',
  },
];

/** The fellow's own rows, as `cases` columns (snake_case), oldest first —
 *  the order fetchCases() returns. HN is the real value here: a fellow reads
 *  their own rows. */
export function fellowCaseRows(): Record<string, unknown>[] {
  return CASES.map(({ fellow_name: _fellowName, ...row }) => ({ ...row }));
}

/** Every fellow's rows as staff_institution_cases() returns them: newest
 *  first, with fellow_name, and HN already masked to its last four digits by
 *  the database function. */
export function staffCaseRows(): Record<string, unknown>[] {
  return [...CASES, ...OTHER_FELLOW_CASES]
    .map(row => ({ ...row, hn: `••••${row.hn.slice(-4)}` }))
    .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
}
