// The lists every install starts with: the drawn vehicle types, fluids and receipt categories.
// Shared by the fake seed and the production first-run setup. Departments and locations are the
// fleet's own, so a new install starts without them.
import type { PrismaClient, VehicleCategory } from '@prisma/client';
import type { VehicleTypeCode } from '@fleet-hub/shared';

const vehicleTypes: {
  code: VehicleTypeCode;
  nameEn: string;
  nameHe: string;
  category: VehicleCategory;
}[] = [
  {
    code: 'tracked_excavator',
    nameEn: 'Tracked excavator',
    nameHe: 'מחפר זחלי',
    category: 'EQUIPMENT',
  },
  {
    code: 'wheeled_excavator',
    nameEn: 'Wheeled excavator',
    nameHe: 'מחפר גלגלי',
    category: 'EQUIPMENT',
  },
  { code: 'backhoe_loader', nameEn: 'Backhoe loader', nameHe: 'מחפרון', category: 'EQUIPMENT' },
  { code: 'wheel_loader', nameEn: 'Wheel loader', nameHe: 'שופל', category: 'EQUIPMENT' },
  { code: 'skid_steer', nameEn: 'Skid-steer', nameHe: 'בובקט', category: 'EQUIPMENT' },
  { code: 'tractor', nameEn: 'Tractor', nameHe: 'טרקטור', category: 'EQUIPMENT' },
  { code: 'forklift', nameEn: 'Forklift', nameHe: 'מלגזה', category: 'EQUIPMENT' },
  { code: 'truck', nameEn: 'Truck', nameHe: 'משאית', category: 'ROAD' },
  { code: 'pickup', nameEn: 'Pickup', nameHe: 'טנדר', category: 'ROAD' },
  { code: 'van', nameEn: 'Van', nameHe: 'מסחרית', category: 'ROAD' },
  { code: 'trailer', nameEn: 'Equipment trailer', nameHe: 'נגרר ציוד', category: 'ROAD' },
  { code: 'compressor', nameEn: 'Mobile compressor', nameHe: 'מדחס נייד', category: 'EQUIPMENT' },
  { code: 'other', nameEn: 'Other', nameHe: 'אחר', category: 'EQUIPMENT' },
];

const fluidTypes = [
  { code: 'engine_oil', nameEn: 'Engine oil', nameHe: 'שמן מנוע' },
  { code: 'hydraulic_oil', nameEn: 'Hydraulic oil', nameHe: 'שמן הידראולי' },
  { code: 'coolant', nameEn: 'Coolant', nameHe: 'נוזל קירור' },
  { code: 'brake_fluid', nameEn: 'Brake fluid', nameHe: 'נוזל בלמים' },
  { code: 'adblue', nameEn: 'AdBlue', nameHe: 'AdBlue' },
  { code: 'grease', nameEn: 'Grease', nameHe: 'גריז' },
];

export const receiptCategories = [
  { code: 'fuel', nameEn: 'Fuel', nameHe: 'דלק' },
  { code: 'service', nameEn: 'Service', nameHe: 'טיפול' },
  { code: 'parts', nameEn: 'Parts', nameHe: 'חלקים' },
  { code: 'tools', nameEn: 'Tools', nameHe: 'כלים' },
  { code: 'tires', nameEn: 'Tires', nameHe: 'צמיגים' },
  { code: 'inspection', nameEn: 'Inspection', nameHe: 'בדיקה' },
  { code: 'insurance', nameEn: 'Insurance', nameHe: 'ביטוח' },
  { code: 'other', nameEn: 'Other', nameHe: 'אחר' },
];

/** Adds whichever of the base lists' entries are missing (by code); never changes existing ones. */
export async function addBaseLists(db: PrismaClient) {
  await db.vehicleType.createMany({
    data: vehicleTypes.map((t, i) => ({
      ...t,
      usageUnit: t.category === 'ROAD' ? 'KM' : 'HOURS',
      defaultHasStartCode: t.code === 'pickup',
      sortOrder: i,
    })),
    skipDuplicates: true,
  });
  await db.fluidType.createMany({
    data: fluidTypes.map((d, i) => ({ ...d, sortOrder: i })),
    skipDuplicates: true,
  });
  await db.receiptCategory.createMany({
    data: receiptCategories.map((d, i) => ({ ...d, sortOrder: i })),
    skipDuplicates: true,
  });
}
