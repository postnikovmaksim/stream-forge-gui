import { Button, Group, Text } from '@mantine/core'
import { IconDownload, IconExternalLink, IconRefresh } from '@tabler/icons-react'
import type { useUpdater } from './useUpdater'

function UpdateControl(props: ReturnType<typeof useUpdater>) {
  const { status, platform, latestVersion, progress, errorMessage, check, download, install, openReleasePage } =
    props

  if (status === 'downloading') {
    return (
      <Text size="xs" c="dimmed">
        Скачивание обновления… {progress ?? 0}%
      </Text>
    )
  }

  if (status === 'downloaded') {
    // На macOS штатная автоустановка (Squirrel.Mac) всегда требует
    // подписанное Developer ID-сертификатом приложение — у нас его нет, и
    // проверка подписи гарантированно не пройдёт при любом качестве кода
    // (проверено вживую: "Code signature ... did not pass validation").
    // Честнее сразу предложить открыть страницу релиза, чем звать кнопку
    // "Установить", которая обречена упасть с непонятной ошибкой.
    if (platform === 'darwin') {
      return (
        <Button
          size="xs"
          leftSection={<IconExternalLink size={14} />}
          onClick={openReleasePage}
          title="Автоустановка на macOS недоступна без подписи Apple Developer ID — скачайте и установите вручную"
        >
          Скачано v{latestVersion} — открыть страницу релиза
        </Button>
      )
    }

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
