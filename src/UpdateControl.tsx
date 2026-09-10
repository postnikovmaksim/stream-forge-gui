import { Button, Group, Text } from '@mantine/core'
import { IconDownload, IconRefresh } from '@tabler/icons-react'
import type { useUpdater } from './useUpdater'

function UpdateControl(props: ReturnType<typeof useUpdater>) {
  const { status, latestVersion, progress, errorMessage, check, download, install } = props

  if (status === 'downloading') {
    return (
      <Text size="xs" c="dimmed">
        Скачивание обновления… {progress ?? 0}%
      </Text>
    )
  }

  if (status === 'downloaded') {
    return (
      <Button size="xs" leftSection={<IconRefresh size={14} />} onClick={install}>
        Перезапустить и установить v{latestVersion}
      </Button>
    )
  }

  if (status === 'available') {
    return (
      <Button size="xs" leftSection={<IconDownload size={14} />} onClick={download}>
        Доступна v{latestVersion} — скачать
      </Button>
    )
  }

  return (
    <Group gap="xs">
      {status === 'error' && (
        <Text size="xs" c="red" title={errorMessage ?? ''}>
          Ошибка проверки обновлений
        </Text>
      )}
      {status === 'not-available' && (
        <Text size="xs" c="dimmed">
          Обновлений нет
        </Text>
      )}
      <Button size="xs" variant="subtle" loading={status === 'checking'} onClick={check}>
        Проверить обновления
      </Button>
    </Group>
  )
}

export default UpdateControl
