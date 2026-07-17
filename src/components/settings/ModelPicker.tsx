import { useEffect, useRef, useState } from 'react'
import type { ApiProfile } from '../../types'
import { fetchOpenAIModels } from '../../lib/openaiModels'
import { RefreshIcon } from '../icons'

interface ModelPickerProps {
  profile: ApiProfile
  onSelect: (model: string) => void
  onModelsChange: (models: string[], fetchedAt: number) => void
}

export default function ModelPicker({ profile, onSelect, onModelsChange }: ModelPickerProps) {
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isOpen, setIsOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [activeIndex, setActiveIndex] = useState(-1)
  const rootRef = useRef<HTMLDivElement>(null)
  const requestRef = useRef<AbortController | null>(null)
  const listId = `model-list-${profile.id}`
  const configKey = `${profile.baseUrl}\n${profile.apiKey}\n${profile.apiProxy}`
  const models = profile.availableModels ?? []
  const fetchedAtLabel = profile.availableModelsFetchedAt
    ? new Date(profile.availableModelsFetchedAt).toLocaleString()
    : ''
  const visibleModels = query.trim()
    ? models.filter((model) => model.toLowerCase().includes(query.trim().toLowerCase()))
    : models

  useEffect(() => {
    requestRef.current?.abort()
    setError(null)
    setIsOpen(false)
    setQuery('')
    setActiveIndex(-1)
  }, [profile.id, configKey])

  useEffect(() => () => requestRef.current?.abort(), [])

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (rootRef.current?.contains(event.target as Node)) return
      setIsOpen(false)
      setQuery('')
      setActiveIndex(-1)
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const selectModel = (model: string) => {
    onSelect(model)
    setQuery('')
    setIsOpen(false)
    setActiveIndex(-1)
  }

  const loadModels = async () => {
    requestRef.current?.abort()
    const controller = new AbortController()
    requestRef.current = controller
    setIsLoading(true)
    setError(null)

    try {
      const nextModels = await fetchOpenAIModels(profile, { signal: controller.signal })
      onModelsChange(nextModels, Date.now())
      setIsOpen(true)
      setQuery('')
      setActiveIndex(-1)
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') return
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      if (requestRef.current === controller) {
        requestRef.current = null
        setIsLoading(false)
      }
    }
  }

  return (
    <div ref={rootRef} className="relative">
      <div className="relative">
        <input
          value={query}
          onChange={(event) => {
            setQuery(event.target.value)
            setIsOpen(models.length > 0)
            setActiveIndex(-1)
          }}
          onFocus={() => {
            if (isLoading) return
            if (models.length) {
              setQuery('')
              setIsOpen(true)
            }
          }}
          onKeyDown={(event) => {
            if (event.key === 'Escape') {
              setIsOpen(false)
              setQuery('')
              setActiveIndex(-1)
              return
            }
            if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp' && event.key !== 'Enter') return
            if (!isOpen && models.length) {
              event.preventDefault()
              setIsOpen(true)
              setQuery('')
              setActiveIndex(0)
              return
            }
            if (!isOpen || !visibleModels.length) return
            if (event.key === 'Enter' && activeIndex >= 0) {
              event.preventDefault()
              selectModel(visibleModels[activeIndex])
              return
            }
            if (event.key === 'Enter') return
            event.preventDefault()
            setActiveIndex((current) => event.key === 'ArrowDown'
              ? Math.min(current + 1, visibleModels.length - 1)
              : Math.max(current - 1, 0))
          }}
          type="text"
          placeholder={models.length ? `搜索已保存的 ${models.length} 个模型` : '点击右侧按钮获取模型'}
          role="combobox"
          aria-autocomplete="list"
          aria-expanded={isOpen}
          aria-controls={listId}
          className="w-full rounded-xl border border-gray-200/70 bg-white/60 px-3 py-2.5 pr-10 text-sm text-gray-700 outline-none transition focus:border-blue-300 dark:border-white/[0.08] dark:bg-white/[0.03] dark:text-gray-200 dark:focus:border-blue-500/50"
        />
        <button
          type="button"
          onClick={() => void loadModels()}
          disabled={isLoading}
          title={models.length ? '刷新可用模型列表' : '获取可用模型列表'}
          aria-label={models.length ? '刷新可用模型列表' : '获取可用模型列表'}
          className="absolute right-2 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-md text-gray-400 transition hover:bg-gray-100 hover:text-blue-500 disabled:cursor-wait disabled:opacity-50 dark:hover:bg-white/[0.06] dark:hover:text-blue-400"
        >
          <RefreshIcon className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
        </button>
      </div>
      {isOpen && models.length > 0 && (
        <div
          id={listId}
          role="listbox"
          className="absolute z-50 mt-1.5 max-h-56 w-full overflow-y-auto rounded-xl border border-gray-200/70 bg-white/95 p-1.5 shadow-[0_8px_30px_rgb(0,0,0,0.14)] ring-1 ring-black/5 backdrop-blur-xl custom-scrollbar dark:border-white/[0.08] dark:bg-gray-900/95 dark:ring-white/10"
        >
          {visibleModels.length > 0 ? visibleModels.map((model, index) => (
            <button
              key={model}
              type="button"
              role="option"
              aria-selected={model === profile.model}
              onMouseDown={(event) => event.preventDefault()}
              onMouseEnter={() => setActiveIndex(index)}
              onClick={() => selectModel(model)}
              className={`block w-full rounded-lg px-2.5 py-2 text-left text-sm transition ${activeIndex === index || model === profile.model ? 'bg-blue-50 text-blue-700 dark:bg-blue-500/10 dark:text-blue-300' : 'text-gray-700 hover:bg-gray-50 dark:text-gray-200 dark:hover:bg-white/[0.05]'}`}
            >
              <span className="block truncate">{model}</span>
            </button>
          )) : (
            <div className="px-2.5 py-3 text-center text-xs text-gray-500 dark:text-gray-400">没有匹配模型</div>
          )}
        </div>
      )}
      {isLoading && (
        <div className="mt-1.5 text-xs text-gray-500 dark:text-gray-400">正在获取模型...</div>
      )}
      {!isLoading && error && (
        <div data-selectable-text className="mt-1.5 text-xs text-red-500 dark:text-red-400">{error}</div>
      )}
      {!isLoading && !error && models.length > 0 && (
        <div className="mt-1.5 text-xs text-emerald-600 dark:text-emerald-400">
          已保存 {models.length} 个模型{fetchedAtLabel ? `，更新于 ${fetchedAtLabel}` : ''}
        </div>
      )}
    </div>
  )
}
