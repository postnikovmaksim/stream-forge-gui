import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MantineProvider } from '@mantine/core'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import EpisodeBrowser from './EpisodeBrowser'

function renderEpisodeBrowser(onStartDownload = vi.fn()) {
  render(
    <MantineProvider>
      <EpisodeBrowser
        sourceId="anilibria"
        animeId="1210"
        animeTitle="Ванпанчмен"
        onStartDownload={onStartDownload}
      />
    </MantineProvider>,
  )
  return onStartDownload
}

function installAnimeMock() {
  window.animedl = {
    appSettings: {
      get: vi.fn().mockResolvedValue({
        downloadPath: '',
        parallelDownloads: 1,
        proxy: { enabled: false, host: '', port: '', user: '', password: '' },
      }),
      save: vi.fn(),
      getDefaultDownloadPath: vi.fn().mockResolvedValue('/Downloads/Anime'),
    },
    dialog: { chooseDirectory: vi.fn() },
    ytdlp: { ensure: vi.fn() },
    download: { start: vi.fn(), kill: vi.fn(), onEvent: vi.fn().mockReturnValue(() => {}) },
    sources: { get: vi.fn(), save: vi.fn() },
    anime: {
      listEnabledSources: vi.fn(),
      search: vi.fn(),
      getEpisodes: vi
        .fn()
        .mockResolvedValue(
          Array.from({ length: 5 }, (_, i) => ({ index: i, title: `Серия ${i + 1}` })),
        ),
      getSources: vi.fn().mockResolvedValue([{ index: 0, title: 'AniLibria', domain: '' }]),
      getQualities: vi
        .fn()
        .mockResolvedValue([{ quality: '480', type: 'm3u8', url: 'https://example.com/480.m3u8' }]),
      getVideoUrls: vi
        .fn()
        .mockImplementation((_sourceId: string, _animeId: string, indexes: number[]) =>
          Promise.resolve(
            indexes.map((index) => [
              { quality: '480', type: 'm3u8', url: `https://example.com/ep${index}.m3u8` },
            ]),
          ),
        ),
    },
  }
}

describe('EpisodeBrowser', () => {
  beforeEach(() => {
    installAnimeMock()
  })

  it('клик по одной серии выбирает её и сам подтягивает источник/качество', async () => {
    renderEpisodeBrowser()

    const episode1 = await screen.findByText('Серия 1')
    fireEvent.mouseDown(episode1)
    fireEvent.mouseUp(episode1)

    await screen.findByText('AniLibria')
    expect(screen.getByText(/Скачать выбранные \(1\)/)).toBeInTheDocument()
  })

  it('протягивание с зажатой кнопкой выбирает диапазон серий', async () => {
    renderEpisodeBrowser()

    const episode2 = await screen.findByText('Серия 2')
    const episode4 = await screen.findByText('Серия 4')

    fireEvent.mouseDown(episode2)
    fireEvent.mouseEnter(episode4)
    fireEvent.mouseUp(episode4)

    expect(screen.getByText(/Скачать выбранные \(3\)/)).toBeInTheDocument()
  })

  it('диапазон можно тянуть и в обратную сторону', async () => {
    renderEpisodeBrowser()

    const episode4 = await screen.findByText('Серия 4')
    const episode2 = await screen.findByText('Серия 2')

    fireEvent.mouseDown(episode4)
    fireEvent.mouseEnter(episode2)
    fireEvent.mouseUp(episode2)

    expect(screen.getByText(/Скачать выбранные \(3\)/)).toBeInTheDocument()
  })

  it('новый клик начинает новый выбор, а не добавляет к старому', async () => {
    renderEpisodeBrowser()

    const episode1 = await screen.findByText('Серия 1')
    const episode2 = await screen.findByText('Серия 2')
    const episode3 = await screen.findByText('Серия 3')

    fireEvent.mouseDown(episode1)
    fireEvent.mouseEnter(episode3)
    fireEvent.mouseUp(episode3)
    expect(screen.getByText(/Скачать выбранные \(3\)/)).toBeInTheDocument()

    fireEvent.mouseDown(episode2)
    fireEvent.mouseUp(episode2)
    expect(screen.getByText(/Скачать выбранные \(1\)/)).toBeInTheDocument()
  })

  it('скачивание отправляет запрос для каждой выбранной серии с выбранным качеством', async () => {
    const onStartDownload = renderEpisodeBrowser()

    const episode1 = await screen.findByText('Серия 1')
    const episode2 = await screen.findByText('Серия 2')
    fireEvent.mouseDown(episode1)
    fireEvent.mouseEnter(episode2)
    fireEvent.mouseUp(episode2)

    fireEvent.click(await screen.findByText('AniLibria'))
    fireEvent.click(await screen.findByText('480p (m3u8)'))

    fireEvent.click(screen.getByText(/Скачать выбранные/))

    await waitFor(() => expect(onStartDownload).toHaveBeenCalledTimes(2))
  })
})
