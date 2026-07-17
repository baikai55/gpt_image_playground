import { describe, expect, it, vi } from 'vitest'
import type { ApiProfile } from '../types'
import { fetchOpenAIModels, parseOpenAIModelIds } from './openaiModels'

const PROFILE: ApiProfile = {
  id: 'custom-openai',
  name: '自定义服务商',
  provider: 'openai',
  baseUrl: 'https://api.example.com/v1',
  apiKey: 'test-key',
  model: 'gpt-image-2',
  timeout: 300,
  apiMode: 'images',
  requestMode: 'auto',
  codexCli: false,
  apiProxy: false,
}

describe('OpenAI model list', () => {
  it('parses model ids and removes invalid duplicates', () => {
    expect(parseOpenAIModelIds({
      data: [
        { id: 'gpt-image-2' },
        { id: ' gpt-4.1 ' },
        { id: 'gpt-image-2' },
        'custom-image-model',
        { name: 'missing-id' },
      ],
    })).toEqual(['gpt-image-2', 'gpt-4.1', 'custom-image-model'])
  })

  it('rejects non-OpenAI responses and empty model lists', () => {
    expect(() => parseOpenAIModelIds({ models: [] })).toThrow('不符合 OpenAI 协议')
    expect(() => parseOpenAIModelIds({ data: [] })).toThrow('未返回可用模型')
  })

  it('fetches /models with the current bearer key', async () => {
    const fetchFn = vi.fn(async () => new Response(JSON.stringify({
      object: 'list',
      data: [{ id: 'gpt-image-2' }, { id: 'gpt-4.1' }],
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }))

    await expect(fetchOpenAIModels(PROFILE, { fetchFn, proxyConfig: null }))
      .resolves.toEqual(['gpt-image-2', 'gpt-4.1'])
    expect(fetchFn).toHaveBeenCalledWith('https://api.example.com/v1/models', {
      method: 'GET',
      headers: {
        Accept: 'application/json',
        Authorization: 'Bearer test-key',
      },
      cache: 'no-store',
      signal: undefined,
    })
  })

  it('uses the same-origin proxy path when enabled', async () => {
    const fetchFn = vi.fn(async () => new Response(JSON.stringify({ data: [{ id: 'model-1' }] })))

    await fetchOpenAIModels({ ...PROFILE, baseUrl: '', apiProxy: true }, {
      fetchFn,
      proxyConfig: {
        enabled: true,
        prefix: '/api-proxy',
        target: 'https://api.example.com/v1',
        changeOrigin: true,
        secure: true,
      },
    })

    expect(fetchFn).toHaveBeenCalledWith('/api-proxy/models', expect.objectContaining({ method: 'GET' }))
  })

  it('shows the API error message and a browser CORS hint', async () => {
    await expect(fetchOpenAIModels(PROFILE, {
      fetchFn: async () => new Response(JSON.stringify({ error: { message: 'invalid key' } }), { status: 401 }),
      proxyConfig: null,
    })).rejects.toThrow('获取模型列表失败：invalid key')

    await expect(fetchOpenAIModels(PROFILE, {
      fetchFn: async () => { throw new TypeError('Failed to fetch') },
      proxyConfig: null,
    })).rejects.toThrow('跨域访问 /models')
  })
})
