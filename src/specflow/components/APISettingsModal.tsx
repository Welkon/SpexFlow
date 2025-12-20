import { useState, useEffect } from 'react'
import type { APISettings, LLMProvider, LLMModel } from '../types'
import type { Language } from '../../../shared/appDataTypes'
import { t } from '../i18n'
import { SettingsModalShell } from './SettingsModalShell'

type Props = {
  isOpen: boolean
  settings: APISettings
  language: Language
  onLanguageChange: (language: Language) => void
  onSave: (settings: APISettings) => void
  onClose: () => void
}

export function APISettingsModal({ isOpen, settings, language, onLanguageChange, onSave, onClose }: Props) {
  const [localSettings, setLocalSettings] = useState<APISettings>(settings)
  const [activeTab, setActiveTab] = useState<'codesearch' | 'llm'>('llm')
  const [selectedProviderId, setSelectedProviderId] = useState<string | null>(
    settings.llm.providers[0]?.id ?? null
  )

  // Sync local settings when modal opens
  useEffect(() => {
    if (isOpen) {
      setLocalSettings(settings)
      setSelectedProviderId(settings.llm.providers[0]?.id ?? null)
    }
  }, [isOpen, settings])

  if (!isOpen) return null

  const selectedProvider = localSettings.llm.providers.find(p => p.id === selectedProviderId)

  function updateProvider(providerId: string, patch: Partial<LLMProvider>) {
    setLocalSettings(prev => ({
      ...prev,
      llm: {
        ...prev.llm,
        providers: prev.llm.providers.map(p =>
          p.id === providerId ? { ...p, ...patch } : p
        )
      }
    }))
  }

  function addModel(providerId: string) {
    const provider = localSettings.llm.providers.find(p => p.id === providerId)
    if (!provider) return

    const newModel: LLMModel = {
      id: `${providerId}-model-${Date.now()}`,
      name: t(language, 'new_model')
    }

    updateProvider(providerId, {
      models: [...provider.models, newModel]
    })
  }

  function updateModel(providerId: string, modelId: string, patch: Partial<LLMModel>) {
    const provider = localSettings.llm.providers.find(p => p.id === providerId)
    if (!provider) return

    updateProvider(providerId, {
      models: provider.models.map(m =>
        m.id === modelId ? { ...m, ...patch } : m
      )
    })
  }

  function removeModel(providerId: string, modelId: string) {
    const provider = localSettings.llm.providers.find(p => p.id === providerId)
    if (!provider) return

    updateProvider(providerId, {
      models: provider.models.filter(m => m.id !== modelId)
    })
  }

  function addProvider() {
    const newProvider: LLMProvider = {
      id: `provider-${Date.now()}`,
      name: t(language, 'new_provider'),
      endpoint: '',
      apiKey: '',
      models: []
    }

    setLocalSettings(prev => ({
      ...prev,
      llm: {
        ...prev.llm,
        providers: [...prev.llm.providers, newProvider]
      }
    }))

    setSelectedProviderId(newProvider.id)
  }

  function removeProvider(providerId: string) {
    setLocalSettings(prev => ({
      ...prev,
      llm: {
        ...prev.llm,
        providers: prev.llm.providers.filter(p => p.id !== providerId)
      }
    }))

    if (selectedProviderId === providerId) {
      const remaining = localSettings.llm.providers.filter(p => p.id !== providerId)
      setSelectedProviderId(remaining[0]?.id ?? null)
    }
  }

  function handleSave() {
    onSave(localSettings)
    onClose()
  }

  return (
    <SettingsModalShell
      isOpen={isOpen}
      title={t(language, 'settings_title')}
      onClose={onClose}
      closeTitle={t(language, 'close')}
      footer={
        <>
          <button className="sfCancelBtn" onClick={onClose}>{t(language, 'cancel')}</button>
          <button className="sfSaveBtn" onClick={handleSave}>{t(language, 'save_settings')}</button>
        </>
      }
    >
      <div className="sfFieldGroup" style={{ padding: '0 16px' }}>
        <label className="sfFieldLabel">{t(language, 'language')}</label>
        <select
          className="sfSelect"
          value={language}
          onChange={(e) => onLanguageChange(e.target.value as Language)}
        >
          <option value="en">{t(language, 'language_en')}</option>
          <option value="zh">{t(language, 'language_zh')}</option>
        </select>
      </div>

      {/* Tab Switcher */}
      <div className="sfSettingsTabs">
        <button
          className={`sfSettingsTab ${activeTab === 'llm' ? 'active' : ''}`}
          onClick={() => setActiveTab('llm')}
        >
          {t(language, 'settings_tab_llm')}
        </button>
        <button
          className={`sfSettingsTab ${activeTab === 'codesearch' ? 'active' : ''}`}
          onClick={() => setActiveTab('codesearch')}
        >
          {t(language, 'settings_tab_codesearch')}
        </button>
      </div>

      <div className="sfSettingsContent">
        {activeTab === 'llm' && (
          <div className="sfLLMSettings">
            {/* Provider List */}
            <div className="sfProviderList">
              <div className="sfProviderListHeader">
                <span>{t(language, 'providers')}</span>
                <button className="sfAddBtn" onClick={addProvider}>{t(language, 'add')}</button>
              </div>
              {localSettings.llm.providers.map(provider => (
                <div
                  key={provider.id}
                  className={`sfProviderItem ${selectedProviderId === provider.id ? 'active' : ''}`}
                  onClick={() => setSelectedProviderId(provider.id)}
                >
                  <span>{provider.name}</span>
                  {provider.apiKey && <span className="sfKeyIndicator">🔑</span>}
                </div>
              ))}
            </div>

            {/* Provider Details */}
            {selectedProvider && (
              <div className="sfProviderDetails">
                <div className="sfFieldGroup">
                  <label className="sfFieldLabel">{t(language, 'provider_name')}</label>
                  <input
                    className="sfInput"
                    value={selectedProvider.name}
                    onChange={(e) => updateProvider(selectedProvider.id, { name: e.target.value })}
                    placeholder="e.g., OpenAI"
                  />
                </div>

                <div className="sfFieldGroup">
                  <label className="sfFieldLabel">{t(language, 'endpoint')}</label>
                  <input
                    className="sfInput"
                    value={selectedProvider.endpoint}
                    onChange={(e) => updateProvider(selectedProvider.id, { endpoint: e.target.value })}
                    placeholder="e.g., https://api.openai.com/v1"
                  />
                </div>

                <div className="sfFieldGroup">
                  <label className="sfFieldLabel">{t(language, 'api_key')}</label>
                  <input
                    className="sfInput"
                    type="password"
                    value={selectedProvider.apiKey}
                    onChange={(e) => updateProvider(selectedProvider.id, { apiKey: e.target.value })}
                    placeholder="sk-..."
                  />
                </div>

                <div className="sfModelsSection">
                  <div className="sfModelsSectionHeader">
                    <span className="sfFieldLabel">{t(language, 'models')}</span>
                    <button className="sfAddBtn" onClick={() => addModel(selectedProvider.id)}>
                      {t(language, 'add_model')}
                    </button>
                  </div>

                  {selectedProvider.models.map(model => (
                    <div key={model.id} className="sfModelRow">
                      <input
                        className="sfInput sfModelIdInput"
                        value={model.id}
                        onChange={(e) => updateModel(selectedProvider.id, model.id, { id: e.target.value })}
                        placeholder={t(language, 'model_id')}
                      />
                      <input
                        className="sfInput sfModelNameInput"
                        value={model.name}
                        onChange={(e) => updateModel(selectedProvider.id, model.id, { name: e.target.value })}
                        placeholder={t(language, 'display_name')}
                      />
                      <button
                        className="sfRemoveBtn"
                        onClick={() => removeModel(selectedProvider.id, model.id)}
                      >
                        ×
                      </button>
                    </div>
                  ))}

                  {selectedProvider.models.length === 0 && (
                    <div className="sfEmptyModels">{t(language, 'no_models_configured')}</div>
                  )}
                </div>

                <button
                  className="sfRemoveProviderBtn"
                  onClick={() => removeProvider(selectedProvider.id)}
                >
                  {t(language, 'remove_provider')}
                </button>
              </div>
            )}

            {!selectedProvider && localSettings.llm.providers.length === 0 && (
              <div className="sfNoProviders">
                <p>{t(language, 'no_providers_configured')}</p>
                <button className="sfAddBtn" onClick={addProvider}>{t(language, 'add_provider')}</button>
              </div>
            )}
          </div>
        )}

        {activeTab === 'codesearch' && (
          <div className="sfCodeSearchSettings">
            <div className="sfFieldGroup">
              <label className="sfFieldLabel">{t(language, 'active_provider')}</label>
              <select
                className="sfSelect"
                value={localSettings.codeSearch.activeProvider}
                onChange={(e) => setLocalSettings(prev => ({
                  ...prev,
                  codeSearch: { ...prev.codeSearch, activeProvider: e.target.value }
                }))}
              >
                {localSettings.codeSearch.providers.map(p => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            </div>

            {/* API Key for active provider */}
            {(() => {
              const activeProvider = localSettings.codeSearch.providers.find(
                p => p.id === localSettings.codeSearch.activeProvider
              )
              if (!activeProvider) return null
              return (
                <div className="sfFieldGroup">
                  <label className="sfFieldLabel">{activeProvider.name} {t(language, 'api_key_for_provider')}</label>
                  <input
                    className="sfInput"
                    type="password"
                    value={activeProvider.apiKey}
                    onChange={(e) => setLocalSettings(prev => ({
                      ...prev,
                      codeSearch: {
                        ...prev.codeSearch,
                        providers: prev.codeSearch.providers.map(p =>
                          p.id === activeProvider.id ? { ...p, apiKey: e.target.value } : p
                        )
                      }
                    }))}
                    placeholder={t(language, 'enter_api_key_placeholder')}
                  />
                </div>
              )
            })()}

            <p className="sfSettingsNote">
              {t(language, 'codesearch_note')}
            </p>
          </div>
        )}
      </div>
    </SettingsModalShell>
  )
}
