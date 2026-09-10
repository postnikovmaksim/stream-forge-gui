import { useEffect, useState } from 'react'
import {
  Button,
  Fieldset,
  Group,
  Loader,
  NumberInput,
  PasswordInput,
  Stack,
  Switch,
  Text,
  TextInput,
  Title,
} from '@mantine/core'
import { IconCheck, IconDeviceFloppy, IconFolder } from '@tabler/icons-react'
import type { AppSettings } from '../shared/appSettings'

function AppSettingsForm() {
  const [settings, setSettings] = useState<AppSettings | null>(null)
  const [defaultPath, setDefaultPath] = useState('')
  const [status, setStatus] = useState<'idle' | 'saving' | 'saved'>('idle')

  useEffect(() => {
    Promise.all([
      window.animedl.appSettings.get(),
      window.animedl.appSettings.getDefaultDownloadPath(),
    ]).then(([loaded, defaultDownloadPath]) => {
      setSettings(loaded)
      setDefaultPath(defaultDownloadPath)
    })
  }, [])

  async function handleBrowse() {
    const dir = await window.animedl.dialog.chooseDirectory()
    if (dir && settings) {
      setSettings({ ...settings, downloadPath: dir })
      setStatus('idle')
    }
  }

  async function handleSave() {
    if (!settings) return
    setStatus('saving')
    await window.animedl.appSettings.save(settings)
    setStatus('saved')
  }

  if (!settings) {
    return <Loader size="sm" />
  }

  return (
    <Stack maw={480}>
      <Title order={2}>Настройки</Title>

      <Group align="flex-end">
        <TextInput
          label="Папка скачивания"
          value={settings.downloadPath}
          placeholder={defaultPath}
          onChange={(e) => {
            setSettings({ ...settings, downloadPath: e.currentTarget.value })
            setStatus('idle')
          }}
          style={{ flex: 1 }}
        />
        <Button variant="default" leftSection={<IconFolder size={16} />} onClick={handleBrowse}>
          Обзор...
        </Button>
      </Group>

      <NumberInput
        label="Параллельных загрузок"
        min={1}
        max={10}
        value={settings.parallelDownloads}
        onChange={(value) => {
          setSettings({
            ...settings,
            parallelDownloads: typeof value === 'number' ? value : 1,
          })
          setStatus('idle')
        }}
      />

      <Fieldset legend="SOCKS5-прокси">
        <Stack>
          <Switch
            label="Использовать SOCKS5-прокси"
            checked={settings.proxy.enabled}
            onChange={(e) => {
              setSettings({
                ...settings,
                proxy: { ...settings.proxy, enabled: e.currentTarget.checked },
              })
              setStatus('idle')
            }}
          />

          <Group grow>
            <TextInput
              label="IP"
              value={settings.proxy.host}
              onChange={(e) => {
                setSettings({
                  ...settings,
                  proxy: { ...settings.proxy, host: e.currentTarget.value },
                })
                setStatus('idle')
              }}
            />
            <TextInput
              label="Порт"
              value={settings.proxy.port}
              onChange={(e) => {
                setSettings({
                  ...settings,
                  proxy: { ...settings.proxy, port: e.currentTarget.value },
                })
                setStatus('idle')
              }}
            />
          </Group>

          <Group grow>
            <TextInput
              label="Логин"
              value={settings.proxy.user}
              onChange={(e) => {
                setSettings({
                  ...settings,
                  proxy: { ...settings.proxy, user: e.currentTarget.value },
                })
                setStatus('idle')
              }}
            />
            <PasswordInput
              label="Пароль"
              value={settings.proxy.password}
              onChange={(e) => {
                setSettings({
                  ...settings,
                  proxy: { ...settings.proxy, password: e.currentTarget.value },
                })
                setStatus('idle')
              }}
            />
          </Group>
        </Stack>
      </Fieldset>

      <Group>
        <Button
          leftSection={<IconDeviceFloppy size={16} />}
          onClick={handleSave}
          loading={status === 'saving'}
          w="fit-content"
        >
          Сохранить
        </Button>
        {status === 'saved' && (
          <Group gap={4}>
            <IconCheck size={16} color="var(--mantine-color-green-6)" />
            <Text size="sm" c="green">
              Сохранено
            </Text>
          </Group>
        )}
      </Group>
    </Stack>
  )
}

export default AppSettingsForm
