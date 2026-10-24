/** A digital asset is in service or set aside by hand. Whether it is issued is read from its assignments. */
export const DIGITAL_ASSET_STATUSES = ['in_service', 'inactive'] as const
export type DigitalAssetStatus = (typeof DIGITAL_ASSET_STATUSES)[number]
