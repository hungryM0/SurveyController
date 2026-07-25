import { Dialogs } from '@wailsio/runtime'
import { useCallback } from 'react'
import type { Dispatch, MutableRefObject, SetStateAction } from 'react'
import {
  createSurveyDocument,
  decodeQRCode,
  decodeQRCodeDataURL,
  exportLogLines,
  loadConfigDocument,
  previewReverseFill,
  saveConfigDocument,
} from '../services/shell'
import { mergeParsedDocument, updateConfigDocumentField, updateSurveyURL } from '../services/configDocument'
import type { ConfigDocument } from '../types'
import type { AppModel } from '../viewModels/appModel'

interface ConfigDocumentActionsOptions {
  config: ConfigDocument | null
  configRef: MutableRefObject<ConfigDocument | null>
  configPathRef: MutableRefObject<string>
  setModel: Dispatch<SetStateAction<AppModel | null>>
  setConfig: (config: ConfigDocument) => void
  withBusy: (action: () => Promise<void>) => Promise<void>
  setNotice: (message: string) => void
}

export function useConfigDocumentActions({
  config,
  configRef,
  configPathRef,
  setModel,
  setConfig,
  withBusy,
  setNotice,
}: ConfigDocumentActionsOptions) {
  const updateURL = useCallback((value: string) => {
    if (config) setConfig(updateSurveyURL(config, value))
  }, [config, setConfig])

  const autoConfig = useCallback(async () => {
    await withBusy(async () => {
      if (!config?.survey.url) throw new Error('问卷链接不能为空')
      const parsed = await createSurveyDocument(config.survey.url)
      setConfig(mergeParsedDocument(config, parsed, config.survey.url))
      setNotice('问卷配置已生成')
    })
  }, [config, setConfig, setNotice, withBusy])

  const loadConfigFromDialog = useCallback(async () => {
    await withBusy(async () => {
      const path = await Dialogs.OpenFile({
        Title: '导入配置',
        CanChooseFiles: true,
        Filters: [{ DisplayName: 'JSON 配置', Pattern: '*.json' }],
      })
      if (!path || Array.isArray(path)) return
      const loaded = await loadConfigDocument(path)
      setModel((current) => current
        ? { ...current, configPath: loaded.path, config: loaded.config, configExists: true }
        : current)
      setNotice('配置已导入')
    })
  }, [setModel, setNotice, withBusy])

  const loadQRCodeFromDialog = useCallback(async () => {
    await withBusy(async () => {
      const path = await Dialogs.OpenFile({
        Title: '识别二维码',
        CanChooseFiles: true,
        Filters: [{ DisplayName: '图片文件', Pattern: '*.png;*.jpg;*.jpeg;*.gif' }],
      })
      if (!path || Array.isArray(path) || !config) return
      const decoded = await decodeQRCode(path)
      setConfig(updateSurveyURL(config, decoded.text))
      setNotice('二维码已识别')
    })
  }, [config, setConfig, setNotice, withBusy])

  const decodeQRCodeImage = useCallback(async (file: File) => {
    await withBusy(async () => {
      if (!config) return
      const decoded = await decodeQRCodeDataURL(await readFileAsDataURL(file), file.name)
      setConfig(updateSurveyURL(config, decoded.text))
      setNotice('二维码已识别')
    })
  }, [config, setConfig, setNotice, withBusy])

  const saveConfigToDialog = useCallback(async () => {
    await withBusy(async () => {
      if (!config) return
      const path = await Dialogs.SaveFile({
        Title: '保存配置',
        Filename: `${config.survey.title || 'wjx_config'}.json`,
        Filters: [{ DisplayName: 'JSON 配置', Pattern: '*.json' }],
      })
      if (!path) return
      const saved = await saveConfigDocument(config, path)
      setModel((current) => current
        ? { ...current, configPath: saved.path, config: saved.config, configExists: true }
        : current)
      setNotice('配置已保存')
    })
  }, [config, setModel, setNotice, withBusy])

  const saveCurrentConfig = useCallback(async () => {
    const current = configRef.current
    if (!current) return
    const saved = await saveConfigDocument(current, configPathRef.current)
    setModel((existing) => existing
      ? { ...existing, configPath: saved.path, config: saved.config, configExists: true }
      : existing)
  }, [configPathRef, configRef, setModel])

  const chooseReverseFillFile = useCallback(async () => {
    await withBusy(async () => {
      const path = await Dialogs.OpenFile({
        Title: '选择反填 Excel',
        CanChooseFiles: true,
        Filters: [{ DisplayName: 'Excel 文件', Pattern: '*.xlsx;*.xlsm' }],
      })
      if (!path || Array.isArray(path) || !config) return
      setConfig(updateConfigDocumentField(
        updateConfigDocumentField(config, 'reverse-fill-enabled', true),
        'reverse-fill-path',
        path,
      ))
    })
  }, [config, setConfig, withBusy])

  const previewReverseFillFile = useCallback(async () => {
    await withBusy(async () => {
      if (!config) return
      const preview = await previewReverseFill(config)
      setModel((current) => current ? { ...current, reverseFillPreview: preview } : current)
      setNotice(`已预览 ${preview.total_data_rows} 行`)
    })
  }, [config, setModel, setNotice, withBusy])

  const exportLogs = useCallback(async (path: string, lines: string[]) => {
    await withBusy(async () => {
      await exportLogLines(path, lines)
      setNotice('日志已导出')
    })
  }, [setNotice, withBusy])

  return {
    updateURL,
    autoConfig,
    loadConfigFromDialog,
    loadQRCodeFromDialog,
    decodeQRCodeImage,
    saveConfigToDialog,
    saveCurrentConfig,
    chooseReverseFillFile,
    previewReverseFillFile,
    exportLogs,
  }
}

function readFileAsDataURL(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result || ''))
    reader.onerror = () => reject(reader.error ?? new Error('读取图片失败'))
    reader.readAsDataURL(file)
  })
}
