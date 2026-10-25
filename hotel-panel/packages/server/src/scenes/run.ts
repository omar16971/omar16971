import type { SceneDef } from '../config/property'
import type { StateStore } from '../state/store'

export interface SceneResult {
  sceneId: string
  /** Device ids whose command could not be sent. Others were sent, not confirmed. */
  failed: string[]
}

/**
 * Steps go out together; one failing does not stop the rest. A scene is a set of
 * requests, so partial failure is a normal result, not an exception.
 */
export async function runScene(store: StateStore, room: string, scene: SceneDef): Promise<SceneResult> {
  const results = await Promise.allSettled(scene.steps.map((s) => store.command(room, s.deviceId, s.command)))
  const failed = scene.steps.filter((_, i) => results[i]?.status === 'rejected').map((s) => s.deviceId)
  return { sceneId: scene.id, failed }
}
