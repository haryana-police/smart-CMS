/**
 * Client-safe supervisory-officer resolution.
 *
 * The assigned SO is normally the DSP of the police station's subdivision.
 * District SP and Super Admin are kept as fallback/manual choices because the
 * account master does not expose a dedicated station -> DSP posting field.
 */

export type SupervisoryOfficerOption = {
  id: string;
  name: string;
  role: 'DSP_SUBDIV' | 'SP_DISTRICT' | 'SUPER_ADMIN' | 'OTHER';
  designation: string;
  isPrimary: boolean;
};

const STATION_SUBDIVISION: Record<string, string> = {
  'ps_pnp_city': 'Panipat City',
  'ps_pnp_model_town': 'Panipat City',
  'ps_pnp_industrial': 'Panipat City',
  'ps_pnp_chandni_bagh': 'Panipat Rural',
  'ps_pnp_sadar': 'Panipat Rural',
  'ps_knl_city': 'Karnal City',
  'ps_knl_civil_lines': 'Karnal City',
  'ps_kkr_city_thanesar': 'Thanesar',
};

const DISTRICT_DSP_HEAD: Record<string, string> = {
  panipat: 'Deputy SP (Headquarters) Panipat',
  karnal: 'Deputy SP (Headquarters) Karnal',
};

const DISTRICT_SP: Record<string, string> = {
  panipat: 'Superintendent of Police, Panipat',
  karnal: 'Superintendent of Police, Karnal',
};

const norm = (value?: string) => (value || '').trim().toLowerCase();

export function getStationSubdivision(policeStation?: string): string | undefined {
  const key = norm(policeStation);
  if (!key) return undefined;
  if (STATION_SUBDIVISION[policeStation || '']) return STATION_SUBDIVISION[policeStation || ''];
  return Object.entries(STATION_SUBDIVISION).find(([id, name]) =>
    norm(id) === key || norm(name) === key || key.includes(name.toLowerCase())
  )?.[1];
}

export function resolveSupervisoryOfficers(
  policeStation?: string,
  district?: string
): SupervisoryOfficerOption[] {
  const districtKey = norm(district);
  const subdivision = getStationSubdivision(policeStation);
  const dspName = DISTRICT_DSP_HEAD[districtKey] || (district ? `Deputy SP (${district})` : 'Deputy Superintendent of Police');
  const spName = DISTRICT_SP[districtKey] || (district ? `Superintendent of Police, ${district}` : 'Superintendent of Police');

  return [
    {
      id: `dsp_${districtKey || 'subdivision'}`,
      name: subdivision && !dspName.includes(subdivision) ? `${dspName} — ${subdivision}` : dspName,
      role: 'DSP_SUBDIV',
      designation: subdivision ? `DSP, ${subdivision} Subdivision` : 'DSP (Sub-Division)',
      isPrimary: true,
    },
    {
      id: `sp_${districtKey || 'district'}`,
      name: spName,
      role: 'SP_DISTRICT',
      designation: `SP, ${district || 'District'}`,
      isPrimary: false,
    },
    {
      id: 'super_admin',
      name: 'Super Admin (Supervisory Authority)',
      role: 'SUPER_ADMIN',
      designation: 'System Supervisory Authority',
      isPrimary: false,
    },
    {
      id: 'other',
      name: '',
      role: 'OTHER',
      designation: 'Other authorized supervisory officer (manual entry)',
      isPrimary: false,
    },
  ];
}

export function isSupervisoryRole(role?: string): boolean {
  return role === 'DSP_SUBDIV' || role === 'SP_DISTRICT' || role === 'SUPER_ADMIN';
}
