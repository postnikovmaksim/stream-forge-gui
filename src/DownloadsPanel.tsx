import { useState, type ReactNode } from 'react'
import { ActionIcon, Badge, Group, Paper, ScrollArea, Stack, Text, Title } from '@mantine/core'
import { IconCheck, IconLoader2, IconPlayerStop, IconX } from '@tabler/icons-react'
import type { DownloadJobState } from './useDownloads'

const STATUS_BADGE: Record<
  DownloadJobState['status'],
  { color: string; icon: ReactNode; label: string }
> = {
  running: { color: 'blue', icon: <IconLoader2 size={12} />, label: 'идёт' },
  done: { color: 'green', icon: <IconCheck size={12} />, label: 'готово' },
  failed: { color: 'red', icon: <IconX size={12} />, label: 'ошибка' },
}

function DownloadsPanel({
  jobs,
  onKill,
}: {
  jobs: DownloadJobState[]
  onKill: (jobId: string) => void
}) {
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const selected = jobs.find((job) => job.id === selectedId) ?? null

  if (jobs.length === 0) {
    return (
      <Text c="dimmed" size="sm">
        Загрузок пока нет.
      </Text>
    )
  }

  return (
    <Stack>
      <Title order={2}>Загрузки</Title>
      <Group align="flex-start" wrap="nowrap">
        <Stack gap="xs" miw={260}>
          {jobs.map((job) => {
            const badge = STATUS_BADGE[job.status]
            return (
              <Paper
                key={job.id}
                withBorder
                p="xs"
                radius="sm"
                onClick={() => setSelectedId(job.id)}
                style={{
                  cursor: 'pointer',
                  borderColor:
                    selectedId === job.id ? 'var(--mantine-color-blue-5)' : undefined,
                }}
              >
                <Group justify="space-between" wrap="nowrap">
                  <Stack gap={4}>
                    <Badge color={badge.color} leftSection={badge.icon} size="sm">
                      {badge.label}
                    </Badge>
                    <Text size="sm">{job.title}</Text>
                  </Stack>
                  {job.status === 'running' && (
                    <ActionIcon
                      color="red"
                      variant="subtle"
                      onClick={(e) => {
                        e.stopPropagation()
                        onKill(job.id)
                      }}
                      title="Остановить"
                    >
                      <IconPlayerStop size={16} />
                    </ActionIcon>
                  )}
                </Group>
              </Paper>
            )
          })}
        </Stack>

        <ScrollArea h={400} style={{ flex: 1 }}>
          <Text
            component="pre"
            size="xs"
            ff="monospace"
            style={{ whiteSpace: 'pre-wrap', margin: 0 }}
          >
            {selected ? selected.logs.join('') : 'Выберите загрузку, чтобы посмотреть лог'}
          </Text>
        </ScrollArea>
      </Group>
    </Stack>
  )
}

export default DownloadsPanel
