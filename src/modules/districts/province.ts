import { Province } from '../../generated/prisma/enums.js';

/** Display names, matching the web app. */
export const PROVINCE_NAMES: Record<Province, string> = {
  [Province.WESTERN]: 'Western',
  [Province.CENTRAL]: 'Central',
  [Province.SOUTHERN]: 'Southern',
  [Province.NORTHERN]: 'Northern',
  [Province.EASTERN]: 'Eastern',
  [Province.NORTH_WESTERN]: 'North Western',
  [Province.NORTH_CENTRAL]: 'North Central',
  [Province.UVA]: 'Uva',
  [Province.SABARAGAMUWA]: 'Sabaragamuwa',
};
