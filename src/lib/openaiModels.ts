import type { ApiProfile } from '../types'
import { buildApiUrl, readClientDevProxyConfig, shouldUseApiProxy, type DevProxyConfig } from './devProxy'
import { getApiErrorMessage } from './imageApiShared'

interface FetchOpenAIModelsOptions {
  fetchFn?: typeof fetch
  proxyConfig?: DevProxyConfig | null
  signal?: AbortSignal
}

export function parseOpenAIModelIds(input: unknown): string[] {
  if (!input || typeof input !== 'object') {
    throw new Error('模型列表响应格式不符合 OpenAI 协议')
  }

  const data = (input as Record<string, unknown>).data
  if (!Array.isArray(data)) {
    throw new Error('模型列表响应格式不符合 OpenAI 协议')
  }

  const ids = data
    .map((item) => {
      if (typeof item === 'string') return item.trim()
      if (!item || typeof item !== 'object') return ''
      const id = (item as Record<string, unknown>).id
      return typeof id === 'string' ? id.trim() : ''
    })
    .filter(Boolean)

  const uniqueIds = [...new Set(ids)]
  if (!uniqueIds.length) throw new Error('接口未返回可用模型')
  return uniqueIds
}

export async function fetchOpenAIModels(
  profile: ApiProfile,
  options: FetchOpenAIModelsOptions = {},
): Promise<string[]> {
  const proxyConfig = options.proxyConfig === undefined
    ? readClientDevProxyConfig()
    : options.proxyConfig
  const useApiProxy = shouldUseApiProxy(profile.apiProxy, proxyConfig)
  if (!profile.baseUrl.trim() && !useApiProxy) throw new Error('请先填写 API URL')

  const headers: Record<string, string> = { Accept: 'application/json' }
  if (profile.apiKey.trim()) headers.Authorization = `Bearer ${profile.apiKey.trim()}`

  let response: Response
  try {
    response = await (options.fetchFn ?? fetch)(
      buildApiUrl(profile.baseUrl, 'models', proxyConfig, useApiProxy),
      {
        method: 'GET',
        headers,
        cache: 'no-store',
        signal: options.signal,
      },
    )
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') throw err
    if (err instanceof TypeError) {
      throw new Error('模型列表请求失败，可能是服务商未允许浏览器跨域访问 /models')
    }
    throw err
  }

  if (!response.ok) {
    throw new Error(`获取模型列表失败：${await getApiErrorMessage(response)}`)
  }

  try {
    return parseOpenAIModelIds(await response.json())
  } catch (err) {
    if (err instanceof SyntaxError) throw new Error('模型列表响应不是有效的 JSON')
    throw err
  }
}
