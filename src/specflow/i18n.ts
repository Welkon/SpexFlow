import type { Language } from '../../shared/appDataTypes'

type Dict = Record<string, string>

const EN: Dict = {
  toolbar_hand: 'Hand Mode',
  toolbar_hand_desc: 'Pan and navigate around the canvas by clicking and dragging',
  toolbar_select: 'Select Mode',
  toolbar_select_desc: 'Click to select nodes, or drag to create a selection box',
  toolbar_code_search: 'Code Search',
  toolbar_code_search_desc: 'Search through your codebase to find relevant code snippets',
  toolbar_search_conductor: 'Search Conductor',
  toolbar_search_conductor_desc: 'Orchestrate multiple code searches in parallel',
  toolbar_context: 'Context Converter',
  toolbar_context_desc: 'Convert code search results into formatted context for LLM',
  toolbar_instruction: 'Instruction',
  toolbar_instruction_desc: 'Add custom instructions or prompts to guide the workflow',
  toolbar_llm: 'LLM',
  toolbar_llm_desc: 'Process context through a language model to generate responses',
  toolbar_reset: 'Reset Canvas',
  toolbar_reset_desc: 'Clear all node outputs and reset the canvas to idle state',
  toolbar_manual_import: 'Manual Import',
  toolbar_manual_import_desc: 'Select local files/folders (no external search)',

  settings: 'Settings',
  settings_title: 'Settings',
  language: 'Language',
  language_en: 'English',
  language_zh: '中文',

  settings_tab_llm: 'LLM Providers',
  settings_tab_codesearch: 'Code Search',

  providers: 'Providers',
  add: '+ Add',
  provider_name: 'Provider Name',
  endpoint: 'Endpoint URL',
  api_key: 'API Key',
  models: 'Models',
  add_model: '+ Add Model',
  new_model: 'New Model',
  model_id: 'Model ID',
  display_name: 'Display Name',
  no_models_configured: 'No models configured',
  remove_provider: 'Remove Provider',
  no_providers_configured: 'No LLM providers configured.',
  new_provider: 'New Provider',
  add_provider: '+ Add Provider',

  active_provider: 'Active Provider',
  api_key_for_provider: 'API Key',
  enter_api_key_placeholder: 'Enter API key...',
  codesearch_note:
    'Currently only Relace is supported for code search. If no API key is provided here, the server will fall back to reading from the .apikey file.',

  cancel: 'Cancel',
  save_settings: 'Save',
  close: 'Close',

  manual_import: 'Manual Import',
  manual_import_repo_path: 'Repository Path',
  manual_import_pick: 'Pick Files / Folders',
  manual_import_selected_items: 'Selected Items',
  manual_import_selected_none: 'None selected',
  manual_import_remove: 'Remove',
  manual_import_dir_note: 'Folders are non-recursive. Only trusted extensions are included.',
  manual_import_repo_required: 'Repository Path is required.',
  manual_import_pick_title: 'Pick Files / Folders',
  manual_import_filter_placeholder: 'Filter current folder...',
  manual_import_trusted_exts: 'Trusted extensions',
  manual_import_loading: 'Loading...',
  manual_import_entries: 'Entries',
  manual_import_empty_dir: 'Empty folder (or no trusted files).',
  manual_import_root: 'Root',
  manual_import_up: 'Up',
  manual_import_selected: 'Selected',
  manual_import_selected_empty: 'Select files or folders from the left.',
  manual_import_done: 'Done',
}

const ZH: Dict = {
  toolbar_hand: '手形模式',
  toolbar_hand_desc: '拖动平移画布（按住鼠标左键拖拽）',
  toolbar_select: '选择模式',
  toolbar_select_desc: '点击选择节点，或拖拽进行框选',
  toolbar_code_search: '代码搜索',
  toolbar_code_search_desc: '在代码库中搜索相关代码片段',
  toolbar_search_conductor: '搜索编排',
  toolbar_search_conductor_desc: '并行编排多个代码搜索查询',
  toolbar_context: '上下文转换',
  toolbar_context_desc: '把搜索结果转换为 LLM 可用的上下文文本',
  toolbar_instruction: '指令',
  toolbar_instruction_desc: '添加自定义指令/提示来引导工作流',
  toolbar_llm: 'LLM',
  toolbar_llm_desc: '把上下文交给模型生成输出',
  toolbar_reset: '重置画布',
  toolbar_reset_desc: '清空所有节点输出并重置为 idle 状态',
  toolbar_manual_import: '手动导入',
  toolbar_manual_import_desc: '选择本地文件/文件夹（不做外部搜索）',

  settings: '设置',
  settings_title: '设置',
  language: '语言',
  language_en: 'English',
  language_zh: '中文',

  settings_tab_llm: 'LLM 提供方',
  settings_tab_codesearch: '代码搜索',

  providers: '提供方',
  add: '+ 添加',
  provider_name: '提供方名称',
  endpoint: 'Endpoint URL',
  api_key: 'API Key',
  models: '模型',
  add_model: '+ 添加模型',
  new_model: '新模型',
  model_id: '模型 ID',
  display_name: '展示名称',
  no_models_configured: '暂无模型配置',
  remove_provider: '移除提供方',
  no_providers_configured: '暂无 LLM 提供方配置。',
  new_provider: '新提供方',
  add_provider: '+ 添加提供方',

  active_provider: '当前提供方',
  api_key_for_provider: 'API Key',
  enter_api_key_placeholder: '输入 API Key...',
  codesearch_note:
    '目前代码搜索仅支持 Relace。如果这里没有填写 API Key，后端会回退到读取 .apikey 文件。',

  cancel: '取消',
  save_settings: '保存',
  close: '关闭',

  manual_import: '手动导入',
  manual_import_repo_path: '仓库路径',
  manual_import_pick: '选择文件/文件夹',
  manual_import_selected_items: '已选择',
  manual_import_selected_none: '未选择任何项',
  manual_import_remove: '移除',
  manual_import_dir_note: '文件夹不递归；只会包含信任后缀名的文件。',
  manual_import_repo_required: '需要填写仓库路径。',
  manual_import_pick_title: '选择文件/文件夹',
  manual_import_filter_placeholder: '过滤当前目录...',
  manual_import_trusted_exts: '信任后缀',
  manual_import_loading: '加载中...',
  manual_import_entries: '目录内容',
  manual_import_empty_dir: '目录为空（或没有符合后缀的文件）。',
  manual_import_root: '根目录',
  manual_import_up: '上级',
  manual_import_selected: '已选择',
  manual_import_selected_empty: '在左侧选择文件或文件夹。',
  manual_import_done: '完成',
}

function getDict(language: Language): Dict {
  if (language === 'en') return EN
  if (language === 'zh') return ZH
  throw new Error(`Unsupported language: ${language}`)
}

export function t(language: Language, key: string): string {
  const dict = getDict(language)
  const value = dict[key]
  if (typeof value !== 'string') throw new Error(`Missing i18n key: ${key} (lang=${language})`)
  return value
}
