import { useState } from 'react'
import { AppShell, Badge, Group, Tabs, Title } from '@mantine/core'
import { IconAdjustments, IconDownload, IconSearch, IconSettings } from '@tabler/icons-react'
import AnimeSearch from './AnimeSearch'
import AppSettingsForm from './AppSettingsForm'
import DownloadsPanel from './DownloadsPanel'
import SourcesSettings from './SourcesSettings'
import UpdateControl from './UpdateControl'
import { useDownloads } from './useDownloads'
import { useUpdater } from './useUpdater'

type Tab = 'search' | 'sources' | 'settings' | 'downloads'

function App() {
  const [tab, setTab] = useState<Tab>('search')
  const { jobs, startDownload, killDownload } = useDownloads()
  const updater = useUpdater()
  const runningCount = jobs.filter((job) => job.status === 'running').length

  return (
    <AppShell header={{ height: 56 }} padding="md">
      <AppShell.Header>
        <Group h="100%" px="md" justify="space-between">
          <Group gap="xs">
            <Title order={3}>StreamForge</Title>
            {updater.version && (
              <Badge variant="light" color="gray" size="sm">
                v{updater.version}
              </Badge>
            )}
          </Group>
          <UpdateControl {...updater} />
        </Group>
      </AppShell.Header>

      <AppShell.Main>
        <Tabs value={tab} onChange={(value) => value && setTab(value as Tab)}>
          <Tabs.List>
            <Tabs.Tab value="search" leftSection={<IconSearch size={16} />}>
              Поиск
            </Tabs.Tab>
            <Tabs.Tab value="sources" leftSection={<IconAdjustments size={16} />}>
              Источники
            </Tabs.Tab>
            <Tabs.Tab value="settings" leftSection={<IconSettings size={16} />}>
              Настройки
            </Tabs.Tab>
            <Tabs.Tab
              value="downloads"
              leftSection={<IconDownload size={16} />}
              rightSection={
                runningCount > 0 ? (
                  <Badge size="xs" circle>
                    {runningCount}
                  </Badge>
                ) : null
              }
            >
              Загрузки
            </Tabs.Tab>
          </Tabs.List>

          <Tabs.Panel value="search" pt="md" keepMounted>
            <AnimeSearch onStartDownload={startDownload} />
          </Tabs.Panel>
          <Tabs.Panel value="sources" pt="md" keepMounted>
            <SourcesSettings />
          </Tabs.Panel>
          <Tabs.Panel value="settings" pt="md" keepMounted>
            <AppSettingsForm />
          </Tabs.Panel>
          <Tabs.Panel value="downloads" pt="md" keepMounted>
            <DownloadsPanel jobs={jobs} onKill={killDownload} />
          </Tabs.Panel>
        </Tabs>
      </AppShell.Main>
    </AppShell>
  )
}

export default App
