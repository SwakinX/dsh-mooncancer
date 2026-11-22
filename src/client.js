/**
 * MoonCancer bundle browser half: renders the bundle's configuration form on
 * the Plugins page (plugins.bundle.config), following the shared
 * SettingsFormModel pattern used by official plugin config pages.
 */
window.__ModuleLoader__.load({
  id: '@swakinx/dsh-mooncancer',
  factory(require) {
    const React = require('react')
    const h = React.createElement
    const primitives = require('@deepseek-ai/dsh-client-ui-primitives')
    const { SettingsForm, SettingsValueField, SettingsFormModel, settingsTextField } = primitives

    const NS = 'mooncancer'

    const en = {
      port: 'API port',
      portHint: 'Local port of the MoonCancer open API (the port value in MoonCancer config/api.json). Default 18765.',
      token: 'API token',
      tokenHint: 'Bearer token from MoonCancer config/api.json; leave empty when the API runs without auth.',
      timeout: 'Request timeout (ms)',
      timeoutHint: 'Per-request timeout in milliseconds. Default 15000.',
      appDir: 'MoonCancer directory',
      appDirHint: 'App directory for auto-launch: packed MoonCancer.exe or a source checkout (.venv layout). When the API is unreachable, tools relaunch it elevated (UAC prompt). Empty disables auto-launch.',
      invalidNumber: 'Enter a positive number.',
      overridden: 'Overridden', reset: 'Reset to default',
      unavailable: 'Configuration is unavailable.', readOnly: 'This deployment stores settings read-only.',
      saveFailed: 'The deployment did not accept these values; they were left for you to correct.',
      save: 'Save', saving: 'Saving…',
    }
    const zh = {
      port: 'API 端口',
      portHint: 'MoonCancer 本地开放接口端口（config/api.json 里的 port），默认 18765。',
      token: 'API 令牌',
      tokenHint: 'MoonCancer config/api.json 里的 token；接口未开启鉴权时可留空。',
      timeout: '请求超时（毫秒）',
      timeoutHint: '单次请求超时毫秒数，默认 15000。',
      appDir: '程序目录',
      appDirHint: 'MoonCancer 程序目录：服务未运行时自动拉起（UAC 提权弹窗需确认）。支持打包版 MoonCancer.exe 或源码仓（.venv 布局）；留空禁用自动拉起。',
      invalidNumber: '请填写正整数。',
      overridden: '已覆盖', reset: '恢复默认',
      unavailable: '配置暂不可用。', readOnly: '本部署的设置为只读。',
      saveFailed: '本部署没有接受这些值，已保留供你修改。',
      save: '保存', saving: '保存中…',
    }

    /** Shared form chrome labels read from the plugin dictionary. */
    function formLabels(t) {
      return { unavailable: t('unavailable'), readOnly: t('readOnly'), saveFailed: t('saveFailed'), save: t('save'), saving: t('saving') }
    }

    /** Text field whose saved value is a positive number (port, timeout). */
    function numberField(name) {
      return {
        ...settingsTextField(name),
        parse: (text) => {
          const trimmed = text.trim()
          if (trimmed === '') return { kind: 'clear' }
          const n = Number(trimmed)
          return Number.isInteger(n) && n > 0 ? { kind: 'set', value: n } : undefined
        },
      }
    }

    function MooncancerConfig(props) {
      const state = props.useMooncancerForm(value => value)
      const disabled = !state.writable || state.saving
      const portId = React.useId(), tokenId = React.useId(), timeoutId = React.useId(), appDirId = React.useId()
      return h(SettingsForm, { labels: formLabels(props.t), state, onSave: props.save, onDiscard: props.discard },
        h(SettingsValueField, {
          id: portId, label: props.t('port'), hint: props.t('portHint'),
          ...state.port, overriddenLabel: props.t('overridden'), resetLabel: props.t('reset'),
          invalidLabel: props.t('invalidNumber'), disabled,
          onEdit: (value) => { props.edit('port', value) }, onReset: () => { props.resetField('port') },
        }),
        h(SettingsValueField, {
          id: tokenId, label: props.t('token'), hint: props.t('tokenHint'),
          ...state.token, overriddenLabel: props.t('overridden'), resetLabel: props.t('reset'),
          disabled,
          onEdit: (value) => { props.edit('token', value) }, onReset: () => { props.resetField('token') },
        }),
        h(SettingsValueField, {
          id: timeoutId, label: props.t('timeout'), hint: props.t('timeoutHint'),
          ...state.requestTimeoutMs, overriddenLabel: props.t('overridden'), resetLabel: props.t('reset'),
          invalidLabel: props.t('invalidNumber'), disabled,
          onEdit: (value) => { props.edit('requestTimeoutMs', value) }, onReset: () => { props.resetField('requestTimeoutMs') },
        }),
        h(SettingsValueField, {
          id: appDirId, label: props.t('appDir'), hint: props.t('appDirHint'),
          ...state.appDir, overriddenLabel: props.t('overridden'), resetLabel: props.t('reset'),
          disabled,
          onEdit: (value) => { props.edit('appDir', value) }, onReset: () => { props.resetField('appDir') },
        }),
      )
    }

    return {
      inject: ['slots', 'locale', 'configForms'],
      apply(ctx) {
        const scope = ctx.configForms.get('mooncancer')
        const model = new SettingsFormModel(scope, [
          numberField('port'),
          settingsTextField('token'),
          numberField('requestTimeoutMs'),
          settingsTextField('appDir'),
        ])
        const state = model.bind(() => ({
          ...model.shell(),
          port: model.field('port'),
          token: model.field('token'),
          requestTimeoutMs: model.field('requestTimeoutMs'),
          appDir: model.field('appDir'),
        }))
        ctx.effect(() => () => { model.dispose() })
        ctx.effect(() => ctx.locale.register(NS, { en, zh }))
        ctx.slots.inject('plugins.bundle.config', () => ctx.slots.register({
          name: 'plugins.bundle.config', key: '@swakinx/dsh-mooncancer', locale: NS,
          inject: () => ({ hooks: { mooncancerForm: state }, ...model.actions() }),
        }, MooncancerConfig))
      },
    }
  },
})
