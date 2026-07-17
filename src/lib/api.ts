import { getActiveApiProfile, getCustomProviderDefinition } from './apiProfiles'
import { CHATGPT2API_ASYNC_PROVIDER, detectChatGpt2ApiAsync } from './chatGpt2ApiAsync'
import { callFalAiImageApi } from './falAiImageApi'
import { callOpenAICompatibleImageApi } from './openaiCompatibleImageApi'
import type { CallApiOptions, CallApiResult } from './imageApiShared'

export type { CallApiOptions, CallApiResult } from './imageApiShared'
export { normalizeBaseUrl } from './devProxy'

export async function callImageApi(opts: CallApiOptions): Promise<CallApiResult> {
  const profile = getActiveApiProfile(opts.settings)
  if (profile.provider === 'fal') return callFalAiImageApi(opts, profile)

  const customProvider = getCustomProviderDefinition(opts.settings, profile.provider)
  if (customProvider) {
    const submit = opts.inputImageDataUrls.length > 0 && customProvider.editSubmit
      ? customProvider.editSubmit
      : customProvider.submit
    const supportsAsync = Boolean(submit.taskIdPath && customProvider.poll)
    if (profile.requestMode === 'async' && !supportsAsync) {
      throw new Error('当前服务商没有配置异步任务查询接口，请改用「自动」或「同步」。')
    }
    if (profile.requestMode === 'sync' && supportsAsync) {
      throw new Error('当前服务商 Manifest 仅配置了异步任务，请改用「自动」或「异步」。')
    }
    return callOpenAICompatibleImageApi(opts, profile, customProvider)
  }

  if (profile.requestMode === 'sync') return callOpenAICompatibleImageApi(opts, profile)
  if (profile.apiMode !== 'images') {
    if (profile.requestMode === 'async') throw new Error('当前异步任务适配仅支持 Images API。')
    return callOpenAICompatibleImageApi(opts, profile)
  }

  const useAsync = profile.requestMode === 'async' || await detectChatGpt2ApiAsync(profile)
  if (!useAsync) return callOpenAICompatibleImageApi(opts, profile)

  let enqueued = false
  const asyncOpts: CallApiOptions = {
    ...opts,
    onCustomTaskEnqueued: (request) => {
      enqueued = true
      opts.onCustomTaskEnqueued?.(request)
    },
  }
  try {
    return await callOpenAICompatibleImageApi(asyncOpts, profile, CHATGPT2API_ASYNC_PROVIDER)
  } catch (err) {
    const status = err && typeof err === 'object' && 'status' in err ? Number(err.status) : 0
    if (profile.requestMode === 'auto' && !enqueued && (status === 404 || status === 405)) {
      return callOpenAICompatibleImageApi(opts, profile)
    }
    if (profile.requestMode === 'async' && !enqueued && (status === 404 || status === 405)) {
      throw new Error('当前服务商不支持 ChatGPT2API 异步任务接口，请改用「自动」或「同步」。')
    }
    throw err
  }
}
