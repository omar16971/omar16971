import type { DeviceDescriptor } from '@hotel-panel/shared'
import type { PropertyConfig } from '../config/property'
import type { VendorAdapter } from './adapter'
import { MockAdapter } from './mock'

/** The only place an adapter name becomes a class. A vendor adapter is added here. */
export function createAdapter(cfg: PropertyConfig, descriptors: DeviceDescriptor[]): VendorAdapter {
  switch (cfg.adapter) {
    case 'mock':
      return new MockAdapter(descriptors)
    default:
      throw new Error(`unknown vendor adapter "${cfg.adapter}"`)
  }
}
