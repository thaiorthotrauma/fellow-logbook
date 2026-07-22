export interface SegmentOption {
  code: string;
  label: string;
}

export interface BoneOption {
  key: string;
  label: string;
  segments: SegmentOption[];
}

export interface SubtypeOption {
  code: string;
  label: string;
}

export interface Region {
  key: string;
  code: string;
  name: string;
  x: number;
  y: number;
  /** Short label shown on the map marker when `code` is too long to fit
   *  legibly in the dot (e.g. combined regions like Forearm 2R/2U). */
  pin?: string;
  segments?: SegmentOption[];
  bones?: BoneOption[];
  subtypes?: SubtypeOption[];
}

export const REGIONS: Region[] = [
  { key: 'cranio', code: '9', name: 'Craniomaxillofacial', x: 50, y: 10 },
  { key: 'clavicle', code: '15', name: 'Clavicle', x: 58, y: 19 },
  { key: 'scapula', code: '14', name: 'Scapula', x: 66, y: 25 },
  { key: 'thorax', code: '16', name: 'Thorax', x: 50, y: 27 },
  { key: 'spine', code: '5', name: 'Spine', x: 50, y: 40 },
  {
    key: 'humerus', code: '1', name: 'Humerus', x: 31, y: 33,
    segments: [
      { code: '11', label: 'Proximal (11)' },
      { code: '12', label: 'Diaphyseal (12)' },
      { code: '13', label: 'Distal (13)' },
    ],
  },
  {
    key: 'forearm', code: '2R/2U', pin: '2', name: 'Forearm (Radius / Ulna)', x: 26, y: 52,
    bones: [
      { key: 'radius', label: 'Radius', segments: [
        { code: '2R1', label: 'Proximal (2R1)' },
        { code: '2R2', label: 'Shaft (2R2)' },
        { code: '2R3', label: 'Distal (2R3)' },
      ] },
      { key: 'ulna', label: 'Ulna', segments: [
        { code: '2U1', label: 'Proximal (2U1)' },
        { code: '2U2', label: 'Shaft (2U2)' },
        { code: '2U3', label: 'Distal (2U3)' },
      ] },
    ],
  },
  {
    key: 'hand', code: '7', name: 'Hand', x: 23, y: 66,
    subtypes: [
      { code: '71', label: 'Lunate' },
      { code: '72', label: 'Scaphoid' },
      { code: '73', label: 'Capitate' },
      { code: '74', label: 'Hamate' },
      { code: '75', label: 'Trapezium' },
      { code: '76', label: 'Other carpal bones' },
      { code: '77', label: 'Metacarpals' },
      { code: '78', label: 'Phalanges' },
    ],
  },
  { key: 'pelvicring', code: '61', name: 'Pelvic ring', x: 45, y: 55 },
  { key: 'acetabulum', code: '62', name: 'Acetabulum', x: 57, y: 58 },
  {
    key: 'femur', code: '3', name: 'Femur', x: 40, y: 70,
    segments: [
      { code: '31', label: 'Proximal (31)' },
      { code: '32', label: 'Diaphyseal (32)' },
      { code: '33', label: 'Distal (33)' },
    ],
  },
  { key: 'patella', code: '34', name: 'Patella', x: 45, y: 79 },
  {
    key: 'tibiafibula', code: '4/4F', pin: '4', name: 'Tibia / Fibula (Leg)', x: 40, y: 87,
    bones: [
      { key: 'tibia', label: 'Tibia', segments: [
        { code: '41', label: 'Proximal (41)' },
        { code: '42', label: 'Diaphyseal (42)' },
        { code: '43', label: 'Distal (43)' },
      ] },
      { key: 'fibula', label: 'Fibula', segments: [
        { code: '4F1', label: 'Proximal (4F1)' },
        { code: '4F2', label: 'Diaphyseal (4F2)' },
        { code: '4F3', label: 'Distal (4F3)' },
      ] },
    ],
  },
  { key: 'malleolus', code: '44', name: 'Malleolus (Ankle)', x: 60, y: 93 },
  {
    key: 'foot', code: '8', name: 'Foot', x: 38, y: 97,
    subtypes: [
      { code: '81', label: 'Talus' },
      { code: '82', label: 'Calcaneus' },
      { code: '83', label: 'Navicular' },
      { code: '84', label: 'Cuboid' },
      { code: '85', label: 'Cuneiforms' },
      { code: '87', label: 'Metatarsals' },
      { code: '88', label: 'Phalanges' },
    ],
  },
];

// Each option list is the single source of truth for both its values (used as
// the literal-union type below, the DB CHECK constraints, and the stored
// column value) and its human labels. The `*_MAP` lookups are derived from the
// arrays so a label can never drift from its option.
interface Option<V extends string> {
  value: V;
  label: string;
}

// Returns a plain string-keyed lookup so display sites can index it with a
// possibly-legacy value and fall back to '—' rather than tripping the compiler.
const labelMap = (opts: readonly Option<string>[]): Record<string, string> =>
  Object.fromEntries(opts.map(o => [o.value, o.label]));

export const TIMING = [
  { value: 'in', label: 'Official hours' },
  { value: 'out', label: 'After hours' },
] as const satisfies readonly Option<string>[];

export const PROC_TYPE = [
  { value: 'primary', label: 'Primary surgery' },
  { value: 'revision', label: 'Revision surgery' },
  { value: 'staged', label: 'Staged surgery' },
] as const satisfies readonly Option<string>[];

export const ROLES = [
  { value: 'primary_surgeon', label: 'Primary surgeon' },
  { value: 'primary_assistant', label: 'Primary assist' },
  { value: 'secondary_assistant', label: 'Secondary assist' },
  { value: 'observer', label: 'Observer (not scrub in)' },
  { value: 'uncertain', label: 'Uncertain' },
] as const satisfies readonly Option<string>[];

export const OPTIME = [
  { value: '<1', label: '< 1 hr' },
  { value: '1-2', label: '1–2 hr' },
  { value: '2-3', label: '2–3 hr' },
  { value: '3-4', label: '3–4 hr' },
  { value: '>4', label: '> 4 hr' },
] as const satisfies readonly Option<string>[];

export const PLACE = [
  { value: 'own', label: 'Home institution' },
  { value: 'outside', label: 'Outside institution' },
] as const satisfies readonly Option<string>[];

export const TYPE_OPTS = [
  { code: 'A', label: 'Type A', desc: 'Simple / extra-articular' },
  { code: 'B', label: 'Type B', desc: 'Wedge / partial articular' },
  { code: 'C', label: 'Type C', desc: 'Complex / complete articular' },
] as const;

export const GROUP_OPTS = ['1', '2', '3'] as const;

// Literal-union types for the constrained fields — kept in lockstep with the
// option arrays above and the CHECK constraints in schema.sql.
export type Timing = (typeof TIMING)[number]['value'];
export type ProcedureType = (typeof PROC_TYPE)[number]['value'];
export type Role = (typeof ROLES)[number]['value'];
export type OpTime = (typeof OPTIME)[number]['value'];
export type Place = (typeof PLACE)[number]['value'];

export const TIMING_MAP = labelMap(TIMING);
export const PLACE_MAP = labelMap(PLACE);
export const ROLE_MAP = labelMap(ROLES);
export const OPTIME_MAP = labelMap(OPTIME);
export const PROC_MAP = labelMap(PROC_TYPE);

export const REQUIRED: { key: RequiredFormKey; label: string }[] = [
  { key: 'date', label: 'Date of operation' },
  { key: 'timing', label: 'Timing (in/out of hours)' },
  { key: 'diagnosis', label: 'Diagnosis' },
  { key: 'otherClassification', label: 'Other classification' },
  { key: 'approach', label: 'Approach' },
  { key: 'procedure', label: 'Procedure' },
  { key: 'procedureType', label: 'Type of procedure' },
  { key: 'role', label: 'Your role' },
  { key: 'opTime', label: 'Operative time' },
  { key: 'place', label: 'Place' },
];

export type RequiredFormKey =
  | 'date' | 'timing' | 'diagnosis' | 'otherClassification' | 'approach'
  | 'procedure' | 'procedureType' | 'role' | 'opTime' | 'place';
