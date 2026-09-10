import { useEffect, useState } from 'react'
import { Button, Group, Loader, NumberInput, Stack, Switch, Table, Text, TextInput, Title } from '@mantine/core'
import { IconCheck, IconDeviceFloppy } from '@tabler/icons-react'
import type { SourceConfig } from '../shared/sourceConfig'

function SourcesSettings() {
  const [sources, setSources] = useState<SourceConfig[]>([])
  const [status, setStatus] = useState<'idle' | 'loading' | 'saving' | 'saved'>('loading')

  useEffect(() => {
    window.animedl.sources.get().then((loaded) => {
      setSources(loaded)
      setStatus('idle')
    })
  }, [])

  function updateSource(id: string, patch: Partial<SourceConfig>) {
    setSources((prev) =>
      prev.map((source) => (source.id === id ? { ...source, ...patch } : source)),
    )
    setStatus('idle')
  }

  async function handleSave() {
    setStatus('saving')
    await window.animedl.sources.save(sources)
    setStatus('saved')
  }

  if (status === 'loading') {
    return <Loader size="sm" />
  }

  return (
    <Stack>
      <Title order={2}>Источники</Title>

      <Table>
        <Table.Thead>
          <Table.Tr>
            <Table.Th>Вкл.</Table.Th>
            <Table.Th>Название</Table.Th>
            <Table.Th>Базовый URL</Table.Th>
            <Table.Th>Таймаут, мс</Table.Th>
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {sources.map((source) => (
            <Table.Tr key={source.id}>
              <Table.Td>
                <Switch
                  checked={source.enabled}
                  onChange={(e) => updateSource(source.id, { enabled: e.currentTarget.checked })}
                />
              </Table.Td>
              <Table.Td>{source.name}</Table.Td>
              <Table.Td>
                <TextInput
                  value={source.baseUrl}
                  placeholder="определяется источником по умолчанию"
                  onChange={(e) => updateSource(source.id, { baseUrl: e.currentTarget.value })}
                />
              </Table.Td>
              <Table.Td>
                <NumberInput
                  min={1000}
                  step={1000}
                  value={source.timeoutMs}
                  onChange={(value) =>
                    updateSource(source.id, { timeoutMs: typeof value === 'number' ? value : 0 })
                  }
                  w={120}
                />
              </Table.Td>
            </Table.Tr>
          ))}
        </Table.Tbody>
      </Table>

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

export default SourcesSettings
