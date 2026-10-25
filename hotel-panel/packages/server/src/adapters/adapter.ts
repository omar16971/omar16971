import type { Command, DeviceDescriptor, DeviceState } from '@hotel-panel/shared'

/**
 * The boundary. Nothing above this file may know which vendor is behind it.
 * Vendor ids never leave an implementation; `send` does not report success.
 */
export interface VendorAdapter {
  connect(): Promise<void>
  disconnect(): Promise<void>
  /** Everything the vendor exposes, mapped to our model. Called once at boot. */
  discover(): Promise<DeviceDescriptor[]>
  /** Fire-and-forget. Confirmation arrives through onState, not a return value. */
  send(deviceId: string, command: Command): Promise<void>
  /** Push. Poll inside the adapter and synthesise this if the vendor has no push. */
  onState(handler: (deviceId: string, state: DeviceState) => void): void
  onConnectionChange(handler: (up: boolean) => void): void
}
