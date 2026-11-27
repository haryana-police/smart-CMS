import { readRuntimeJson, usesPostgresStore, writeRuntimeJson } from "@/lib/runtimeJsonStore";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import type {
  MasterState,
  MasterRange,
  MasterDistrict,
  MasterOffice,
  MasterPoliceStation,
  MasterSpecializedUnit,
  HierarchyTreeNode,
  LocationStatistics,
  MasterEntityStatus,
} from '../types/adminMaster';

const STORE_PATH = path.join(process.cwd(), 'prisma', 'locations-master-store.json');
const LOCK_PATH = STORE_PATH + '.lock';

interface LocationStoreData {
  states: MasterState[];
  ranges: MasterRange[];
  districts: MasterDistrict[];
  offices: MasterOffice[];
  policeStations: MasterPoliceStation[];
  specializedUnits: MasterSpecializedUnit[];
  updatedAt: string;
}

// Default Seed Data representing Haryana Police Master Organization
function getInitialMasterData(): LocationStoreData {
  const now = new Date().toISOString();

  const states: MasterState[] = [
    {
      id: 'st_hr_01',
      name: 'Haryana',
      code: 'HR',
      stateHeadquarters: 'Panchkula',
      phqName: 'Police Headquarters Haryana (PHQ)',
      phqAddress: 'Sector 6, Panchkula, Haryana 134109',
      dgpOffice: 'Office of Director General of Police, Haryana',
      status: 'ACTIVE',
      createdAt: now,
      updatedAt: now,
    },
  ];

  const ranges: MasterRange[] = [
    {
      id: 'rng_knl_01',
      name: 'Karnal Range',
      code: 'RNG-KNL',
      stateId: 'st_hr_01',
      stateName: 'Haryana',
      rangeHeadquarters: 'Karnal',
      igOffice: 'Office of Inspector General of Police, Karnal Range',
      digOffice: 'Office of Deputy Inspector General of Police, Karnal',
      address: 'Old Judicial Complex, Karnal, Haryana',
      status: 'ACTIVE',
      createdAt: now,
      updatedAt: now,
    },
    {
      id: 'rng_rtk_01',
      name: 'Rohtak Range',
      code: 'RNG-RTK',
      stateId: 'st_hr_01',
      stateName: 'Haryana',
      rangeHeadquarters: 'Rohtak',
      igOffice: 'Office of Inspector General of Police, Rohtak Range',
      address: 'Range Complex, Rohtak, Haryana',
      status: 'ACTIVE',
      createdAt: now,
      updatedAt: now,
    },
    {
      id: 'rng_amb_01',
      name: 'Ambala Range',
      code: 'RNG-AMB',
      stateId: 'st_hr_01',
      stateName: 'Haryana',
      rangeHeadquarters: 'Ambala Cantt',
      igOffice: 'Office of Inspector General of Police, Ambala Range',
      address: 'Staff Road, Ambala Cantt, Haryana',
      status: 'ACTIVE',
      createdAt: now,
      updatedAt: now,
    },
    {
      id: 'rng_hsr_01',
      name: 'Hisar Range',
      code: 'RNG-HSR',
      stateId: 'st_hr_01',
      stateName: 'Haryana',
      rangeHeadquarters: 'Hisar',
      igOffice: 'Office of Inspector General of Police, Hisar Range',
      address: 'Delhi Road, Hisar, Haryana',
      status: 'ACTIVE',
      createdAt: now,
      updatedAt: now,
    },
    {
      id: 'rng_ggm_com',
      name: 'Gurugram Police Commissionerate',
      code: 'COM-GGM',
      stateId: 'st_hr_01',
      stateName: 'Haryana',
      rangeHeadquarters: 'Gurugram',
      igOffice: 'Office of Commissioner of Police, Gurugram (CP)',
      address: 'Vikas Sadan, Opp Mini Secretariat, Gurugram',
      status: 'ACTIVE',
      createdAt: now,
      updatedAt: now,
    },
    {
      id: 'rng_fbd_com',
      name: 'Faridabad Police Commissionerate',
      code: 'COM-FBD',
      stateId: 'st_hr_01',
      stateName: 'Haryana',
      rangeHeadquarters: 'Faridabad',
      igOffice: 'Office of Commissioner of Police, Faridabad (CP)',
      address: 'Sector 21C, Faridabad',
      status: 'ACTIVE',
      createdAt: now,
      updatedAt: now,
    },
    {
      id: 'rng_pkl_com',
      name: 'Panchkula Police Commissionerate',
      code: 'COM-PKL',
      stateId: 'st_hr_01',
      stateName: 'Haryana',
      rangeHeadquarters: 'Panchkula',
      igOffice: 'Office of Commissioner of Police, Panchkula (CP)',
      address: 'Sector 14, Panchkula',
      status: 'ACTIVE',
      createdAt: now,
      updatedAt: now,
    },
  ];

  const districts: MasterDistrict[] = [
    {
      id: 'dst_pnp_01',
      name: 'Panipat',
      code: 'DST-PNP',
      stateId: 'st_hr_01',
      stateName: 'Haryana',
      rangeId: 'rng_knl_01',
      rangeName: 'Karnal Range',
      districtHeadquarters: 'Panipat',
      spOffice: 'Office of Superintendent of Police, Panipat',
      spOfficeAddress: 'Mini Secretariat, Gohana Road, Panipat, Haryana 132103',
      contactPhone: '0180-2652200',
      email: 'sp-pnp.pol@hry.gov.in',
      status: 'ACTIVE',
      createdAt: now,
      updatedAt: now,
    },
    {
      id: 'dst_knl_01',
      name: 'Karnal',
      code: 'DST-KNL',
      stateId: 'st_hr_01',
      stateName: 'Haryana',
      rangeId: 'rng_knl_01',
      rangeName: 'Karnal Range',
      districtHeadquarters: 'Karnal',
      spOffice: 'Office of Superintendent of Police, Karnal',
      spOfficeAddress: 'Mini Secretariat, Sector 12, Karnal, Haryana',
      contactPhone: '0184-2267700',
      email: 'sp-knl.pol@hry.gov.in',
      status: 'ACTIVE',
      createdAt: now,
      updatedAt: now,
    },
    {
      id: 'dst_kkr_01',
      name: 'Kurukshetra',
      code: 'DST-KKR',
      stateId: 'st_hr_01',
      stateName: 'Haryana',
      rangeId: 'rng_amb_01',
      rangeName: 'Ambala Range',
      districtHeadquarters: 'Kurukshetra',
      spOffice: 'Office of Superintendent of Police, Kurukshetra',
      spOfficeAddress: 'Mini Secretariat, Thanesar, Kurukshetra',
      contactPhone: '01744-220022',
      email: 'sp-kkr.pol@hry.gov.in',
      status: 'ACTIVE',
      createdAt: now,
      updatedAt: now,
    },
    {
      id: 'dst_amb_01',
      name: 'Ambala',
      code: 'DST-AMB',
      stateId: 'st_hr_01',
      stateName: 'Haryana',
      rangeId: 'rng_amb_01',
      rangeName: 'Ambala Range',
      districtHeadquarters: 'Ambala City',
      spOffice: 'Office of Superintendent of Police, Ambala',
      spOfficeAddress: 'Police Lines, Ambala City',
      contactPhone: '0171-2550100',
      email: 'sp-amb.pol@hry.gov.in',
      status: 'ACTIVE',
      createdAt: now,
      updatedAt: now,
    },
    {
      id: 'dst_rtk_01',
      name: 'Rohtak',
      code: 'DST-RTK',
      stateId: 'st_hr_01',
      stateName: 'Haryana',
      rangeId: 'rng_rtk_01',
      rangeName: 'Rohtak Range',
      districtHeadquarters: 'Rohtak',
      spOffice: 'Office of Superintendent of Police, Rohtak',
      spOfficeAddress: 'Mini Secretariat, Rohtak',
      contactPhone: '01262-243300',
      email: 'sp-rtk.pol@hry.gov.in',
      status: 'ACTIVE',
      createdAt: now,
      updatedAt: now,
    },
    {
      id: 'dst_snp_01',
      name: 'Sonipat',
      code: 'DST-SNP',
      stateId: 'st_hr_01',
      stateName: 'Haryana',
      rangeId: 'rng_rtk_01',
      rangeName: 'Rohtak Range',
      districtHeadquarters: 'Sonipat',
      spOffice: 'Office of Superintendent of Police, Sonipat',
      spOfficeAddress: 'Mini Secretariat, Sonipat',
      contactPhone: '0130-2220100',
      email: 'sp-snp.pol@hry.gov.in',
      status: 'ACTIVE',
      createdAt: now,
      updatedAt: now,
    },
  ];

  const offices: MasterOffice[] = [
    {
      id: 'off_phq_01',
      name: 'Police Headquarters Haryana (PHQ)',
      code: 'OFF-PHQ-01',
      officeType: 'PHQ',
      stateId: 'st_hr_01',
      stateName: 'Haryana',
      physicalAddress: 'Sector 6, Panchkula, Haryana',
      officeHead: 'Director General of Police, Haryana',
      contactPhone: '0172-2587500',
      status: 'ACTIVE',
      createdAt: now,
      updatedAt: now,
    },
    {
      id: 'off_ig_knl',
      name: 'Office of Inspector General of Police, Karnal Range',
      code: 'OFF-IG-KNL',
      officeType: 'IG_OFFICE',
      stateId: 'st_hr_01',
      stateName: 'Haryana',
      rangeId: 'rng_knl_01',
      rangeName: 'Karnal Range',
      physicalAddress: 'Old Judicial Complex, Karnal',
      officeHead: 'Inspector General of Police (IGP)',
      contactPhone: '0184-2267800',
      status: 'ACTIVE',
      createdAt: now,
      updatedAt: now,
    },
    {
      id: 'off_sp_pnp',
      name: 'District Police Office (SP Office) Panipat',
      code: 'HAR-PNP-DPO-01',
      officeType: 'SP_OFFICE',
      stateId: 'st_hr_01',
      stateName: 'Haryana',
      rangeId: 'rng_knl_01',
      rangeName: 'Karnal Range',
      districtId: 'dst_pnp_01',
      districtName: 'Panipat',
      physicalAddress: 'Mini Secretariat, Gohana Road, Panipat',
      officeHead: 'Superintendent of Police, Panipat',
      contactPhone: '0180-2652200',
      status: 'ACTIVE',
      createdAt: now,
      updatedAt: now,
    },
    {
      id: 'off_asp_pnp',
      name: 'District Police Headquarters (ASP Office) Panipat',
      code: 'HAR-PNP-ASP-01',
      officeType: 'ASP_OFFICE',
      parentOfficeId: 'off_sp_pnp',
      parentOfficeName: 'District Police Office (SP Office) Panipat',
      stateId: 'st_hr_01',
      stateName: 'Haryana',
      rangeId: 'rng_knl_01',
      rangeName: 'Karnal Range',
      districtId: 'dst_pnp_01',
      districtName: 'Panipat',
      physicalAddress: 'Mini Secretariat, Panipat',
      officeHead: 'Additional Superintendent of Police, Panipat',
      contactPhone: '0180-2652205',
      status: 'ACTIVE',
      createdAt: now,
      updatedAt: now,
    },
    {
      id: 'off_dsp_pnp_hq',
      name: 'Sub-Divisional Police Office (DSP HQ) Panipat',
      code: 'HAR-PNP-SD-01',
      officeType: 'DSP_OFFICE',
      parentOfficeId: 'off_sp_pnp',
      parentOfficeName: 'District Police Office (SP Office) Panipat',
      stateId: 'st_hr_01',
      stateName: 'Haryana',
      rangeId: 'rng_knl_01',
      rangeName: 'Karnal Range',
      districtId: 'dst_pnp_01',
      districtName: 'Panipat',
      physicalAddress: 'Near Mini Secretariat, Panipat',
      officeHead: 'Deputy SP (Headquarters) Panipat',
      contactPhone: '0180-2652210',
      status: 'ACTIVE',
      createdAt: now,
      updatedAt: now,
    },
    {
      id: 'off_sp_knl',
      name: 'District Police Office (SP Office) Karnal',
      code: 'HAR-KNL-DPO-01',
      officeType: 'SP_OFFICE',
      stateId: 'st_hr_01',
      stateName: 'Haryana',
      rangeId: 'rng_knl_01',
      rangeName: 'Karnal Range',
      districtId: 'dst_knl_01',
      districtName: 'Karnal',
      physicalAddress: 'Mini Secretariat, Sector 12, Karnal',
      officeHead: 'Superintendent of Police, Karnal',
      contactPhone: '0184-2267700',
      status: 'ACTIVE',
      createdAt: now,
      updatedAt: now,
    },
    {
      id: 'off_dcb_pnp',
      name: 'District Crime Branch Office Panipat',
      code: 'OFF-DCB-PNP',
      officeType: 'CRIME_BRANCH',
      parentOfficeId: 'off_sp_pnp',
      parentOfficeName: 'District Police Office (SP Office) Panipat',
      stateId: 'st_hr_01',
      stateName: 'Haryana',
      rangeId: 'rng_knl_01',
      rangeName: 'Karnal Range',
      districtId: 'dst_pnp_01',
      districtName: 'Panipat',
      physicalAddress: 'Police Lines, Panipat',
      officeHead: 'DSP Crime, Panipat',
      contactPhone: '0180-2652220',
      status: 'ACTIVE',
      createdAt: now,
      updatedAt: now,
    },
  ];

  const policeStations: MasterPoliceStation[] = [
    {
      id: 'ps_pnp_city',
      name: 'PS City Panipat',
      code: 'HAR-PNP-PS-01',
      stateId: 'st_hr_01',
      stateName: 'Haryana',
      rangeId: 'rng_knl_01',
      rangeName: 'Karnal Range',
      districtId: 'dst_pnp_01',
      districtName: 'Panipat',
      subDivision: 'Panipat City',
      stationType: 'URBAN',
      address: 'GT Road, Near Sanjay Chowk, Panipat, Haryana 132103',
      shoOfficeDetails: 'Room 1, Ground Floor, PS City Panipat Complex',
      contactPhone: '0180-2640100',
      email: 'ps-city-pnp.pol@hry.gov.in',
      gpsCoordinates: { latitude: 29.3909, longitude: 76.9635 },
      status: 'ACTIVE',
      createdAt: now,
      updatedAt: now,
    },
    {
      id: 'ps_pnp_model_town',
      name: 'PS Model Town Panipat',
      code: 'HAR-PNP-PS-02',
      stateId: 'st_hr_01',
      stateName: 'Haryana',
      rangeId: 'rng_knl_01',
      rangeName: 'Karnal Range',
      districtId: 'dst_pnp_01',
      districtName: 'Panipat',
      subDivision: 'Panipat City',
      stationType: 'URBAN',
      address: 'Model Town Main Market, Panipat, Haryana',
      shoOfficeDetails: 'SHO Chamber, PS Model Town',
      contactPhone: '0180-2651100',
      email: 'ps-modeltown-pnp.pol@hry.gov.in',
      gpsCoordinates: { latitude: 29.3820, longitude: 76.9740 },
      status: 'ACTIVE',
      createdAt: now,
      updatedAt: now,
    },
    {
      id: 'ps_pnp_chandni_bagh',
      name: 'PS Chandni Bagh Panipat',
      code: 'HAR-PNP-PS-03',
      stateId: 'st_hr_01',
      stateName: 'Haryana',
      rangeId: 'rng_knl_01',
      rangeName: 'Karnal Range',
      districtId: 'dst_pnp_01',
      districtName: 'Panipat',
      subDivision: 'Panipat Rural',
      stationType: 'SEMI_URBAN',
      address: 'Chandni Bagh Road, Panipat, Haryana',
      shoOfficeDetails: 'Main Station Chamber',
      contactPhone: '0180-2661200',
      email: 'ps-chandnibagh-pnp.pol@hry.gov.in',
      status: 'ACTIVE',
      createdAt: now,
      updatedAt: now,
    },
    {
      id: 'ps_pnp_sadar',
      name: 'PS Sadar Panipat',
      code: 'HAR-PNP-PS-04',
      stateId: 'st_hr_01',
      stateName: 'Haryana',
      rangeId: 'rng_knl_01',
      rangeName: 'Karnal Range',
      districtId: 'dst_pnp_01',
      districtName: 'Panipat',
      subDivision: 'Panipat Rural',
      stationType: 'RURAL',
      address: 'Near Old Toll Plaza, GT Road, Panipat',
      shoOfficeDetails: 'SHO Chamber, Ground Floor',
      contactPhone: '0180-2670100',
      email: 'ps-sadar-pnp.pol@hry.gov.in',
      status: 'ACTIVE',
      createdAt: now,
      updatedAt: now,
    },
    {
      id: 'ps_pnp_industrial',
      name: 'PS Industrial Area Panipat',
      code: 'HAR-PNP-PS-05',
      stateId: 'st_hr_01',
      stateName: 'Haryana',
      rangeId: 'rng_knl_01',
      rangeName: 'Karnal Range',
      districtId: 'dst_pnp_01',
      districtName: 'Panipat',
      subDivision: 'Panipat City',
      stationType: 'INDUSTRIAL',
      address: 'Sector 25 Phase 2, Industrial Area, Panipat',
      shoOfficeDetails: 'SHO Chamber, PS Industrial Area',
      contactPhone: '0180-2690100',
      email: 'ps-ind-pnp.pol@hry.gov.in',
      status: 'ACTIVE',
      createdAt: now,
      updatedAt: now,
    },
    {
      id: 'ps_knl_city',
      name: 'PS City Karnal',
      code: 'HAR-KNL-PS-01',
      stateId: 'st_hr_01',
      stateName: 'Haryana',
      rangeId: 'rng_knl_01',
      rangeName: 'Karnal Range',
      districtId: 'dst_knl_01',
      districtName: 'Karnal',
      subDivision: 'Karnal City',
      stationType: 'URBAN',
      address: 'Kunjpura Road, Karnal, Haryana',
      shoOfficeDetails: 'SHO Chamber, PS City Karnal',
      contactPhone: '0184-2250100',
      email: 'ps-city-knl.pol@hry.gov.in',
      status: 'ACTIVE',
      createdAt: now,
      updatedAt: now,
    },
    {
      id: 'ps_knl_civil_lines',
      name: 'PS Civil Lines Karnal',
      code: 'HAR-KNL-PS-02',
      stateId: 'st_hr_01',
      stateName: 'Haryana',
      rangeId: 'rng_knl_01',
      rangeName: 'Karnal Range',
      districtId: 'dst_knl_01',
      districtName: 'Karnal',
      subDivision: 'Karnal City',
      stationType: 'URBAN',
      address: 'Mall Road, Civil Lines, Karnal',
      shoOfficeDetails: 'SHO Chamber, Civil Lines',
      contactPhone: '0184-2260100',
      email: 'ps-civillines-knl.pol@hry.gov.in',
      status: 'ACTIVE',
      createdAt: now,
      updatedAt: now,
    },
    {
      id: 'ps_kkr_city_thanesar',
      name: 'PS City Thanesar',
      code: 'HAR-KKR-PS-01',
      stateId: 'st_hr_01',
      stateName: 'Haryana',
      rangeId: 'rng_amb_01',
      rangeName: 'Ambala Range',
      districtId: 'dst_kkr_01',
      districtName: 'Kurukshetra',
      subDivision: 'Thanesar',
      stationType: 'URBAN',
      address: 'Railway Road, Thanesar, Kurukshetra',
      shoOfficeDetails: 'SHO Chamber, PS Thanesar',
      contactPhone: '01744-221100',
      status: 'ACTIVE',
      createdAt: now,
      updatedAt: now,
    },
  ];

  const specializedUnits: MasterSpecializedUnit[] = [
    {
      id: 'unt_cia1_pnp',
      name: 'Crime Investigation Agency 1 (CIA-1) Panipat',
      code: 'UNT-CIA1-PNP',
      unitType: 'CIA',
      stateId: 'st_hr_01',
      stateName: 'Haryana',
      rangeId: 'rng_knl_01',
      rangeName: 'Karnal Range',
      districtId: 'dst_pnp_01',
      districtName: 'Panipat',
      parentOfficeId: 'off_sp_pnp',
      parentOfficeName: 'District Police Office (SP Office) Panipat',
      physicalLocation: 'Police Lines, Panipat',
      unitHead: 'Inspector Incharge, CIA-1',
      contactPhone: '0180-2652230',
      status: 'ACTIVE',
      createdAt: now,
      updatedAt: now,
    },
    {
      id: 'unt_cia2_pnp',
      name: 'Crime Investigation Agency 2 (CIA-2) Panipat',
      code: 'UNT-CIA2-PNP',
      unitType: 'CIA',
      stateId: 'st_hr_01',
      stateName: 'Haryana',
      rangeId: 'rng_knl_01',
      rangeName: 'Karnal Range',
      districtId: 'dst_pnp_01',
      districtName: 'Panipat',
      parentOfficeId: 'off_sp_pnp',
      parentOfficeName: 'District Police Office (SP Office) Panipat',
      physicalLocation: 'Chandni Bagh Complex, Panipat',
      unitHead: 'SI Incharge, CIA-2',
      contactPhone: '0180-2652231',
      status: 'ACTIVE',
      createdAt: now,
      updatedAt: now,
    },
    {
      id: 'unt_cyber_pnp',
      name: 'Cyber Crime Police Cell Panipat',
      code: 'UNT-CYB-PNP',
      unitType: 'CYBER_CELL',
      stateId: 'st_hr_01',
      stateName: 'Haryana',
      rangeId: 'rng_knl_01',
      rangeName: 'Karnal Range',
      districtId: 'dst_pnp_01',
      districtName: 'Panipat',
      parentOfficeId: 'off_sp_pnp',
      parentOfficeName: 'District Police Office (SP Office) Panipat',
      physicalLocation: 'Mini Secretariat, 3rd Floor, Panipat',
      unitHead: 'Inspector Cyber Cell',
      contactPhone: '0180-2652240',
      status: 'ACTIVE',
      createdAt: now,
      updatedAt: now,
    },
    {
      id: 'unt_traffic_pnp',
      name: 'Traffic Police Branch Panipat',
      code: 'UNT-TRF-PNP',
      unitType: 'TRAFFIC',
      stateId: 'st_hr_01',
      stateName: 'Haryana',
      rangeId: 'rng_knl_01',
      rangeName: 'Karnal Range',
      districtId: 'dst_pnp_01',
      districtName: 'Panipat',
      physicalLocation: 'Traffic Lines, Near Toll Plaza, Panipat',
      unitHead: 'DSP Traffic, Panipat',
      contactPhone: '0180-2652250',
      status: 'ACTIVE',
      createdAt: now,
      updatedAt: now,
    },
    {
      id: 'unt_women_pnp',
      name: 'Women Police Station & Cell Panipat',
      code: 'UNT-WPS-PNP',
      unitType: 'WOMEN_CELL',
      stateId: 'st_hr_01',
      stateName: 'Haryana',
      rangeId: 'rng_knl_01',
      rangeName: 'Karnal Range',
      districtId: 'dst_pnp_01',
      districtName: 'Panipat',
      physicalLocation: 'Model Town, Panipat',
      unitHead: 'Inspector Incharge Women Cell',
      contactPhone: '0180-2652260',
      status: 'ACTIVE',
      createdAt: now,
      updatedAt: now,
    },
    {
      id: 'unt_mhc_store_pnp',
      name: 'Central District Malkhana (MHC Store) Panipat',
      code: 'UNT-MHC-PNP',
      unitType: 'MHC_STORE',
      stateId: 'st_hr_01',
      stateName: 'Haryana',
      rangeId: 'rng_knl_01',
      rangeName: 'Karnal Range',
      districtId: 'dst_pnp_01',
      districtName: 'Panipat',
      associatedPoliceStationId: 'ps_pnp_city',
      associatedPoliceStationName: 'PS City Panipat',
      physicalLocation: 'PS City Panipat Vaults & Armoury, Ground Floor',
      unitHead: 'Moharrir Head Constable (MHC)',
      contactPhone: '0180-2640105',
      status: 'ACTIVE',
      createdAt: now,
      updatedAt: now,
    },
    {
      id: 'unt_eow_pnp',
      name: 'Economic Offences Wing (EOW) Panipat',
      code: 'UNT-EOW-PNP',
      unitType: 'ECONOMIC_OFFENCES_WING',
      stateId: 'st_hr_01',
      stateName: 'Haryana',
      rangeId: 'rng_knl_01',
      rangeName: 'Karnal Range',
      districtId: 'dst_pnp_01',
      districtName: 'Panipat',
      parentOfficeId: 'off_sp_pnp',
      parentOfficeName: 'District Police Office (SP Office) Panipat',
      physicalLocation: 'Mini Secretariat, Panipat',
      unitHead: 'Inspector Incharge EOW',
      contactPhone: '0180-2652270',
      status: 'ACTIVE',
      createdAt: now,
      updatedAt: now,
    },
    {
      id: 'unt_sb_pnp',
      name: 'Special Branch (Intelligence) Panipat',
      code: 'UNT-SB-PNP',
      unitType: 'SPECIAL_BRANCH',
      stateId: 'st_hr_01',
      stateName: 'Haryana',
      rangeId: 'rng_knl_01',
      rangeName: 'Karnal Range',
      districtId: 'dst_pnp_01',
      districtName: 'Panipat',
      physicalLocation: 'Police Lines, Panipat',
      unitHead: 'Inspector Special Branch',
      status: 'ACTIVE',
      createdAt: now,
      updatedAt: now,
    },
  ];

  return {
    states,
    ranges,
    districts,
    offices,
    policeStations,
    specializedUnits,
    updatedAt: now,
  };
}

// Atomic file locking helper
async function withStoreLock<T>(fn: () => Promise<T>): Promise<T> {
  await fs.mkdir(path.dirname(STORE_PATH), { recursive: true });
  let handle;
  for (let i = 0; i < 120; i++) {
    try {
      handle = await fs.open(LOCK_PATH, 'wx');
      break;
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== 'EEXIST') throw e;
      await new Promise((r) => setTimeout(r, 25));
    }
  }
  if (!handle) throw new Error('Location store is busy. Please retry shortly.');
  try {
    return await fn();
  } finally {
    await handle.close();
    await fs.unlink(LOCK_PATH).catch(() => {});
  }
}

// Resolve linked names from their IDs for existing API and UI callers.
function resolveLocationReferences(store: LocationStoreData, forStorage = false): LocationStoreData {
  const lookup = (rows: { id: string; name: string }[]) =>
    new Map(rows.map(({ id, name }) => [id, name]));
  const states = lookup(store.states);
  const ranges = lookup(store.ranges);
  const districts = lookup(store.districts);
  const offices = lookup(store.offices);
  const stations = lookup(store.policeStations);

  function resolve<T extends {
    stateId: string;
    stateName: string;
    rangeId?: string;
    rangeName?: string;
    districtId?: string;
    districtName?: string;
    parentOfficeId?: string;
    parentOfficeName?: string;
    associatedPoliceStationId?: string;
    associatedPoliceStationName?: string;
  }>(row: T): T {
    const result = { ...row };
    const references = [
      ['stateId', 'stateName', states],
      ['rangeId', 'rangeName', ranges],
      ['districtId', 'districtName', districts],
      ['parentOfficeId', 'parentOfficeName', offices],
      ['associatedPoliceStationId', 'associatedPoliceStationName', stations],
    ] as const;
    for (const [idKey, nameKey, names] of references) {
      const id = row[idKey];
      const name = id ? names.get(id) : undefined;
      if (name === undefined) continue;
      if (forStorage) delete result[nameKey];
      else result[nameKey] = name;
    }
    return result;
  }

  return {
    ...store,
    ranges: store.ranges.map(resolve),
    districts: store.districts.map(resolve),
    offices: store.offices.map(resolve),
    policeStations: store.policeStations.map(resolve),
    specializedUnits: store.specializedUnits.map(resolve),
  };
}

// Read stored IDs and populate display names, or initialize the store.
export async function readLocationStore(db: Prisma.TransactionClient = prisma): Promise<LocationStoreData> {
  try {
    const parsed = await readRuntimeJson<LocationStoreData>(STORE_PATH, db);
    if (!parsed || !Array.isArray(parsed.states)) {
      throw new Error('Invalid location store');
    }
    if (usesPostgresStore()) {
      parsed.districts = await db.$queryRaw<MasterDistrict[]>`
        SELECT COALESCE(d.details->>'createdAt', '') AS "createdAt",
               COALESCE(d.details->>'updatedAt', '') AS "updatedAt",
               d.id, d.code, d.name, d.status, d."rangeId", r."stateId",
               '' AS "stateName", '' AS "rangeName",
               COALESCE(d.details->>'districtHeadquarters', '') AS "districtHeadquarters",
               COALESCE(d.details->>'spOffice', '') AS "spOffice",
               COALESCE(d.details->>'spOfficeAddress', '') AS "spOfficeAddress",
               COALESCE(d.details->>'contactPhone', '') AS "contactPhone",
               COALESCE(d.details->>'email', '') AS email
        FROM "District" d
        JOIN "LocationRange" r ON r.id = d."rangeId"
        ORDER BY "createdAt", d.id
      `;
    }
    return resolveLocationReferences(parsed);
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === 'ENOENT') {
      const initial = getInitialMasterData();
      await writeLocationStore(initial);
      return initial;
    }
    throw e;
  }
}

// Write data to store atomically
export async function writeLocationStore(data: LocationStoreData): Promise<void> {
  await withStoreLock(async () => {
    data.updatedAt = new Date().toISOString();
    await writeRuntimeJson(STORE_PATH, resolveLocationReferences(data, true));
  });
}

/* =========================================================================
   PUBLIC CRUD OPERATIONS
   ========================================================================= */

// --- STATES ---
export async function getAllStates(): Promise<MasterState[]> {
  const store = await readLocationStore();
  return store.states;
}

export async function createState(data: Omit<MasterState, 'id' | 'createdAt' | 'updatedAt'>): Promise<MasterState> {
  const store = await readLocationStore();
  const existing = store.states.find((s) => s.code.toUpperCase() === data.code.trim().toUpperCase());
  if (existing) throw new Error(`State with code '${data.code}' already exists.`);
  const now = new Date().toISOString();
  const newState: MasterState = {
    ...data,
    id: 'st_' + randomUUID().slice(0, 8),
    code: data.code.trim().toUpperCase(),
    createdAt: now,
    updatedAt: now,
  };
  store.states.push(newState);
  await writeLocationStore(store);
  return newState;
}

export async function updateState(id: string, updates: Partial<Omit<MasterState, 'id' | 'createdAt'>>): Promise<MasterState> {
  const store = await readLocationStore();
  const idx = store.states.findIndex((s) => s.id === id);
  if (idx === -1) throw new Error('State not found.');
  store.states[idx] = {
    ...store.states[idx],
    ...updates,
    updatedAt: new Date().toISOString(),
  };
  await writeLocationStore(store);
  return store.states[idx];
}

// --- RANGES ---
export async function getAllRanges(): Promise<MasterRange[]> {
  const store = await readLocationStore();
  return store.ranges;
}

export async function createRange(data: Omit<MasterRange, 'id' | 'createdAt' | 'updatedAt'>): Promise<MasterRange> {
  const store = await readLocationStore();
  const existing = store.ranges.find((r) => r.code.toUpperCase() === data.code.trim().toUpperCase());
  if (existing) throw new Error(`Range with code '${data.code}' already exists.`);
  const now = new Date().toISOString();
  const newRange: MasterRange = {
    ...data,
    id: 'rng_' + randomUUID().slice(0, 8),
    code: data.code.trim().toUpperCase(),
    createdAt: now,
    updatedAt: now,
  };
  store.ranges.push(newRange);
  await writeLocationStore(store);
  return newRange;
}

export async function updateRange(id: string, updates: Partial<Omit<MasterRange, 'id' | 'createdAt'>>): Promise<MasterRange> {
  const store = await readLocationStore();
  const idx = store.ranges.findIndex((r) => r.id === id);
  if (idx === -1) throw new Error('Range not found.');
  store.ranges[idx] = {
    ...store.ranges[idx],
    ...updates,
    updatedAt: new Date().toISOString(),
  };
  await writeLocationStore(store);
  return store.ranges[idx];
}

// --- DISTRICTS ---
export async function getAllDistricts(): Promise<MasterDistrict[]> {
  const store = await readLocationStore();
  return store.districts;
}

export async function createDistrict(data: Omit<MasterDistrict, 'id' | 'createdAt' | 'updatedAt'>): Promise<MasterDistrict> {
  const store = await readLocationStore();
  const existing = store.districts.find((d) => d.code.toUpperCase() === data.code.trim().toUpperCase());
  if (existing) throw new Error(`District with code '${data.code}' already exists.`);
  const now = new Date().toISOString();
  const newDistrict: MasterDistrict = {
    ...data,
    id: 'dst_' + randomUUID().slice(0, 8),
    code: data.code.trim().toUpperCase(),
    createdAt: now,
    updatedAt: now,
  };
  store.districts.push(newDistrict);
  await writeLocationStore(store);
  return newDistrict;
}

export async function updateDistrict(id: string, updates: Partial<Omit<MasterDistrict, 'id' | 'createdAt'>>): Promise<MasterDistrict> {
  const store = await readLocationStore();
  const idx = store.districts.findIndex((d) => d.id === id);
  if (idx === -1) throw new Error('District not found.');
  
  // If shifting to another range
  if (updates.rangeId && updates.rangeId !== store.districts[idx].rangeId) {
    const newRange = store.ranges.find((r) => r.id === updates.rangeId);
    if (newRange) {
      updates.rangeName = newRange.name;
      // Cascade to all police stations in this district
      store.policeStations.forEach((ps) => {
        if (ps.districtId === id) {
          ps.rangeId = newRange.id;
          ps.rangeName = newRange.name;
        }
      });
      // Cascade to offices in this district
      store.offices.forEach((off) => {
        if (off.districtId === id) {
          off.rangeId = newRange.id;
          off.rangeName = newRange.name;
        }
      });
      // Cascade to units in this district
      store.specializedUnits.forEach((unt) => {
        if (unt.districtId === id) {
          unt.rangeId = newRange.id;
          unt.rangeName = newRange.name;
        }
      });
    }
  }

  store.districts[idx] = {
    ...store.districts[idx],
    ...updates,
    updatedAt: new Date().toISOString(),
  };
  await writeLocationStore(store);
  return store.districts[idx];
}

// --- OFFICES ---
export async function getAllOffices(): Promise<MasterOffice[]> {
  const store = await readLocationStore();
  return store.offices;
}

export async function createOffice(data: Omit<MasterOffice, 'id' | 'createdAt' | 'updatedAt'>): Promise<MasterOffice> {
  const store = await readLocationStore();
  const existing = store.offices.find((o) => o.code.toUpperCase() === data.code.trim().toUpperCase());
  if (existing) throw new Error(`Office with code '${data.code}' already exists.`);
  const now = new Date().toISOString();
  const newOffice: MasterOffice = {
    ...data,
    id: 'off_' + randomUUID().slice(0, 8),
    code: data.code.trim().toUpperCase(),
    createdAt: now,
    updatedAt: now,
  };
  store.offices.push(newOffice);
  await writeLocationStore(store);
  return newOffice;
}

export async function updateOffice(id: string, updates: Partial<Omit<MasterOffice, 'id' | 'createdAt'>>): Promise<MasterOffice> {
  const store = await readLocationStore();
  const idx = store.offices.findIndex((o) => o.id === id);
  if (idx === -1) throw new Error('Office not found.');

  // Shifting district or parent office
  if (updates.districtId && updates.districtId !== store.offices[idx].districtId) {
    const dst = store.districts.find((d) => d.id === updates.districtId);
    if (dst) {
      updates.districtName = dst.name;
      updates.rangeId = dst.rangeId;
      updates.rangeName = dst.rangeName;
    }
  }

  store.offices[idx] = {
    ...store.offices[idx],
    ...updates,
    updatedAt: new Date().toISOString(),
  };
  await writeLocationStore(store);
  return store.offices[idx];
}

// --- POLICE STATIONS ---
export async function getAllPoliceStations(): Promise<MasterPoliceStation[]> {
  const store = await readLocationStore();
  return store.policeStations;
}

export async function createPoliceStation(data: Omit<MasterPoliceStation, 'id' | 'createdAt' | 'updatedAt'>): Promise<MasterPoliceStation> {
  const store = await readLocationStore();
  const existing = store.policeStations.find((ps) => ps.code.toUpperCase() === data.code.trim().toUpperCase());
  if (existing) throw new Error(`Police Station with code '${data.code}' already exists.`);
  const now = new Date().toISOString();
  const newStation: MasterPoliceStation = {
    ...data,
    id: 'ps_' + randomUUID().slice(0, 8),
    code: data.code.trim().toUpperCase(),
    createdAt: now,
    updatedAt: now,
  };
  store.policeStations.push(newStation);
  await writeLocationStore(store);
  return newStation;
}

export async function updatePoliceStation(id: string, updates: Partial<Omit<MasterPoliceStation, 'id' | 'createdAt'>>): Promise<MasterPoliceStation> {
  const store = await readLocationStore();
  const idx = store.policeStations.findIndex((ps) => ps.id === id);
  if (idx === -1) throw new Error('Police Station not found.');

  // Shifting police station to another district
  if (updates.districtId && updates.districtId !== store.policeStations[idx].districtId) {
    const dst = store.districts.find((d) => d.id === updates.districtId);
    if (dst) {
      updates.districtName = dst.name;
      updates.rangeId = dst.rangeId;
      updates.rangeName = dst.rangeName;
    }
  }

  store.policeStations[idx] = {
    ...store.policeStations[idx],
    ...updates,
    updatedAt: new Date().toISOString(),
  };
  await writeLocationStore(store);
  return store.policeStations[idx];
}

// --- SPECIALIZED UNITS ---
export async function getAllSpecializedUnits(): Promise<MasterSpecializedUnit[]> {
  const store = await readLocationStore();
  return store.specializedUnits;
}

export async function createSpecializedUnit(data: Omit<MasterSpecializedUnit, 'id' | 'createdAt' | 'updatedAt'>): Promise<MasterSpecializedUnit> {
  const store = await readLocationStore();
  const existing = store.specializedUnits.find((u) => u.code.toUpperCase() === data.code.trim().toUpperCase());
  if (existing) throw new Error(`Specialized unit with code '${data.code}' already exists.`);
  const now = new Date().toISOString();
  const newUnit: MasterSpecializedUnit = {
    ...data,
    id: 'unt_' + randomUUID().slice(0, 8),
    code: data.code.trim().toUpperCase(),
    createdAt: now,
    updatedAt: now,
  };
  store.specializedUnits.push(newUnit);
  await writeLocationStore(store);
  return newUnit;
}

export async function updateSpecializedUnit(id: string, updates: Partial<Omit<MasterSpecializedUnit, 'id' | 'createdAt'>>): Promise<MasterSpecializedUnit> {
  const store = await readLocationStore();
  const idx = store.specializedUnits.findIndex((u) => u.id === id);
  if (idx === -1) throw new Error('Specialized unit not found.');

  // Shifting unit to another district
  if (updates.districtId && updates.districtId !== store.specializedUnits[idx].districtId) {
    const dst = store.districts.find((d) => d.id === updates.districtId);
    if (dst) {
      updates.districtName = dst.name;
      updates.rangeId = dst.rangeId;
      updates.rangeName = dst.rangeName;
    }
  }

  store.specializedUnits[idx] = {
    ...store.specializedUnits[idx],
    ...updates,
    updatedAt: new Date().toISOString(),
  };
  await writeLocationStore(store);
  return store.specializedUnits[idx];
}

// --- SAFE TOGGLE STATUS ---
export async function setEntityStatus(
  entityType: 'state' | 'range' | 'district' | 'office' | 'station' | 'unit',
  id: string,
  status: MasterEntityStatus
): Promise<boolean> {
  const store = await readLocationStore();
  const now = new Date().toISOString();
  let found = false;

  if (entityType === 'state') {
    const item = store.states.find((s) => s.id === id);
    if (item) { item.status = status; item.updatedAt = now; found = true; }
  } else if (entityType === 'range') {
    const item = store.ranges.find((r) => r.id === id);
    if (item) { item.status = status; item.updatedAt = now; found = true; }
  } else if (entityType === 'district') {
    const item = store.districts.find((d) => d.id === id);
    if (item) { item.status = status; item.updatedAt = now; found = true; }
  } else if (entityType === 'office') {
    const item = store.offices.find((o) => o.id === id);
    if (item) { item.status = status; item.updatedAt = now; found = true; }
  } else if (entityType === 'station') {
    const item = store.policeStations.find((ps) => ps.id === id);
    if (item) { item.status = status; item.updatedAt = now; found = true; }
  } else if (entityType === 'unit') {
    const item = store.specializedUnits.find((u) => u.id === id);
    if (item) { item.status = status; item.updatedAt = now; found = true; }
  }

  if (found) await writeLocationStore(store);
  return found;
}

// --- DELETE ENTITIES (Strict Hierarchy Integrity) ---
export async function deleteRange(id: string): Promise<boolean> {
  const store = await readLocationStore();
  const range = store.ranges.find((r) => r.id === id);
  if (!range) throw new Error('Range not found.');

  // Check if any districts belong to this range
  const childDistricts = store.districts.filter(
    (d) => d.rangeId === id || d.rangeName?.toLowerCase() === range.name.toLowerCase()
  );
  // Check if any direct offices belong to this range
  const childOffices = store.offices.filter((o) => o.rangeId === id && !o.districtId);
  // Check if any direct units belong to this range
  const childUnits = store.specializedUnits.filter((u) => u.rangeId === id && !u.districtId);

  if (childDistricts.length > 0 || childOffices.length > 0 || childUnits.length > 0) {
    const reasons: string[] = [];
    if (childDistricts.length > 0) {
      reasons.push(`${childDistricts.length} District(s) (${childDistricts.map((d) => d.name).join(', ')})`);
    }
    if (childOffices.length > 0) reasons.push(`${childOffices.length} Direct Office(s)`);
    if (childUnits.length > 0) reasons.push(`${childUnits.length} Direct Unit(s)`);
    throw new Error(
      `Cannot delete Range "${range.name}". Hierarchy is not empty. It contains: ${reasons.join(', ')}. Please shift or delete subordinate entities first.`
    );
  }

  store.ranges = store.ranges.filter((r) => r.id !== id);
  await writeLocationStore(store);
  return true;
}

export async function deleteDistrict(id: string): Promise<boolean> {
  const store = await readLocationStore();
  const district = store.districts.find((d) => d.id === id);
  if (!district) throw new Error('District not found.');

  // Check police stations
  const childStations = store.policeStations.filter(
    (ps) => ps.districtId === id || ps.districtName?.toLowerCase() === district.name.toLowerCase()
  );
  // Check offices
  const childOffices = store.offices.filter((o) => o.districtId === id);
  // Check units
  const childUnits = store.specializedUnits.filter((u) => u.districtId === id);

  if (childStations.length > 0 || childOffices.length > 0 || childUnits.length > 0) {
    const reasons: string[] = [];
    if (childStations.length > 0) {
      reasons.push(`${childStations.length} Police Station(s) (${childStations.slice(0, 3).map((s) => s.name).join(', ')}${childStations.length > 3 ? '...' : ''})`);
    }
    if (childOffices.length > 0) reasons.push(`${childOffices.length} Office(s)`);
    if (childUnits.length > 0) reasons.push(`${childUnits.length} Specialized Unit(s)`);
    throw new Error(
      `Cannot delete District "${district.name}". Hierarchy is not empty. It contains: ${reasons.join(', ')}. Please shift or delete subordinate entities first.`
    );
  }

  store.districts = store.districts.filter((d) => d.id !== id);
  await writeLocationStore(store);
  return true;
}

export async function deleteOffice(id: string): Promise<boolean> {
  const store = await readLocationStore();
  const office = store.offices.find((o) => o.id === id);
  if (!office) throw new Error('Office not found.');

  // Check subordinate offices
  const childOffices = store.offices.filter((o) => o.parentOfficeId === id);
  // Check subordinate units
  const childUnits = store.specializedUnits.filter((u) => u.parentOfficeId === id);

  if (childOffices.length > 0 || childUnits.length > 0) {
    const reasons: string[] = [];
    if (childOffices.length > 0) reasons.push(`${childOffices.length} subordinate office(s)`);
    if (childUnits.length > 0) reasons.push(`${childUnits.length} subordinate unit(s)`);
    throw new Error(
      `Cannot delete Office "${office.name}". Hierarchy is not empty. It has: ${reasons.join(', ')}. Please reassign or delete subordinate entities first.`
    );
  }

  store.offices = store.offices.filter((o) => o.id !== id);
  await writeLocationStore(store);
  return true;
}

export async function deletePoliceStation(id: string): Promise<boolean> {
  const store = await readLocationStore();
  const station = store.policeStations.find((ps) => ps.id === id);
  if (!station) throw new Error('Police Station not found.');

  // Check if any specialized units are attached to this station
  const linkedUnits = store.specializedUnits.filter((u) => u.associatedPoliceStationId === id);
  if (linkedUnits.length > 0) {
    throw new Error(
      `Cannot delete Police Station "${station.name}". It has ${linkedUnits.length} specialized unit(s) linked to it (${linkedUnits.map((u) => u.name).join(', ')}). Please reassign or delete them first.`
    );
  }

  store.policeStations = store.policeStations.filter((ps) => ps.id !== id);
  await writeLocationStore(store);
  return true;
}

export async function deleteSpecializedUnit(id: string): Promise<boolean> {
  const store = await readLocationStore();
  const unit = store.specializedUnits.find((u) => u.id === id);
  if (!unit) throw new Error('Specialized Unit not found.');

  // Check if any other unit lists this unit as parent
  const childUnits = store.specializedUnits.filter((u) => u.parentOfficeId === id);
  if (childUnits.length > 0) {
    throw new Error(
      `Cannot delete Unit "${unit.name}". It has ${childUnits.length} subordinate unit(s) under it. Please reassign them first.`
    );
  }

  store.specializedUnits = store.specializedUnits.filter((u) => u.id !== id);
  await writeLocationStore(store);
  return true;
}

export async function deleteState(id: string): Promise<boolean> {
  const store = await readLocationStore();
  const state = store.states.find((s) => s.id === id);
  if (!state) throw new Error('State not found.');

  const childRanges = store.ranges.filter((r) => r.stateId === id);
  const childOffices = store.offices.filter((o) => o.stateId === id);
  if (childRanges.length > 0 || childOffices.length > 0) {
    throw new Error(
      `Cannot delete State "${state.name}". Hierarchy is not empty. It contains ${childRanges.length} Range(s) and ${childOffices.length} State Office(s).`
    );
  }

  store.states = store.states.filter((s) => s.id !== id);
  await writeLocationStore(store);
  return true;
}

/* =========================================================================
   HIERARCHICAL TREE EXPLORER
   ========================================================================= */

export async function getOrganizationHierarchy(): Promise<HierarchyTreeNode[]> {
  const store = await readLocationStore();

  // Root Node: State Level (Haryana Police)
  const stateNode: HierarchyTreeNode = {
    id: 'st_hr_01',
    name: 'Haryana Police (State Headquarters)',
    code: 'HR-POLICE',
    type: 'STATE',
    status: 'ACTIVE',
    details: 'Director General of Police, Haryana • State HQ: Sector 6, Panchkula',
    children: [],
  };

  // 1. STATE HEADQUARTERS & PHQ OFFICES
  const storePhqOffices = store.offices.filter(
    (off) => off.stateId === 'st_hr_01' && !off.rangeId && !off.districtId
  );

  const phqOfficesWing: HierarchyTreeNode = {
    id: 'wing_phq_offices',
    name: 'State Headquarters / PHQ Offices',
    code: 'PHQ-OFFICES',
    type: 'OFFICE',
    status: 'ACTIVE',
    details: 'Police Headquarters Haryana (PHQ) Panchkula & State Directorates',
    children: [
      // Store PHQ offices
      ...storePhqOffices.map((off) => ({
        id: off.id,
        name: off.name,
        code: off.code,
        type: 'OFFICE' as const,
        status: off.status,
        details: `${off.officeType} • Head: ${off.officeHead} • ${off.physicalAddress}`,
      })),
      // Official PHQ Directorates
      {
        id: 'phq_dgp_sec',
        name: 'DGP Secretariat & Administration',
        code: 'PHQ-DGP-SEC',
        type: 'OFFICE',
        status: 'ACTIVE',
        details: 'Office of Director General of Police, Haryana, Sector 6, Panchkula',
      },
      {
        id: 'phq_lo_wing',
        name: 'Law & Order Directorate',
        code: 'PHQ-LO',
        type: 'OFFICE',
        status: 'ACTIVE',
        details: 'ADGP Law & Order, PHQ Panchkula',
      },
      {
        id: 'phq_crime_dir',
        name: 'Crime & Investigation Directorate',
        code: 'PHQ-CRIME',
        type: 'OFFICE',
        status: 'ACTIVE',
        details: 'ADGP Crime & State Investigation Supervision',
      },
      {
        id: 'phq_it_telecom',
        name: 'Modernization, IT & Telecom Directorate',
        code: 'PHQ-IT-TEL',
        type: 'OFFICE',
        status: 'ACTIVE',
        details: 'Modernization, IT & Police Communication, Panchkula',
      },
      {
        id: 'phq_scrb_hq',
        name: 'State Crime Records Bureau (SCRB HQ)',
        code: 'PHQ-SCRB',
        type: 'OFFICE',
        status: 'ACTIVE',
        details: 'CCTNS Command, Madhuban & PHQ Wing',
      },
      {
        id: 'phq_erss_112',
        name: 'Haryana Dial 112 (ERSS HQ)',
        code: 'PHQ-ERSS-112',
        type: 'OFFICE',
        status: 'ACTIVE',
        details: 'State Emergency Response Centre, Sector 3, Panchkula',
      },
    ],
  };

  // Helper to build district node
  const buildDistrictNode = (dst: MasterDistrict): HierarchyTreeNode => {
    const dstOffices: HierarchyTreeNode[] = store.offices
      .filter((off) => off.districtId === dst.id)
      .map((off) => ({
        id: off.id,
        name: off.name,
        code: off.code,
        type: 'OFFICE',
        status: off.status,
        details: `${off.officeType} • Head: ${off.officeHead}`,
      }));

    const dstStations: HierarchyTreeNode[] = store.policeStations
      .filter((ps) => ps.districtId === dst.id)
      .map((ps) => ({
        id: ps.id,
        name: ps.name,
        code: ps.code,
        type: 'POLICE_STATION',
        status: ps.status,
        details: `${ps.stationType} Station • Sub-Div: ${ps.subDivision || 'N/A'} • Contact: ${ps.contactPhone}`,
      }));

    const dstUnits: HierarchyTreeNode[] = store.specializedUnits
      .filter((unt) => unt.districtId === dst.id)
      .map((unt) => ({
        id: unt.id,
        name: unt.name,
        code: unt.code,
        type: 'UNIT',
        status: unt.status,
        details: `${unt.unitType} • Head: ${unt.unitHead} • Loc: ${unt.physicalLocation}`,
      }));

    return {
      id: dst.id,
      name: `${dst.name} District`,
      code: dst.code,
      type: 'DISTRICT',
      status: dst.status,
      details: `HQ: ${dst.districtHeadquarters} • SP Office: ${dst.spOffice}`,
      children: [...dstOffices, ...dstStations, ...dstUnits],
    };
  };

  // 2. COMMISSIONERATES WING (Faridabad, Gurugram, Jhajjar, Panchkula, Sonipat)
  const commissioneratesWing: HierarchyTreeNode = {
    id: 'wing_commissionerates',
    name: 'Police Commissionerates',
    code: 'COMM-WNG',
    type: 'COMMISSIONERATE',
    status: 'ACTIVE',
    details: 'Urban Police Commissionerates with Zone & Division System',
    children: [
      {
        id: 'comm_fbd',
        name: 'Faridabad Police Commissionerate',
        code: 'FBD-COMM',
        type: 'COMMISSIONERATE',
        status: 'ACTIVE',
        details: 'Commissioner of Police, Sector 12, Faridabad',
        children: [
          {
            id: 'zone_fbd_nit',
            name: 'NIT Zone',
            code: 'FBD-NIT',
            type: 'ZONE',
            status: 'ACTIVE',
            details: 'DCP NIT Zone Jurisdiction',
            children: store.policeStations
              .filter((ps) => ps.name.toLowerCase().includes('nit') || ps.subDivision?.toLowerCase().includes('nit'))
              .map((ps) => ({
                id: ps.id,
                name: ps.name,
                code: ps.code,
                type: 'POLICE_STATION',
                status: ps.status,
                details: `${ps.stationType} Station • Contact: ${ps.contactPhone}`,
              })),
          },
          {
            id: 'zone_fbd_central',
            name: 'Central Zone',
            code: 'FBD-CENT',
            type: 'ZONE',
            status: 'ACTIVE',
            details: 'DCP Central Zone Jurisdiction',
            children: store.policeStations
              .filter((ps) => ps.name.toLowerCase().includes('central') || (ps.districtName?.toLowerCase().includes('faridabad') && !ps.name.toLowerCase().includes('nit') && !ps.name.toLowerCase().includes('ballabgarh')))
              .map((ps) => ({
                id: ps.id,
                name: ps.name,
                code: ps.code,
                type: 'POLICE_STATION',
                status: ps.status,
                details: `${ps.stationType} Station • Contact: ${ps.contactPhone}`,
              })),
          },
          {
            id: 'zone_fbd_ballabgarh',
            name: 'Ballabgarh Zone',
            code: 'FBD-BLB',
            type: 'ZONE',
            status: 'ACTIVE',
            details: 'DCP Ballabgarh Zone Jurisdiction',
            children: [],
          },
        ],
      },
      {
        id: 'comm_ggn',
        name: 'Gurugram Police Commissionerate',
        code: 'GGN-COMM',
        type: 'COMMISSIONERATE',
        status: 'ACTIVE',
        details: 'Commissioner of Police, Sohna Road, Gurugram',
        children: [
          {
            id: 'zone_ggn_east',
            name: 'East Zone',
            code: 'GGN-EAST',
            type: 'ZONE',
            status: 'ACTIVE',
            details: 'DCP East Zone Jurisdiction',
            children: store.policeStations
              .filter((ps) => ps.name.toLowerCase().includes('east') || ps.name.toLowerCase().includes('cyber') || ps.name.toLowerCase().includes('dlf'))
              .map((ps) => ({
                id: ps.id,
                name: ps.name,
                code: ps.code,
                type: 'POLICE_STATION',
                status: ps.status,
                details: `${ps.stationType} Station • Contact: ${ps.contactPhone}`,
              })),
          },
          {
            id: 'zone_ggn_west',
            name: 'West Zone',
            code: 'GGN-WEST',
            type: 'ZONE',
            status: 'ACTIVE',
            details: 'DCP West Zone Jurisdiction',
            children: store.policeStations
              .filter((ps) => ps.name.toLowerCase().includes('west') || ps.name.toLowerCase().includes('civil lines'))
              .map((ps) => ({
                id: ps.id,
                name: ps.name,
                code: ps.code,
                type: 'POLICE_STATION',
                status: ps.status,
                details: `${ps.stationType} Station • Contact: ${ps.contactPhone}`,
              })),
          },
          {
            id: 'zone_ggn_south',
            name: 'South Zone',
            code: 'GGN-SOUTH',
            type: 'ZONE',
            status: 'ACTIVE',
            details: 'DCP South Zone Jurisdiction',
            children: store.policeStations
              .filter((ps) => ps.name.toLowerCase().includes('south') || ps.name.toLowerCase().includes('sohna'))
              .map((ps) => ({
                id: ps.id,
                name: ps.name,
                code: ps.code,
                type: 'POLICE_STATION',
                status: ps.status,
                details: `${ps.stationType} Station • Contact: ${ps.contactPhone}`,
              })),
          },
          {
            id: 'zone_ggn_manesar',
            name: 'Manesar Zone',
            code: 'GGN-MNSR',
            type: 'ZONE',
            status: 'ACTIVE',
            details: 'DCP Manesar Zone Jurisdiction',
            children: store.policeStations
              .filter((ps) => ps.name.toLowerCase().includes('manesar') || ps.name.toLowerCase().includes('industrial'))
              .map((ps) => ({
                id: ps.id,
                name: ps.name,
                code: ps.code,
                type: 'POLICE_STATION',
                status: ps.status,
                details: `${ps.stationType} Station • Contact: ${ps.contactPhone}`,
              })),
          },
        ],
      },
      {
        id: 'comm_jhj',
        name: 'Jhajjar Police Commissionerate',
        code: 'JHJ-COMM',
        type: 'COMMISSIONERATE',
        status: 'ACTIVE',
        details: 'Commissioner of Police, Jhajjar',
        children: [
          {
            id: 'zone_jhj_jhj',
            name: 'Jhajjar Zone',
            code: 'JHJ-ZN',
            type: 'ZONE',
            status: 'ACTIVE',
            details: 'DCP Jhajjar Jurisdiction',
            children: [],
          },
          {
            id: 'zone_jhj_bdg',
            name: 'Bahadurgarh Zone',
            code: 'JHJ-BDG',
            type: 'ZONE',
            status: 'ACTIVE',
            details: 'DCP Bahadurgarh Jurisdiction',
            children: [],
          },
        ],
      },
      {
        id: 'comm_pkl',
        name: 'Panchkula Police Commissionerate',
        code: 'PKL-COMM',
        type: 'COMMISSIONERATE',
        status: 'ACTIVE',
        details: 'Commissioner of Police, Sector 1, Panchkula',
        children: [
          {
            id: 'zone_pkl_pkl',
            name: 'Panchkula Zone',
            code: 'PKL-ZN',
            type: 'ZONE',
            status: 'ACTIVE',
            details: 'DCP Panchkula Jurisdiction',
            children: store.policeStations
              .filter((ps) => ps.districtName?.toLowerCase().includes('panchkula'))
              .map((ps) => ({
                id: ps.id,
                name: ps.name,
                code: ps.code,
                type: 'POLICE_STATION',
                status: ps.status,
                details: `${ps.stationType} Station • Contact: ${ps.contactPhone}`,
              })),
          },
          {
            id: 'zone_pkl_klk',
            name: 'Kalka Zone',
            code: 'PKL-KLK',
            type: 'ZONE',
            status: 'ACTIVE',
            details: 'ACP Kalka Division',
            children: [],
          },
        ],
      },
      {
        id: 'comm_snp',
        name: 'Sonipat Police Commissionerate',
        code: 'SNP-COMM',
        type: 'COMMISSIONERATE',
        status: 'ACTIVE',
        details: 'Commissioner of Police, Mini Secretariat, Sonipat',
        children: [
          {
            id: 'zone_snp_city',
            name: 'Sonipat City Zone',
            code: 'SNP-CTY',
            type: 'ZONE',
            status: 'ACTIVE',
            details: 'DCP Sonipat City Jurisdiction',
            children: store.policeStations
              .filter((ps) => ps.districtName?.toLowerCase().includes('sonipat'))
              .map((ps) => ({
                id: ps.id,
                name: ps.name,
                code: ps.code,
                type: 'POLICE_STATION',
                status: ps.status,
                details: `${ps.stationType} Station • Contact: ${ps.contactPhone}`,
              })),
          },
          {
            id: 'zone_snp_ghn',
            name: 'Gohana Zone',
            code: 'SNP-GHN',
            type: 'ZONE',
            status: 'ACTIVE',
            details: 'ACP Gohana Division',
            children: [],
          },
          {
            id: 'zone_snp_gnr',
            name: 'Ganaur Zone',
            code: 'SNP-GNR',
            type: 'ZONE',
            status: 'ACTIVE',
            details: 'ACP Ganaur Division',
            children: [],
          },
        ],
      },
    ],
  };

  // 3. RANGES WING (Ambala, Hisar, Karnal, Rohtak, South Range)
  const rangesWing: HierarchyTreeNode = {
    id: 'wing_ranges',
    name: 'Police Ranges',
    code: 'RNG-WNG',
    type: 'RANGE',
    status: 'ACTIVE',
    details: 'Territorial Police Ranges supervised by Inspector General of Police (IGP)',
    children: [
      {
        id: 'rng_amb_off',
        name: 'Ambala Police Range',
        code: 'RNG-AMB',
        type: 'RANGE',
        status: 'ACTIVE',
        details: 'HQ: Ambala • Dist: Ambala, Yamunanagar, Kurukshetra',
        children: store.districts
          .filter((d) => d.rangeName?.toLowerCase().includes('ambala') || ['ambala', 'yamunanagar', 'kurukshetra'].includes(d.name.toLowerCase()))
          .map(buildDistrictNode),
      },
      {
        id: 'rng_hsr_off',
        name: 'Hisar Police Range',
        code: 'RNG-HSR',
        type: 'RANGE',
        status: 'ACTIVE',
        details: 'HQ: Hisar • Dist: Hisar, Fatehabad, Sirsa, Hansi, Jind',
        children: store.districts
          .filter((d) => d.rangeName?.toLowerCase().includes('hisar') || ['hisar', 'fatehabad', 'sirsa', 'hansi', 'jind'].includes(d.name.toLowerCase()))
          .map(buildDistrictNode),
      },
      {
        id: 'rng_knl_off',
        name: 'Karnal Police Range',
        code: 'RNG-KNL',
        type: 'RANGE',
        status: 'ACTIVE',
        details: 'HQ: Karnal • Dist: Karnal, Panipat, Kaithal',
        children: store.districts
          .filter((d) => d.rangeName?.toLowerCase().includes('karnal') || ['karnal', 'panipat', 'kaithal'].includes(d.name.toLowerCase()))
          .map(buildDistrictNode),
      },
      {
        id: 'rng_roh_off',
        name: 'Rohtak Police Range',
        code: 'RNG-ROH',
        type: 'RANGE',
        status: 'ACTIVE',
        details: 'HQ: Rohtak • Dist: Rohtak, Bhiwani, Charkhi Dadri',
        children: store.districts
          .filter((d) => d.rangeName?.toLowerCase().includes('rohtak') || ['rohtak', 'bhiwani', 'charkhi dadri'].includes(d.name.toLowerCase()))
          .map(buildDistrictNode),
      },
      {
        id: 'rng_sth_off',
        name: 'South Police Range (Rewari)',
        code: 'RNG-STH',
        type: 'RANGE',
        status: 'ACTIVE',
        details: 'HQ: Rewari • Dist: Rewari, Mahendragarh, Palwal, Nuh',
        children: store.districts
          .filter((d) => d.rangeName?.toLowerCase().includes('south') || ['rewari', 'mahendragarh', 'palwal', 'nuh'].includes(d.name.toLowerCase()))
          .map(buildDistrictNode),
      },
    ],
  };

  // Dynamically attach any custom districts
  const accountedDistrictIds = new Set([
    ...rangesWing.children!.flatMap((r) => (r.children || []).map((c) => c.id)),
  ]);
  const leftoverDistricts = store.districts.filter((d) => !accountedDistrictIds.has(d.id));
  if (leftoverDistricts.length > 0) {
    rangesWing.children!.push({
      id: 'rng_other',
      name: 'Other Districts / Units',
      code: 'RNG-OTH',
      type: 'RANGE',
      status: 'ACTIVE',
      details: 'Additional Districts & Jurisdictions',
      children: leftoverDistricts.map(buildDistrictNode),
    });
  }

  // 4. GRP HARYANA WING
  const grpHaryanaWing: HierarchyTreeNode = {
    id: 'wing_grp',
    name: 'GRP Haryana',
    code: 'GRP-WNG',
    type: 'OFFICE',
    status: 'ACTIVE',
    details: 'Government Railway Police Haryana & Commando',
    children: [
      {
        id: 'off_igp_railways',
        name: 'IGP Railways and Commando Office',
        code: 'IGP-RLY-CMD',
        type: 'OFFICE',
        status: 'ACTIVE',
        details: 'Supervisory Command • Railway Tracks, Stations & Commando Force',
        children: [
          {
            id: 'off_grp_hq',
            name: 'GRP',
            code: 'GRP-HQ',
            type: 'OFFICE',
            status: 'ACTIVE',
            details: 'Superintendent of Police, Railway Police Haryana (SP GRP)',
            children: [
              {
                id: 'grp_sub_divisions',
                name: 'Sub-Divisions',
                code: 'GRP-SUBDIV',
                type: 'WING',
                status: 'ACTIVE',
                details: 'Railway Police Sub-Divisions supervised by DSP GRP',
                children: [
                  {
                    id: 'grp_subdiv_amb',
                    name: 'Ambala Cantt',
                    code: 'SD-AMB',
                    type: 'OFFICE',
                    status: 'ACTIVE',
                    details: 'DSP Railway Sub-Division Ambala Cantt',
                  },
                  {
                    id: 'grp_subdiv_fbd',
                    name: 'Faridabad',
                    code: 'SD-FBD',
                    type: 'OFFICE',
                    status: 'ACTIVE',
                    details: 'DSP Railway Sub-Division Faridabad',
                  },
                  {
                    id: 'grp_subdiv_hsr',
                    name: 'Hisar',
                    code: 'SD-HSR',
                    type: 'OFFICE',
                    status: 'ACTIVE',
                    details: 'DSP Railway Sub-Division Hisar',
                  },
                ],
              },
              {
                id: 'grp_police_stations',
                name: 'Police Stations',
                code: 'GRP-STNS',
                type: 'WING',
                status: 'ACTIVE',
                details: '16 Territorial Government Railway Police Stations',
                children: [
                  { id: 'grps_amb_cantt', name: 'GRP AMBALA CANTT', code: 'GRPS-AMB', type: 'POLICE_STATION', status: 'ACTIVE', details: 'Railway Station Complex, Ambala Cantt' },
                  { id: 'grps_bahadurgarh', name: 'GRP BAHADURGARH', code: 'GRPS-BDG', type: 'POLICE_STATION', status: 'ACTIVE', details: 'Railway Station, Bahadurgarh' },
                  { id: 'grps_chandigarh', name: 'GRP CHANDIGARH', code: 'GRPS-CDG', type: 'POLICE_STATION', status: 'ACTIVE', details: 'Chandigarh Railway Junction' },
                  { id: 'grps_faridabad', name: 'GRP FARIDABAD', code: 'GRPS-FBD', type: 'POLICE_STATION', status: 'ACTIVE', details: 'Old Faridabad Railway Station' },
                  { id: 'grps_gurugram', name: 'GRP GURUGRAM', code: 'GRPS-GGN', type: 'POLICE_STATION', status: 'ACTIVE', details: 'Gurugram Railway Station' },
                  { id: 'grps_hisar', name: 'GRP HISAR', code: 'GRPS-HSR', type: 'POLICE_STATION', status: 'ACTIVE', details: 'Hisar Railway Junction' },
                  { id: 'grps_jagadhari', name: 'GRP JAGADHARI', code: 'GRPS-JGD', type: 'POLICE_STATION', status: 'ACTIVE', details: 'Jagadhari Workshop / Railway Station' },
                  { id: 'grps_jind', name: 'GRP JIND', code: 'GRPS-JND', type: 'POLICE_STATION', status: 'ACTIVE', details: 'Jind Railway Junction' },
                  { id: 'grps_kalka', name: 'GRP KALKA', code: 'GRPS-KLK', type: 'POLICE_STATION', status: 'ACTIVE', details: 'Kalka Heritage Railway Station' },
                  { id: 'grps_karnal', name: 'GRP KARNAL', code: 'GRPS-KNL', type: 'POLICE_STATION', status: 'ACTIVE', details: 'Karnal Railway Station' },
                  { id: 'grps_kurukshetra', name: 'GRP KURUKSHETRA', code: 'GRPS-KKR', type: 'POLICE_STATION', status: 'ACTIVE', details: 'Kurukshetra Railway Junction' },
                  { id: 'grps_panipat', name: 'GRP PANIPAT', code: 'GRPS-PNP', type: 'POLICE_STATION', status: 'ACTIVE', details: 'Panipat Railway Junction' },
                  { id: 'grps_rewari', name: 'GRP REWARI', code: 'GRPS-REW', type: 'POLICE_STATION', status: 'ACTIVE', details: 'Rewari Heritage Railway Junction' },
                  { id: 'grps_rohtak', name: 'GRP ROHTAK', code: 'GRPS-ROH', type: 'POLICE_STATION', status: 'ACTIVE', details: 'Rohtak Railway Junction' },
                  { id: 'grps_sirsa', name: 'GRP SIRSA', code: 'GRPS-SRS', type: 'POLICE_STATION', status: 'ACTIVE', details: 'Sirsa Railway Station' },
                  { id: 'grps_sonipat', name: 'GRP SONIPAT', code: 'GRPS-SNP', type: 'POLICE_STATION', status: 'ACTIVE', details: 'Sonipat Railway Station' },
                ],
              },
            ],
          },
        ],
      },
    ],
  };

  // 5. TRAINING CENTRES WING
  const trainingWing: HierarchyTreeNode = {
    id: 'wing_training',
    name: 'Training Academies & Colleges',
    code: 'TRG-WNG',
    type: 'OFFICE',
    status: 'ACTIVE',
    details: 'Police Academies, Colleges, and Recruit Training Centres',
    children: [
      { id: 'trg_cptr', name: 'CPT&R, Bhondsi', code: 'TRG-CPTR', type: 'OFFICE', status: 'ACTIVE', details: 'Centre for Police Training & Research, Bhondsi' },
      { id: 'trg_hpa', name: 'HPA, Madhuban', code: 'TRG-HPA', type: 'OFFICE', status: 'ACTIVE', details: 'Haryana Police Academy, Madhuban, Karnal' },
      { id: 'trg_ptc_sun', name: 'PTC, Sunaria', code: 'TRG-PTC', type: 'OFFICE', status: 'ACTIVE', details: 'Police Training College, Sunaria, Rohtak' },
      { id: 'trg_rtc_bhn', name: 'RTC, Bhondsi', code: 'TRG-RTC', type: 'OFFICE', status: 'ACTIVE', details: 'Recruit Training Centre, Bhondsi, Gurugram' },
      { id: 'trg_wptc_hsr', name: 'WOMEN PTC Hisar', code: 'TRG-WPTC', type: 'OFFICE', status: 'ACTIVE', details: 'Women Police Training Centre, Hisar' },
    ],
  };

  // 6. ARMED POLICE WING (HAP & IRB)
  const armedPoliceWing: HierarchyTreeNode = {
    id: 'wing_armed_police',
    name: 'Armed Police (HAP & IRB)',
    code: 'ARM-WNG',
    type: 'OFFICE',
    status: 'ACTIVE',
    details: 'Haryana Armed Police (HAP) and India Reserve Battalions (IRB)',
    children: [
      {
        id: 'arm_ig_hap',
        name: 'IG HAP (Haryana Armed Police)',
        code: 'HAP-HQ',
        type: 'OFFICE',
        status: 'ACTIVE',
        details: 'Inspector General of Police, HAP Madhuban',
        children: [
          { id: 'hap_bn_1', name: '1st Bn HAP', code: 'HAP-1BN', type: 'BATTALION', status: 'ACTIVE', details: 'Headquarters: Ambala City' },
          { id: 'hap_bn_2', name: '2nd Bn HAP', code: 'HAP-2BN', type: 'BATTALION', status: 'ACTIVE', details: 'Headquarters: Madhuban, Karnal' },
          { id: 'hap_bn_3', name: '3rd Bn HAP', code: 'HAP-3BN', type: 'BATTALION', status: 'ACTIVE', details: 'Headquarters: Hisar' },
          { id: 'hap_bn_4', name: '4th Bn HAP', code: 'HAP-4BN', type: 'BATTALION', status: 'ACTIVE', details: 'Headquarters: Madhuban, Karnal' },
          { id: 'hap_bn_5', name: '5th Bn HAP', code: 'HAP-5BN', type: 'BATTALION', status: 'ACTIVE', details: 'Headquarters: Madhuban, Karnal' },
          { id: 'hap_bn_durga', name: 'Durga Bn HAP', code: 'HAP-DURGA', type: 'BATTALION', status: 'ACTIVE', details: 'Women Armed Battalion, Madhuban' },
        ],
      },
      {
        id: 'arm_ig_irb',
        name: 'IG IRB (India Reserve Battalion)',
        code: 'IRB-HQ',
        type: 'OFFICE',
        status: 'ACTIVE',
        details: 'Inspector General of Police, IRB Headquarters',
        children: [
          { id: 'irb_bn_1', name: '1st Bn IRB', code: 'IRB-1BN', type: 'BATTALION', status: 'ACTIVE', details: 'Headquarters: Bhondsi, Gurugram' },
          { id: 'irb_bn_2', name: '2nd Bn IRB', code: 'IRB-2BN', type: 'BATTALION', status: 'ACTIVE', details: 'Headquarters: Bhondsi, Gurugram' },
          { id: 'irb_bn_3', name: '3rd Bn IRB', code: 'IRB-3BN', type: 'BATTALION', status: 'ACTIVE', details: 'Headquarters: Sunaria, Rohtak' },
          { id: 'irb_bn_4', name: '4th Bn IRB', code: 'IRB-4BN', type: 'BATTALION', status: 'ACTIVE', details: 'Headquarters: Manebhadar' },
        ],
      },
    ],
  };

  // 7. FORENSIC LABS WING (FSL & RFSL)
  const forensicWing: HierarchyTreeNode = {
    id: 'wing_forensic',
    name: 'Forensic Science Laboratories (FSL / RFSL)',
    code: 'FSL-WNG',
    type: 'OFFICE',
    status: 'ACTIVE',
    details: 'Forensic Science Laboratories (State & Regional)',
    children: [
      { id: 'fsl_madhuban', name: 'FSL Madhuban', code: 'FSL-MDB', type: 'UNIT', status: 'ACTIVE', details: 'State Forensic Science Laboratory, Madhuban' },
      { id: 'fsl_cyber_pkl', name: 'Cyber Lab Panchkula', code: 'FSL-CYB', type: 'UNIT', status: 'ACTIVE', details: 'Digital Forensics & Audio-Visual Cyber Crime Analysis' },
      { id: 'rfsl_ggn', name: 'RFSL Gurugram', code: 'RFSL-GGN', type: 'UNIT', status: 'ACTIVE', details: 'Regional Forensic Science Lab, Bhondsi, Gurugram' },
      { id: 'rfsl_hsr', name: 'RFSL Hisar', code: 'RFSL-HSR', type: 'UNIT', status: 'ACTIVE', details: 'Regional Forensic Science Lab, Hisar' },
      { id: 'rfsl_pkl', name: 'RFSL Panchkula', code: 'RFSL-PKL', type: 'UNIT', status: 'ACTIVE', details: 'Regional Forensic Science Lab, Panchkula' },
      { id: 'rfsl_roh', name: 'RFSL Rohtak', code: 'RFSL-ROH', type: 'UNIT', status: 'ACTIVE', details: 'Regional Forensic Science Lab, Sunaria, Rohtak' },
    ],
  };

  // 8. SPECIALISED UNITS WING
  const specialisedUnitsWing: HierarchyTreeNode = {
    id: 'wing_specialised',
    name: 'Specialized Directorates & Task Forces',
    code: 'SPEC-WNG',
    type: 'UNIT',
    status: 'ACTIVE',
    details: 'Specialized State Intelligence, Narcotics, Cyber, and Law Enforcement Units',
    children: [
      { id: 'spc_ats', name: 'ATS (Anti-Terrorist Squad)', code: 'ATS-HQ', type: 'UNIT', status: 'ACTIVE', details: 'Anti-Terrorist Squad, Haryana' },
      { id: 'spc_cid', name: 'CID (Criminal Investigation Dept)', code: 'CID-HQ', type: 'UNIT', status: 'ACTIVE', details: 'Criminal Investigation Department, Panchkula' },
      { id: 'spc_cmd', name: 'Commando Force', code: 'CMD-HQ', type: 'UNIT', status: 'ACTIVE', details: 'Haryana Police Commando Force' },
      { id: 'spc_cyb', name: 'Cyber Crime Police Directorate', code: 'CYB-HQ', type: 'UNIT', status: 'ACTIVE', details: 'State Cyber Crime Police Station / Directorate' },
      { id: 'spc_erss', name: 'ERSS Dial 112 Wing', code: 'ERSS-112', type: 'UNIT', status: 'ACTIVE', details: 'Emergency Response Support System (Haryana Dial 112)' },
      { id: 'spc_hsdrf', name: 'HSDRF (Disaster Response)', code: 'HSDRF-HQ', type: 'UNIT', status: 'ACTIVE', details: 'Haryana State Disaster Response Force' },
      { id: 'spc_hsenb', name: 'HSEnB (State Enforcement Bureau)', code: 'HSENB-HQ', type: 'UNIT', status: 'ACTIVE', details: 'Haryana State Enforcement Bureau' },
      { id: 'spc_hsncb', name: 'HSNCB (Narcotics Control Bureau)', code: 'HSNCB-HQ', type: 'UNIT', status: 'ACTIVE', details: 'Haryana State Narcotics Control Bureau' },
      { id: 'spc_scb', name: 'SCB (State Crime Branch)', code: 'SCB-HQ', type: 'UNIT', status: 'ACTIVE', details: 'State Crime Branch, Haryana' },
      { id: 'spc_scrb', name: 'SCRB (State Crime Records Bureau)', code: 'SCRB-HQ', type: 'UNIT', status: 'ACTIVE', details: 'State Crime Records Bureau, Madhuban' },
      { id: 'spc_stf', name: 'STF (Special Task Force)', code: 'STF-HQ', type: 'UNIT', status: 'ACTIVE', details: 'Special Task Force (Organized Crime)' },
      { id: 'spc_tel', name: 'Police Telecommunications Wing', code: 'TEL-HQ', type: 'UNIT', status: 'ACTIVE', details: 'Police Telecommunications Wing, Panchkula' },
      { id: 'spc_trf', name: 'Traffic & Highways Police Wing', code: 'TRF-HWY', type: 'UNIT', status: 'ACTIVE', details: 'Traffic & Highways Police Wing, Karnal' },
    ],
  };

  // 9. DEPUTATION UNITS WING
  const deputationUnitsWing: HierarchyTreeNode = {
    id: 'wing_deputation',
    name: 'Deputation Units (Central & State)',
    code: 'DEP-WNG',
    type: 'UNIT',
    status: 'ACTIVE',
    details: 'Central and State Deputation Police Units',
    children: [
      { id: 'dep_cbi', name: 'CBI Deputation Wing', code: 'CBI-DEP', type: 'UNIT', status: 'ACTIVE', details: 'Central Bureau of Investigation' },
      { id: 'dep_frro', name: 'FRRO Deputation Wing', code: 'FRRO-DEP', type: 'UNIT', status: 'ACTIVE', details: 'Foreigners Regional Registration Office' },
      { id: 'dep_hhrc', name: 'HHRC Police Wing', code: 'HHRC-DEP', type: 'UNIT', status: 'ACTIVE', details: 'Haryana Human Rights Commission' },
      { id: 'dep_hg', name: 'Home Guards & Civil Defence', code: 'HG-DEP', type: 'UNIT', status: 'ACTIVE', details: 'Haryana Home Guards & Civil Defence' },
      { id: 'dep_lok', name: 'Lokayukta Police Wing', code: 'LOK-DEP', type: 'UNIT', status: 'ACTIVE', details: 'Lokayukta Haryana Police Wing' },
      { id: 'dep_min', name: 'Mining Enforcement Police Wing', code: 'MIN-DEP', type: 'UNIT', status: 'ACTIVE', details: 'Mines & Geology Police Enforcement Wing' },
      { id: 'dep_prs', name: 'Prisons Department Deputation', code: 'PRS-DEP', type: 'UNIT', status: 'ACTIVE', details: 'Jail & Prison Department Deputation' },
      { id: 'dep_spca', name: 'State Police Complaint Authority (SPCA)', code: 'SPCA-DEP', type: 'UNIT', status: 'ACTIVE', details: 'State Police Complaint Authority' },
      { id: 'dep_svacb', name: 'State Vigilance & ACB Haryana', code: 'ACB-DEP', type: 'UNIT', status: 'ACTIVE', details: 'State Vigilance & Anti-Corruption Bureau Haryana' },
      { id: 'dep_trn', name: 'Transport Department Enforcement Wing', code: 'TRN-DEP', type: 'UNIT', status: 'ACTIVE', details: 'State Transport Enforcement Wing' },
    ],
  };

  // Assemble full tree under root State
  stateNode.children = [
    phqOfficesWing,
    commissioneratesWing,
    rangesWing,
    grpHaryanaWing,
    trainingWing,
    armedPoliceWing,
    forensicWing,
    specialisedUnitsWing,
    deputationUnitsWing,
  ];

  return [stateNode];
}

/* =========================================================================
   DYNAMIC STATS CALCULATION (Zero Hardcoding)
   ========================================================================= */

export async function getLocationStatistics(activeAccountCounts?: {
  perStation?: Record<string, number>;
  perDistrict?: Record<string, number>;
  totalAccounts?: number;
}): Promise<LocationStatistics> {
  const store = await readLocationStore();

  const districtsUnderRange: Record<string, number> = {};
  for (const dst of store.districts) {
    districtsUnderRange[dst.rangeName] = (districtsUnderRange[dst.rangeName] || 0) + 1;
  }

  const stationsUnderDistrict: Record<string, number> = {};
  for (const ps of store.policeStations) {
    stationsUnderDistrict[ps.districtName] = (stationsUnderDistrict[ps.districtName] || 0) + 1;
  }

  const officesUnderDistrict: Record<string, number> = {};
  for (const off of store.offices) {
    const key = off.districtName || 'State/Range Level';
    officesUnderDistrict[key] = (officesUnderDistrict[key] || 0) + 1;
  }

  const unitsUnderDistrict: Record<string, number> = {};
  for (const unt of store.specializedUnits) {
    const key = unt.districtName || 'State/Range Level';
    unitsUnderDistrict[key] = (unitsUnderDistrict[key] || 0) + 1;
  }

  return {
    totalStates: store.states.length,
    totalRanges: store.ranges.length,
    totalDistricts: store.districts.length,
    totalOffices: store.offices.length,
    totalPoliceStations: store.policeStations.length,
    totalSpecializedUnits: store.specializedUnits.length,
    totalActiveAccounts: activeAccountCounts?.totalAccounts || 0,
    districtsUnderRange,
    stationsUnderDistrict,
    officesUnderDistrict,
    unitsUnderDistrict,
    accountsPerStation: activeAccountCounts?.perStation || {},
    accountsPerDistrict: activeAccountCounts?.perDistrict || {},
  };
}
