import type { ApiProfile, CustomProviderDefinition } from '../types'
import { normalizeBaseUrl, shouldUseApiProxy } from './devProxy'

const capabilityCache = new Map<string, { supported: boolean; expiresAt: number }>()

export const CHATGPT2API_ASYNC_PROVIDER: CustomProviderDefinition = {
  id: 'builtin-chatgpt2api-async',
  name: 'ChatGPT2API 异步任务',
  template: 'http-image',
  submit: {
    path: '/api/image-tasks/generations',
    method: 'POST',
    contentType: 'json',
    body: {
      client_task_id: '$request.id',
      prompt: '$prompt',
      model: '$profile.model',
      n: '$params.n',
      size: '$params.size',
      quality: '$params.quality',
    },
    taskIdPath: 'id',
  },
  editSubmit: {
    path: '/api/image-tasks/edits',
    method: 'POST',
    contentType: 'multipart',
    body: {
      client_task_id: '$request.id',
      prompt: '$prompt',
      model: '$profile.model',
      n: '$params.n',
      size: '$params.size',
      quality: '$params.quality',
    },
    files: [
      { field: 'image', source: 'inputImages', array: true },
      { field: 'mask', source: 'mask' },
    ],
    taskIdPath: 'id',
  },
  poll: {
    path: '/api/image-tasks?ids={task_id}',
    method: 'GET',
    intervalSeconds: 3,
    statusPath: 'items.0.status',
    successValues: ['success'],
    failureValues: ['error'],
    errorPath: 'items.0.error',
    result: {
      imageUrlPaths: ['items.0.data.*.url'],
      b64JsonPaths: ['items.0.data.*.b64_json'],
    },
  },
}

export function getChatGpt2ApiOrigin(baseUrl: string): string | null {
  const normalized = normalizeBaseUrl(baseUrl)
  if (!normalized) return null
  try {
    return new URL(normalized).origin
  } catch {
    return null
  }
}

export async function detectChatGpt2ApiAsync(profile: ApiProfile): Promise<boolean> {
  if (profile.apiMode !== 'images') return false
  const origin = getChatGpt2ApiOrigin(profile.baseUrl)
  if (!origin) return false
  if (new URL(origin).hostname === 'api.openai.com' || shouldUseApiProxy(profile.apiProxy)) return false

  const cached = capabilityCache.get(origin)
  if (cached && cached.expiresAt > Date.now()) return cached.supported

  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), 5_000)
  try {
    const response = await fetch(`${origin}/openapi.json`, {
      headers: { Accept: 'application/json' },
      cache: 'no-store',
      signal: controller.signal,
    })
    if (!response.ok) {
      capabilityCache.set(origin, { supported: false, expiresAt: Date.now() + 5 * 60_000 })
      return false
    }
    const payload = await response.clone().json() as { paths?: Record<string, Record<string, unknown>> }
    const supported = Boolean(
      payload.paths?.['/api/image-tasks/generations']?.post &&
      payload.paths?.['/api/image-tasks']?.get,
    )
    capabilityCache.set(origin, { supported, expiresAt: Date.now() + 5 * 60_000 })
    return supported
  } catch {
    return false
  } finally {
    clearTimeout(timeoutId)
  }
}

export function clearChatGpt2ApiAsyncCapabilityCache() {
  capabilityCache.clear()
}
